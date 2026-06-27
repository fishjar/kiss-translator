const identity = (value) => value;

// 所有结构化解析器统一输出 `{ id, translation }`，再按 id 排序。
// `order` 只用于同一个 id 重复出现时保持模型原始输出顺序，不对外暴露。
const sortSegments = (segments) =>
  segments
    .slice()
    .sort((a, b) => a.id - b.id || a.order - b.order)
    .map(({ order, ...segment }) => segment);

/**
 * 将不同 AI 提示词格式返回的单条译文对象归一化为统一结构。
 *
 * 该函数同时被完整 JSON 解析和流式 JSON 增量解析复用，避免两条路径对字段别名的支持不一致。
 * `fallbackId` 只用于非流式完整 JSON 数组中模型省略 id 的兼容场景；流式增量解析会传入 NaN，
 * 强制要求模型返回 id，防止流式上屏时把无 id 的片段误归到第 0 段。
 *
 * @param {Object} item 模型返回的单条译文对象
 * @param {number} fallbackId 缺少 id 字段时使用的后备段落序号
 * @param {Object} options 解析选项
 * @param {Function} options.decodeText 译文文本解码函数，非流式 JSON 会用它还原 HTML 实体
 * @returns {{id: number, translation: [string, string]}|null} 归一化后的段落；格式无效时返回 null
 */
export const normalizeTranslationItem = (
  item,
  fallbackId = 0,
  { decodeText = identity } = {}
) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  // 兼容历史 JSON prompt 与流式 JSON parser 的两种字段名：
  // `text` 是当前默认聚合 JSON prompt 的主字段，`translation` 是部分流式/旧格式的别名。
  const rawText =
    item.text !== undefined
      ? item.text
      : item.translation !== undefined
        ? item.translation
        : undefined;
  if (rawText === undefined) {
    return null;
  }

  // id 必须最终是整数。流式路径依赖 id 做段落映射和去重，不能接受无法映射的片段。
  const rawId = item.id ?? fallbackId;
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    return null;
  }

  return {
    id,
    translation: [
      decodeText(String(rawText || "")),
      // `sourceLanguage` 是 XML/JSON 默认字段，`src` 是自定义接口和旧格式中常见的短字段。
      String(item.sourceLanguage || item.src || ""),
    ],
  };
};

/**
 * 从完整字符串中解析 JSON 聚合翻译结果。
 *
 * 非流式响应有时会在 JSON 前后混入说明文字或 Markdown 残留，因此这里先截取首个 `{`/`[`
 * 到最后一个 `}`/`]` 的范围，再尝试 JSON.parse。流式 JSON 不使用这个函数做增量解析，
 * 但会复用 `normalizeTranslationItem()` 处理已完成对象。
 *
 * @param {string} content 完整模型输出
 * @param {Object} options 解析选项
 * @param {Function} options.decodeText 译文文本解码函数
 * @returns {Array<{id: number, translation: [string, string]}>} 解析出的段落列表
 */
