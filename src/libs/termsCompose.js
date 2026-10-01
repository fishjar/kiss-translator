// 术语库合成纯函数模块：三级术语（自定义 / 订阅 / 规则）→ 单一 terms 文本
//
// 无 DOM、无日志依赖，与 terms.js（terms.js:2）/ termsImport.js 同一纪律，
// 供 Translator / UI / 单元测试复用。
//
// ## 为什么在文本层合成，而不是分别 parse 再合并 term 数组
//
// parseTerms 的同 key 冲突检测发生在**单次调用内部**（terms.js:663-696 的 seenKeys）。
// 若分别 parse 三个来源再合并数组，跨来源冲突就**永远不会产生**——而冲突恰恰
// 发生在跨来源（自定义库把 API 译作"接口"，订阅库译作"API 接口"）。
// 文本层合成后交给 parseTerms 一次解析，才能复用全部诊断能力。
//
// ## 优先级与去重（决策 D4 = 方案 A）
//
// 契约：① 用户自定义 > ② 订阅源 > ③ 规则 terms（沿用现有分层）。
// 实现方式：按优先级从高到低把段压入文本，让 parseTerms 的"首次出现胜出"生效。
//
// 但**跨层同名不同译**会被 parseTerms 判为致命冲突（conflicting-mapping ∈
// FATAL_DIAGNOSTIC_TYPES，terms.js:51-58），而"高层级覆盖"是预期内的正常行为。
// 故本模块在合成前**主动预去重**，把跨层覆盖消化掉，让**同层内**的真冲突
// 留给 parseTerms 报出（那才是用户真正写错的地方）。
//
// ## ⚠️ 两处必须由本模块自行上报的冲突（parseTerms 看不到）
//
// 预去重会让部分段**根本不进入文本**，parseTerms 自然无法报告它们。
// 已知两类：
//   1. `evictedSameLayerConflicts` —— 低层存在同层冲突组，且该组被高层整体覆盖。
//      冲突段退出文本 → parseTerms 不报。实测反例：
//      `composeTermText("X,自定义", "X,1\nX,2", "")` 的输出文本无任何诊断，
//      但订阅层确实已损坏。**必须由本模块上报**（消费方不能只看 parseTerms）。
//   2. `shadowed` —— 被覆盖的条目本身（正常语义，非错误）。
//
// 消费方若需要完整的"哪里有问题"视图，必须同时读
// `parsed.diagnostics`（同层冲突）与 `evictedSameLayerConflicts`（被覆盖的同层冲突）。
import { FATAL_DIAGNOSTIC_TYPES } from "./terms";

/** 来源优先级：数字越小优先级越高 */
export const TERM_SOURCES = ["custom", "subscription", "rule"];
const PRIORITY = Object.fromEntries(TERM_SOURCES.map((s, i) => [s, i]));

/**
 * 取一行的 key / value。
 *
 * 必须与 parseTerms 的切分规则**逐字一致**（terms.js:576-583）：
 * 用**最后一个**英文逗号切分，且两侧 trim。
 *
 * 已实测与引擎等价（含 `a,b,c` → key="a,b"、`key,` → value=""、
 * `  spaced ,  val ` → 两侧 trim 等边界）。
 *
 * @param {string} line
 * @returns {{key: string, value: string}}
 */
export function extractKeyValue(line) {
  const t = typeof line === "string" ? line.trim() : "";
  const i = t.lastIndexOf(",");
  if (i === -1) return { key: t, value: "" };
  return { key: t.substring(0, i).trim(), value: t.substring(i + 1).trim() };
}

/**
 * 把一条 key/value 渲染为 terms 文本行。
 * value 为空时只写 key（不带尾巴逗号）——`key,` 会触发 extra-comma 非致命提醒
 * （terms.js:50 注释），术语库合成时大量产生无意义提醒。
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
export function renderEntry(key, value) {
  return value === "" ? key : `${key},${value}`;
}

/**
 * 三级术语合成。
 *
 * @param {string} customText ① 用户自定义术语文本
 * @param {string} subText    ② 订阅源术语文本（已按启用源拼接）
 * @param {string} ruleText   ③ 规则 terms 字段
 * @returns {{
 *   text: string,
 *   originMap: Array<{source: string, lineIndexInSource: number}>,
 *   shadowed: Array<{source: string, key: string, value: string, line: string, shadowedBy: string}>,
 *   sameLayerConflicts: Array<{key: string, sources: string[]}>,
 * }}
 */
