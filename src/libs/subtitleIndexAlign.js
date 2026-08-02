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

/**
 * 创建字幕索引对齐器。构建时一次性拍平事件词表，realign 为纯函数、无游标，
 * 同一输入永远得到同一结果（流式乱序、重复输出与二次解析都依赖这一点）。
 * @param {Array<Object>} events 字幕事件列表（{text, start, end}）。
 * @returns {{realign: Function}} realign(s, e, o) 返回 {startIdx, endIdx} 或 null。
 */
export const createSubtitleIndexAligner = (events = []) => {
  const table = [];
  const eventStartPos = [];
  for (let ei = 0; ei < events.length; ei++) {
    // 无词事件（如纯符号）前向填充为下一个词的位置，保证声称位置可定位。
    eventStartPos[ei] = table.length;
    for (const w of tokenize(String(events[ei]?.text ?? ""))) {
      table.push({ w, ei });
    }
  }

  const matchAt = (pos, tokens) => {
    if (pos < 0 || pos + tokens.length > table.length) return false;
    for (let k = 0; k < tokens.length; k++) {
      if (table[pos + k].w !== tokens[k]) return false;
    }
    return true;
  };

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
    for (
      let p = eventStartPos[cs];
      p < table.length && table[p].ei <= ce;
      p++
    ) {
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
        Boolean(top.offset > 0) === Boolean(second.offset > 0) &&
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
