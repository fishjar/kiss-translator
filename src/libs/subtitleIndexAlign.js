/**
 * @file subtitleIndexAlign.js
 * @description 字幕索引重对齐模块。断句模型返回的 s/e 事件索引偶尔与其 o 原文漂移
 * （±20 词以内），导致时间轴错位。本模块把事件文本拍平成词表，用 o 的词序列在
 * 声称位置附近就近搜索，保守地纠正事件索引；匹配失败或存在歧义时返回 null，
 * 由调用方保持原始行为（误纠正比不纠正更糟）。
 */

const WINDOW = 32;

// 正则必须写字面量：Babel 只转译字面量，运行时 new RegExp 的 \p{L} 在旧目标环境会抛错。
const tokenize = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[-‐–—]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));

const buildWordTable = (events = []) => {
  const table = [];
  const eventStartPos = [];
  for (let ei = 0; ei < events.length; ei++) {
    // 无词事件（如纯符号）前向填充为下一个词的位置，保证声称位置可定位。
    eventStartPos[ei] = table.length;
    for (const w of tokenize(String(events[ei]?.text ?? ""))) {
      table.push({ w, ei });
    }
  }
  return { table, eventStartPos };
};

const makeMatchAt = (table) => (pos, tokens) => {
  if (pos < 0 || pos + tokens.length > table.length) return false;
  for (let k = 0; k < tokens.length; k++) {
    if (table[pos + k].w !== tokens[k]) return false;
  }
  return true;
};

/**
 * 创建字幕索引对齐器。构建时一次性拍平事件词表，realign 为纯函数、无游标，
 * 同一输入永远得到同一结果（流式乱序、重复输出与二次解析都依赖这一点）。
 * @param {Array<Object>} events 字幕事件列表（{text, start, end}）。
 * @returns {{realign: Function}} realign(s, e, o) 返回 {startIdx, endIdx} 或 null。
 */
export const createSubtitleIndexAligner = (events = []) => {
  const { table, eventStartPos } = buildWordTable(events);
  const matchAt = makeMatchAt(table);

  /**
   * 用 o 原文纠正模型声称的事件索引范围。
   * @param {number} s 模型声称的起始事件索引。
   * @param {number} e 模型声称的结束事件索引。
   * @param {string} o 模型输出的原文文本。
   * @returns {{startIdx: number, endIdx: number}|null} 纠正后的索引；无需或无法纠正时为 null。
   */
  const realign = (s, e, o) => {
    const oTokens = tokenize(o);
    const L = oTokens.length;
    if (L < 2 || table.length === 0) return null;

    const cs = clamp(s, 0, events.length - 1);
    const ce = clamp(e, cs, events.length - 1);

    // 快路径：声称范围的词序列与 o 完全一致，无需纠正。
    const claimed = [];
    for (let p = eventStartPos[cs]; p < table.length && table[p].ei <= ce; p++) {
      claimed.push(table[p].w);
    }
    if (claimed.length === L && claimed.every((w, i) => w === oTokens[i])) {
      return null;
    }

    const claimedPos = clamp(eventStartPos[cs], 0, table.length - 1);
    const tail = oTokens.slice(-Math.min(3, L));
    const offsets = L === 2 ? [0] : [0, 1, 2].filter((off) => off + 3 <= L);
    const candidates = new Map();

    for (const offset of offsets) {
      const probe =
        L === 2 ? oTokens.slice(0, 2) : oTokens.slice(offset, offset + 3);
      const lo = Math.max(0, claimedPos - WINDOW);
      const hi = Math.min(table.length - probe.length, claimedPos + WINDOW);
      for (let pos = lo; pos <= hi; pos++) {
        if (!matchAt(pos, probe)) continue;
        const startPos = pos - offset;
        if (startPos < 0) continue;
        const endPos0 = startPos + L - 1;
        // o 词数越过词表末尾多为上下文泄漏或幻觉，绝不夹取到表尾，直接放弃。
        if (endPos0 >= table.length) continue;

        // 尾锚：o 中部多词/少词时用末尾词组就近修正 endPos，按离期望位置最近优先。
        // 尾锚不得越过句首（j >= startPos），否则重复模式会产生倒挂区间。
        const expectedTailStart = startPos + L - tail.length;
        let tailOK = false;
        let endPos = endPos0;
        for (let d = 0; d <= 4 && !tailOK; d++) {
          const js =
            d === 0
              ? [expectedTailStart]
              : [expectedTailStart - d, expectedTailStart + d];
          for (const j of js) {
            if (j >= startPos && matchAt(j, tail)) {
              tailOK = true;
              endPos = j + tail.length - 1;
              break;
            }
          }
        }

        const cand = {
          startPos,
          endPos,
          tailOK,
          offset,
          dist: Math.abs(startPos - claimedPos),
        };
        // tailOK 只取决于 startPos，同一起点的后续 offset 候选必然重复，首个（最小 offset）即最优。
        if (!candidates.has(startPos)) {
          candidates.set(startPos, cand);
        }
      }
    }

    const all = [...candidates.values()];
    if (!all.length) return null;
    // 二词短语（如 in the）极易多处撞车，仅唯一候选可信。
    if (L === 2 && all.length > 1) return null;

    const tailCands = all.filter((c) => c.tailOK);
    let pick = null;
    if (tailCands.length) {
      // 首词命中比 offset 回退可信：先按是否 offset-0 分组，组内按离声称位置最近。
      tailCands.sort(
        (a, b) => (a.offset > 0) - (b.offset > 0) || a.dist - b.dist
      );
      const [top, second] = tailCands;
      // 同组同距视为歧义，宁可不纠正。
      if (
        second &&
        (top.offset > 0) === (second.offset > 0) &&
        top.dist === second.dist
      ) {
        return null;
      }
      pick = top;
    } else {
      // 无尾锚时只接受唯一、首词命中且足够长的候选。
      if (all.length !== 1 || all[0].offset !== 0 || L < 3) return null;
      pick = all[0];
    }

    const startIdx = table[pick.startPos].ei;
    const endIdx = Math.max(startIdx, table[pick.endPos].ei);
    if (startIdx === cs && endIdx === ce) return null;
    return { startIdx, endIdx };
  };

  return { realign };
};