export function composeTermText(customText, subText, ruleText) {
  // 旧签名（三层）适配到新签名（有序多源）。
  // 保留旧签名是为了不动既有 29 个测试的语义基线；生产路径走 composeLibraries。
  return composeSources([
    { source: "custom", id: "custom", text: customText },
    { source: "subscription", id: "subscription", text: subText },
    { source: "rule", id: "rule", text: ruleText },
  ]);
}

/**
 * 按**加载顺序**合成多个术语源（多库模型，人类已确认）。
 *
 * 语义：靠前的源优先级高 —— 同名 key 由靠前的源胜出（"前覆盖后"）。
 * 这一维顺序取代了旧版的"三级层"概念，库只是容器，允许同名。
 *
 * 冲突上报的粒度从"层"变为"源（库）"：
 * - `sameLayerConflicts` → 同一**源内**的冲突（用户在某库里写错了）
 * - `evictedSameLayerConflicts` → 该冲突又被更高优先级的源覆盖而整体退出文本
 *
 * @param {Array<{source?: string, id?: string, name?: string, text?: string}>} sources
 *   按加载顺序排列（索引 0 优先级最高）
 * @returns {object} 同 composeTermText
 */
export function composeSources(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const collected = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const text = item.text;
    // 源的标识：优先用 id（库 id，稳定），回退 source（旧的三层名）
    const source = item.id || item.source || "custom";
    if (!text || typeof text !== "string" || !text.trim()) continue;
    // 与 terms.js:569 使用同一分隔符，保证段号切分与引擎一致
    text.split(/\n|;/).forEach((raw, i) => {
      const trimmed = raw.trim();
      if (!trimmed) return; // 空段静默跳过（terms.js:574）
      const { key, value } = extractKeyValue(raw);
      collected.push({
        source,
        sourceName: item.name || source,
        key,
        value,
        line: trimmed,
        lineIndexInSource: i + 1,
      });
    });
  }

  const winner = new Map(); // key -> keep 数组下标
  const keep = [];
  const shadowed = [];
  const sameLayer = new Map(); // key -> Set(source)
  // 记录被高层覆盖掉的**同层冲突组**：这些冲突原本应由 parseTerms 报出，
  // 但被覆盖后不会进入文本，故必须由本模块单独上报。
  const evictedSameLayer = new Map(); // key -> Array<seg>

  // 【关键】同层冲突必须在**收集阶段**就检测，而不是在去重循环里。
  //
  // 原因（实测）：去重循环有两条丢弃路径——"被更高层替换"与"低于当前层而被丢弃"，
  // 同层冲突组可能走其中任意一条。若只在某一条上挂钩，另一条就会静默吞掉冲突。
  // 实测反例：custom 已占位时，subscription 的两条冲突段走的是"被丢弃"路径。
  // 故这里先按 (source,key) 归组，任何组内出现多个不同 value 即记为冲突，
  // 之后无论该组最终是否进入文本，都能如实上报。
  const groupsBySourceKey = new Map(); // "source\u0000key" -> Array<seg>
  for (const seg of collected) {
    const k = `${seg.source}\u0000${seg.key}`;
    if (!groupsBySourceKey.has(k)) groupsBySourceKey.set(k, []);
    groupsBySourceKey.get(k).push(seg);
  }
  const conflictedGroups = new Map(); // "source\u0000key" -> segs
  for (const [k, segs] of groupsBySourceKey) {
    const values = new Set(segs.map((s) => s.value));
    if (segs.length > 1 && values.size > 1) conflictedGroups.set(k, segs);
  }

  for (const seg of collected) {
    const prevIdx = winner.get(seg.key);
    if (prevIdx === undefined) {
      winner.set(seg.key, keep.length);
      keep.push(seg);
      continue;
    }

    const prev = keep[prevIdx];

    if (prev.source === seg.source) {
      // 【关键】同层重复：两条都保留，交给 parseTerms 报 conflicting-mapping。
      // 若在此静默去重，会吞掉用户在自己规则里写错时本该看到的致命诊断。
      keep.push(seg);
      if (!sameLayer.has(seg.key)) sameLayer.set(seg.key, new Set([prev.source]));
      sameLayer.get(seg.key).add(seg.source);
      continue;
    }

    if (prev.value === seg.value) {
      // 【陷阱】跨层"完全相同的映射"不是"被覆盖"，只是重复。
      // 静默丢弃当前段，不记入 shadowed，避免 UI 刷出无意义的被覆盖条目。
      continue;
    }

    if (PRIORITY[seg.source] < PRIORITY[prev.source]) {
      shadowed.push({ ...prev, shadowedBy: seg.source });
      keep[prevIdx] = seg;
      // 被替换的 prev 所属的同层冲突组已整体退出文本
      const gk = `${prev.source}\u0000${prev.key}`;
      if (conflictedGroups.has(gk) && !evictedSameLayer.has(prev.key)) {
        evictedSameLayer.set(prev.key, conflictedGroups.get(gk));
      }
      if (sameLayer.has(prev.key)) {
        sameLayer.get(prev.key).delete(prev.source);
        if (sameLayer.get(prev.key).size === 0) sameLayer.delete(prev.key);
      }
    } else {
      shadowed.push({ ...seg, shadowedBy: prev.source });
      // 当前段被丢弃；若它属于某个同层冲突组，该组也不会进入文本
      const gk = `${seg.source}\u0000${seg.key}`;
      if (conflictedGroups.has(gk) && !evictedSameLayer.has(seg.key)) {
        evictedSameLayer.set(seg.key, conflictedGroups.get(gk));
      }
    }
  }

  return {
    text: keep.map((s) => renderEntry(s.key, s.value)).join("\n"),
    originMap: keep.map((s) => ({
      source: s.source,
      lineIndexInSource: s.lineIndexInSource,
    })),
    shadowed,
    sameLayerConflicts: [...sameLayer.entries()].map(([key, sources]) => ({
      key,
      sources: [...sources],
    })),
    // 被高层覆盖而整体退出文本的**同层冲突组**。
    // 这些冲突 parseTerms 看不到（相关段已不在文本中），必须由本模块上报，
    // 否则用户的订阅源/规则内部损坏会在"高层也定义了这个 key"时被静默吞掉。
    evictedSameLayerConflicts: [...evictedSameLayer.entries()].map(
      ([key, segs]) => ({
        key,
        source: segs[0]?.source,
        values: segs.map((s) => s.value),
        segments: segs.map((s) => ({
          source: s.source,
          line: s.line,
          lineIndexInSource: s.lineIndexInSource,
        })),
      })
    ),
  };
}