export const parseJsonTranslationSegments = (
  content,
  { decodeText = identity } = {}
) => {
  const start = content.search(/(\{|\[)/);
  const end = Math.max(content.lastIndexOf("}"), content.lastIndexOf("]"));
  if (start < 0 || end < 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(content.substring(start, end + 1));
    // 兼容三类完整 JSON 输出：
    // 1. 数组：[{ id, text }]
    // 2. 包装对象：{ translations: [{ id, text }] }
    // 3. 单对象：{ id, text }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed.translations || (parsed.result ? [parsed.result] : [parsed]);

    if (!Array.isArray(list) || list.length === 0) {
      return [];
    }

    const segments = list
      .map((item, index) =>
        normalizeTranslationItem(item, index, { decodeText })
      )
      .filter(Boolean)
      .map((segment, order) => ({ ...segment, order }));

    return sortSegments(segments);
  } catch {
    return [];
  }
};

/**
 * 从原始字符串中解析 XML 风格聚合翻译片段。
 *
 * 这里故意不使用 DOMParser / Trusted Types / DOMPurify：这些浏览器安全层可能会清洗
 * `<root>` / `<t>` 这类自定义标签，导致真实扩展页面解析不到译文。直接扫描原始字符串
 * 可以让流式和非流式对 XML 的行为保持一致。
 *
 * @param {string} content 完整或累积中的模型输出
 * @returns {Array<{id: number, translation: [string, string]}>} 解析出的段落列表
 */
export const parseXmlTranslationSegments = (content) => {
  const segments = [];
  // 仅匹配已经闭合的标签；流式模式下未闭合片段会留到后续 chunk 再解析。
  // 支持 t/item/seg 三种标签名，以兼容不同版本 prompt 或自定义响应格式。
  const tagPattern = /<(t|item|seg)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = tagPattern.exec(content)) !== null) {
    const attrs = match[2] || "";
    const idMatch = attrs.match(/\bid\s*=\s*["']?(\d+)["']?/i);
    const sourceMatch = attrs.match(/\bsourceLanguage\s*=\s*["']([^"']*)["']/i);
    const id = idMatch ? Number(idMatch[1]) : segments.length;

    if (!Number.isInteger(id)) {
      continue;
    }

    segments.push({
      id,
      order: segments.length,
      // XML/HTML 片段里的内部标签需要保留给后续渲染，例如译文中包含 <b>React</b>。
      translation: [match[3].trim(), sourceMatch?.[1] || ""],
    });
  }

  return sortSegments(segments);
};

/**
 * 从行协议字符串中解析聚合翻译片段。
 *
 * 行协议格式为 `id | 译文`。流式解析时必须启用 `requireCompleteLine`，否则最后一行
 * 尚未接收完整就可能被提前上屏；非流式解析则可以处理最后一行。
 *
 * @param {string} content 完整或累积中的模型输出
 * @param {Object} options 解析选项
 * @param {boolean} options.requireCompleteLine 是否只解析以换行结束的完整行
 * @param {Function} options.decodeText 译文文本解码函数
 * @returns {Array<{id: number, translation: [string, string]}>} 解析出的段落列表
 */
export const parseLineTranslationSegments = (
  content,
  { requireCompleteLine = false, decodeText = identity } = {}
) => {
  const endsWithNewline = content.endsWith("\n");
  const lines = content.split("\n");
  const linesToProcess =
    requireCompleteLine && !endsWithNewline ? lines.slice(0, -1) : lines;
  const segments = [];

  for (const line of linesToProcess) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const pipeMatch = trimmedLine.match(/^(\d+)\s*\|\s*(.*)/);
    if (!pipeMatch) continue;

    segments.push({
      id: Number(pipeMatch[1]),
      order: segments.length,
      translation: [
        // 行协议用 <br> 表达译文内部换行，避免模型输出的换行破坏 `id | text` 行结构。
        decodeText(pipeMatch[2].trim().replace(/<br\s*\/?>/gi, "\n")),
        "",
      ],
    });
  }

  return sortSegments(segments);
};

/**
 * 按完整响应的优先级解析结构化翻译结果。
 *
 * 优先级保持与 prompt 约束一致：JSON 最明确，其次 XML，最后 LINE。纯文本兜底不放在这里，
 * 由调用方决定；非流式 `parseAIRes` 会在本函数无结果时按普通文本逐行降级。
 *
 * @param {string} content 完整模型输出
 * @param {Object} options 解析选项
 * @param {Function} options.decodeText 译文文本解码函数
 * @returns {Array<{id: number, translation: [string, string]}>} 解析出的段落列表
 */
export const parseCompleteTranslationSegments = (
  content,
  { decodeText = identity } = {}
) => {
  const jsonSegments = parseJsonTranslationSegments(content, { decodeText });
  if (jsonSegments.length > 0) return jsonSegments;

  const xmlSegments = parseXmlTranslationSegments(content);
  // 注意：XML 解析故意不传入 decodeText(decodeHTMLEntities)
  // 因为 decodeHTMLEntities 底层使用 textContent 会剥离掉译文保留的富文本标签(如 <b>)，应保持原样
  if (xmlSegments.length > 0) return xmlSegments;

  return parseLineTranslationSegments(content, { decodeText });
};