const GATE = {
  minSegs: 10, // 段数太少统计不稳，不启用门控
  minWords: 150, // 文本词量太小统计不稳，不启用门控
  wholeRatio: 0.15, // 整响应「声称词数/文本词数」偏差阈值
  winSize: 10, // 滑动窗口段数，识别被健康前缀稀释的局部崩坏
  winMinWords: 80,
  winLo: 0.8,
  winHi: 1.25,
  cumDrift: 80, // 任一前缀的累计词数亏空阈值
  spacedRatio: 0.6, // 词分隔守卫：能分出 3 词的段需占六成词量，挡住 CJK
  backtrack: 40, // 重锚定游标允许的回溯词数，需覆盖模型交错重发段的回跳幅度
  forward: 200, // 重锚定单步向前搜索上限；重复口头禅的远处假匹配不得拖走游标
  shortBack: 10, // 短段（<3 词）回溯窗口：真实感叹词就贴在游标附近
  shortForward: 40, // 短段前向窗口
  shortOneDist: 8, // 单词短段的最大可信锚定距离
  maxMisses: 5, // 连续锚定失败上限，超出后放弃剩余段
  accept: 0.7, // 验收下限：锚定段占比与锚定词覆盖率
};

/**
 * 检测整份断句响应的 s/e 是否整体失准（长枚举下模型计数崩坏，实测比值可低至 0.71
 * 且持续十分钟不自愈），失准则按 o 文本做游标单调的全局重锚定。
 * 返回 null 表示响应可信或重锚定未达验收标准，调用方保持原结果；
 * 返回数组则为替换结果：锚定段带 _aei（锚定终点事件索引，供尾句重试判定覆盖范围）、
 * _reanchored 标记与 _alo/_ahi（本响应事件时间范围，provider 据此清理失准草稿），
 * _si/_ei 保留模型原始值。不足 3 词的短段无法用探针可靠锚定，在游标近旁就近
 * 锚定，找不到或歧义时整段丢弃（实测幻影短段可提前语音 160 秒，错误时间上屏
 * 比丢一个感叹词更糟）。
 * @param {Array<Object>} segments parseIndexSubtitleRes 构建的字幕段。
 * @param {Array<Object>} events 当前请求的事件列表。
 * @returns {Array<Object>|null}
 */