/**
 * 合成并交给 parseTerms 校验，返回一份可直接展示的诊断摘要。
 * 供 UI（术语库页面 / Playground）使用；生产 Translator 路径不需要。
 *
 * @param {string} customText
 * @param {string} subText
 * @param {string} ruleText
 * @param {(text: string, options?: object) => object} parseTermsFn 注入 parseTerms，便于测试与解耦
 * @returns {object} { text, originMap, shadowed, parsed, fatalDiagnostics }
 */
export function composeAndValidate(
  customText,
  subText,
  ruleText,
  parseTermsFn
) {
  const composed = composeTermText(customText, subText, ruleText);
  const parsed =
    typeof parseTermsFn === "function"
      ? parseTermsFn(composed.text, { fullDiagnostics: true })
      : null;

  const fatalDiagnostics = parsed
    ? parsed.diagnostics.filter((d) => FATAL_DIAGNOSTIC_TYPES.has(d.type))
    : [];

  return { ...composed, parsed, fatalDiagnostics };
}

/**
 * 多库版：按加载顺序合成并校验（UI 与生产路径均可使用）。
 *
 * 与 composeAndValidate 的区别：输入是**有序源数组**而非固定的三层文本。
 *
 * @param {Array<{source?: string, id?: string, name?: string, text?: string}>} sources
 * @param {(text: string, options?: object) => object} parseTermsFn
 * @param {{fullDiagnostics?: boolean}} [options] 由调用方决定是否跑 O(n²) 完整诊断
 * @returns {object} { text, originMap, shadowed, sameLayerConflicts,
 *                     evictedSameLayerConflicts, parsed, fatalDiagnostics }
 */
export function composeLibrariesAndValidate(
  sources,
  parseTermsFn,
  { fullDiagnostics = true } = {}
) {
  const composed = composeSources(sources);
  const parsed =
    typeof parseTermsFn === "function"
      ? parseTermsFn(composed.text, { fullDiagnostics })
      : null;

  const fatalDiagnostics = parsed
    ? parsed.diagnostics.filter((d) => FATAL_DIAGNOSTIC_TYPES.has(d.type))
    : [];

  return { ...composed, parsed, fatalDiagnostics };
}