export const reanchorIfUntrusted = (segments = [], events = []) => {
  if (segments.length < GATE.minSegs || !events.length) return null;

  const { table, eventStartPos } = buildWordTable(events);
  if (!table.length) return null;
  const matchAt = makeMatchAt(table);
  const eventEndPos = (ei) =>
    ei + 1 < events.length ? eventStartPos[ei + 1] : table.length;

  const stats = segments.map((sub) => {
    const cs = clamp(Number(sub._si) || 0, 0, events.length - 1);
    const ce = clamp(Number(sub._ei) || 0, cs, events.length - 1);
    const oTokens = tokenize(sub.text);
    return {
      oTokens,
      oTok: oTokens.length,
      claimedTok: Math.max(0, eventEndPos(ce) - eventStartPos[cs]),
    };
  });

  const totalO = stats.reduce((acc, s) => acc + s.oTok, 0);
  if (totalO < GATE.minWords) return null;
  // 分隔度按词量而非段数统计：话痨响应的大量单词感叹段不稀释守卫，CJK 段依旧不达标。
  const spacedWords = stats.reduce(
    (acc, s) => acc + (s.oTok >= 3 ? s.oTok : 0),
    0
  );
  if (spacedWords / totalO < GATE.spacedRatio) return null;

  // 三路并联门控。整体比值会被健康前缀稀释（实测崩坏响应混算后仅 0.857），
  // 滑动窗口与前缀累计亏空负责补位。
  const totalClaimed = stats.reduce((acc, s) => acc + s.claimedTok, 0);
  let tripped = Math.abs(totalClaimed / totalO - 1) > GATE.wholeRatio;
  let cum = 0;
  for (let i = 0; i < stats.length && !tripped; i++) {
    cum += stats[i].claimedTok - stats[i].oTok;
    if (Math.abs(cum) >= GATE.cumDrift) {
      tripped = true;
      break;
    }
    if (i >= GATE.winSize - 1) {
      let winO = 0;
      let winC = 0;
      for (let k = i - GATE.winSize + 1; k <= i; k++) {
        winO += stats[k].oTok;
        winC += stats[k].claimedTok;
      }
      if (winO >= GATE.winMinWords) {
        const ratio = winC / winO;
        if (ratio < GATE.winLo || ratio > GATE.winHi) tripped = true;
      }
    }
  }
  if (!tripped) return null;

  // 游标单调重锚定：从上一段锚定终点接续向前找。
  // miss 不动游标，避免幻觉段拖歪整条链；连续 miss 过多则放弃剩余段。
  const out = [];
  let cursor = 0;
  let misses = 0;
  let anchoring = true;
  let anchoredSegs = 0;
  let anchoredWords = 0;
  let judgedSegs = 0;
  let judgedWords = 0;
  let prevEndPos = -1;
  let prevAnchored = null;

  // 锚定段统一出口。模型常先重发感叹词再重发整句：同 start 且被当前段整体
  // 覆盖的上一锚定段以长段为准，移除并回滚其计数。
  const pushAnchored = (sub, L, startIdx, endIdx) => {
    const cue = {
      ...sub,
      start: events[startIdx].start,
      end: events[endIdx].end,
      _aei: endIdx,
      _reanchored: true,
    };
    if (
      prevAnchored &&
      prevAnchored.startMs === cue.start &&
      prevAnchored.aei <= endIdx
    ) {
      out.splice(prevAnchored.at, 1);
      anchoredSegs -= 1;
      anchoredWords -= prevAnchored.L;
      judgedSegs -= 1;
      judgedWords -= prevAnchored.L;
    }
    out.push(cue);
    prevAnchored = { at: out.length - 1, startMs: cue.start, aei: endIdx, L };
    anchoredSegs += 1;
    anchoredWords += L;
    judgedSegs += 1;
    judgedWords += L;
  };

  for (let i = 0; i < segments.length; i++) {
    const sub = segments[i];
    const { oTokens } = stats[i];
    const L = oTokens.length;
    if (!anchoring) {
      out.push(sub);
      judgedSegs += 1;
      judgedWords += L;
      continue;
    }

    if (L < 3) {
      // 短段只在游标近旁锚定；无词可验的纯符号段保持原样且不参与验收。
      if (!L) {
        out.push(sub);
        continue;
      }
      // 一字母 token 探针过弱（如 "A."），任何位置都可能撞上，直接丢弃。
      if (L === 1 && oTokens[0].length < 2) continue;
      let st = -1;
      let bestDist = Infinity;
      let tied = false;
      const lo = Math.max(0, cursor - GATE.shortBack);
      const hi = Math.min(table.length - L, cursor + GATE.shortForward);
      for (let pos = lo; pos <= hi; pos++) {
        if (!matchAt(pos, oTokens)) continue;
        const dist = Math.abs(pos - cursor);
        if (dist < bestDist) {
          bestDist = dist;
          st = pos;
          tied = false;
        } else if (dist === bestDist) {
          tied = true;
        }
      }
      // 找不到、等距歧义、落入已消费区（重复重发）或单词段离游标过远都丢弃，
      // 不动游标也不影响 miss 预算。
      if (
        st < 0 ||
        tied ||
        st <= prevEndPos ||
        (L === 1 && bestDist > GATE.shortOneDist)
      ) {
        continue;
      }
      const endPos = st + L - 1;
      const startIdx = table[st].ei;
      pushAnchored(sub, L, startIdx, Math.max(startIdx, table[endPos].ei));
      cursor = endPos + 1;
      prevEndPos = endPos;
      misses = 0;
      continue;
    }

    const probes = [0, 1, 2]
      .filter((off) => off + 3 <= L)
      .map((off) => [off, oTokens.slice(off, off + 3)]);
    // 取离游标最近的候选：顺序文本的真实位置就在游标附近，
    // 重复口头禅落在回溯区或远处的假匹配都会因距离更远而落选；等距偏向顺流方向。
    let st = -1;
    let bestDist = Infinity;
    const lo = Math.max(0, cursor - GATE.backtrack);
    const hi = Math.min(table.length - L, cursor + GATE.forward);
    for (let pos = lo; pos <= hi && bestDist > 0; pos++) {
      for (const [off, probe] of probes) {
        if (matchAt(pos + off, probe)) {
          const dist = Math.abs(pos - cursor);
          if (dist < bestDist || (dist === bestDist && st < cursor)) {
            bestDist = dist;
            st = pos;
          }
          break;
        }
      }
    }

    if (st === -1) {
      out.push(sub);
      judgedSegs += 1;
      judgedWords += L;
      if (++misses >= GATE.maxMisses) anchoring = false;
      continue;
    }

    const tail = oTokens.slice(-3);
    const expected = st + L - tail.length;
    let endPos = st + L - 1;
    let tailDone = false;
    for (let d = 0; d <= 4 && !tailDone; d++) {
      const js = d === 0 ? [expected] : [expected - d, expected + d];
      for (const j of js) {
        if (j >= st && matchAt(j, tail)) {
          endPos = j + tail.length - 1;
          tailDone = true;
          break;
        }
      }
    }

    // 模型重复输出的段会锚到已消费的位置，保留先到者。
    if (st <= prevEndPos && prevEndPos - st + 1 > (endPos - st + 1) / 2) {
      continue;
    }

    const startIdx = table[st].ei;
    pushAnchored(sub, L, startIdx, Math.max(startIdx, table[endPos].ei));
    cursor = endPos + 1;
    prevEndPos = endPos;
    misses = 0;
  }

  // 验收分母只含真正接受评判的段：丢弃的短段与重复段不计（话痨响应的感叹词
  // 不再稀释通过率），保留原样的失败长段计入，防止大量实质 miss 仍然放行。
  if (
    !judgedSegs ||
    anchoredSegs / judgedSegs < GATE.accept ||
    anchoredWords / Math.max(1, judgedWords) < GATE.accept
  ) {
    return null;
  }

  // 携带整个响应的事件时间范围：草稿清扫若只按输出 cue 的 min/max，首尾短段
  // 被丢弃时会留缝放过缝隙里的幻影草稿。
  const rangeLo = events[0].start;
  const rangeHi = events[events.length - 1].end;
  for (const cue of out) {
    if (cue._reanchored) {
      cue._alo = rangeLo;
      cue._ahi = rangeHi;
    }
  }
  return out;
};
