// 订阅术语源（Subscription Terms Source）模块
//
// 逐条复刻 src/libs/subRules.js 的四函数模式，差异见下：
// - 校验改为术语格式校验（复用 termsImport 的嗅探与解析）
// - **不做** `!isAllchar(pattern, GLOBAL_KEY)` 过滤：那条过滤是保护"规则"的
//   （防止订阅规则劫持全局设置，subRules.js:32-35）。术语是叠加语义，
//   不存在"劫持全局"的概念。
// - 按**源粒度**记录时间戳，修正 subRules.js:69-73 REVIEW 注释记载的既有缺陷
//   （原实现中任一源失败后仍推进全局 subRulesSyncAt，导致失败源 24h 内不重试）。
//
// 不参与云同步：缓存写入 STOKEY_TERMCACHE_PREFIX + url，该键位不在 storage.js 的
// SYNC_KEYS 白名单中，故天然不会被同步（见 spec §4.4）。
import {
  getSyncWithDefault,
  putSync,
  getSubTerms,
  setSubTerms,
  delSubTerms,
} from "./storage";
import { apiFetch } from "../apis";
import { parseImport } from "./termsImport";
import { parseTerms } from "./terms";
import { kissLog } from "./log";

/** 订阅源文本长度上限（字符）。超出即拒绝，保护页面不被巨型词库卡死。 */
export const MAX_SUB_TERMS_TEXT_LENGTH = 1024 * 1024; // 1 MB

/** 自动同步间隔：24 小时 */
const SYNC_INTERVAL = 24 * 60 * 60 * 1000;

/**
 * dataCaches 中术语源键的前缀。
 * 加前缀是为了避免同一 URL 同时作为规则源与术语源时互相覆盖时间戳。
 */
export const TERMS_CACHE_PREFIX = "terms:";

/**
 * 判断内容是否为 HTML 文档。
 *
 * 用途：`.txt` 解析路径是**透传**的，HTML 错误页（如 404 页、CDN 拦截页）
 * 会被当作一整行 terms 文本而产生 1 个条目，从而绕过「0 条目守卫」并污染缓存。
 * 因此必须在解析前显式识别并拒绝。
 *
 * @param {string} trimmed 已 trimStart 的内容
 * @returns {boolean}
 */
function isHtmlDocument(trimmed) {
  if (!trimmed) return false;
  // 常见 HTML 起始形态：DOCTYPE / <html / <?xml / 注释包裹的 HTML
  const head = trimmed.slice(0, 200).toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<?xml") ||
    (head.startsWith("<!--") && head.includes("<html"))
  );
}

/**
 * 按内容判断是否为 CSV（首条非空行含英文逗号）。
 *
 * `termsImport.detectFormat` 的纯内容嗅探不返回 "csv"（只认 `.csv` 后缀），
 * 而订阅 URL 常无有意义后缀，故此处自行判断。
 *
 * 判据：首条非空行里，英文逗号**不是**位于行尾（避免把 `key,` 这种"省略译文"
 * 写法误判为 CSV——那在 TXT 语义里是一行合法术语）。
 *
 * @param {string} content
 * @returns {boolean}
 */
function looksLikeCsv(content) {
  const firstLine = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "");
  if (!firstLine) return false;
  const comma = firstLine.indexOf(",");
  if (comma === -1) return false;
  // 逗号后仍有内容才算 CSV 的两列形态
  return firstLine.slice(comma + 1).trim() !== "";
}

/**
 * 读取指定术语订阅源的最近同步时间戳。
 * @param {string} url
 * @returns {Promise<number>} 时间戳，从未同步过则为 0
 */
export const getSubTermsSyncAt = async (url) => {
  const { dataCaches = {} } = await getSyncWithDefault();
  return dataCaches[TERMS_CACHE_PREFIX + url] || 0;
};

/**
 * 更新指定术语订阅源的本地缓存同步时间戳（按源粒度）。
 * @param {string} url
 * @param {number} [timestamp]
 */
export const updateSubTermsSyncAt = async (url, timestamp = Date.now()) => {
  const { dataCaches = {} } = await getSyncWithDefault();
  dataCaches[TERMS_CACHE_PREFIX + url] = timestamp;
  await putSync({ dataCaches });
};

/**
 * 把订阅源返回的原始内容解析为 terms 文本。
 *
 * 格式嗅探顺序（见 spec §4.1）：HTTP 的 Content-Type 在 GitHub Raw / CDN 上不可靠，
 * 因此按内容嗅探而非响应头：
 *   1. trim 后以 "{" 或 "[" 开头 → JSON
 *   2. HTML 文档 → 明确拒绝（见下）
 *   3. 首行含英文逗号 → CSV
 *   4. 否则 → TXT 透传
 *
 * ⚠️ 注意 `termsImport.detectFormat` **不能**用于此处：它只在有 `.csv` 后缀时才返回
 * "csv"，纯内容嗅探下 CSV 会被判成 txt。订阅源的 URL 常常没有有意义的后缀
 * （GitHub Raw / Gist Raw / CDN），故本模块自行补上"按内容判 CSV"这一步。
 *
 * ⚠️ HTML 必须显式拒绝：`.txt` 路径是**透传**的，HTML 错误页会被当成一整行
 * `key,value` 文本而产生 1 个条目，从而绕过"0 条目"守卫并污染缓存。
 * 这是实测发现的问题（judge 2026-10-01）。
 *
 * @param {*} raw 远程返回的原始内容
 * @returns {{text: string, entries: number, errors: Array, warnings: Array, format: string, error?: Error}}
 */
export const parseTermsSource = (raw) => {
  const content = typeof raw === "string" ? raw : String(raw ?? "");
  const trimmed = content.trimStart();
  const head = trimmed.slice(0, 1);

  if (isHtmlDocument(trimmed)) {
    return {
      text: "",
      entries: 0,
      errors: [{ line: 0, raw: "", reason: "html-response" }],
      warnings: [],
      format: "html",
    };
  }

  let format;
  if (head === "{" || head === "[") {
    format = "json";
  } else if (looksLikeCsv(content)) {
    format = "csv";
  } else {
    format = "txt";
  }

  let result;
  try {
    result = parseImport(content, format);
  } catch (err) {
    // JSON 解析失败会抛错（parseImport 的实现约定），统一转为可上报的错误结果
    return {
      text: "",
      entries: 0,
      errors: [{ line: 0, raw: "", reason: "parse-failed" }],
      warnings: [],
      format,
      error: err,
    };
  }

  return { ...result, format, meta: extractSubscriptionMeta(content, format) };
};

/**
 * 术语订阅库的元信息格式契约（人类已确认）。
 *
 * 约定：**建立订阅的人必须自己写**元信息。
 *   - `name`        必填。缺失 → 拒绝加载（明确的错误，而非静默使用 URL）
 *   - `author`      可选。优先用文件内声明；缺失则尝试从 GitHub 原生 URL 解析
 *   - `description` 可选。缺失则 UI 不显示该行
 *
 * 兼容性：`terms` 接受既有三种形态（数组 / 对象映射 / 纯文本），
 * 统一交给 termsImport.parseJsonImport 处理，不在此重复实现。
 *
 * @param {string} content 原始内容
 * @param {string} format 已嗅探出的格式
 * @returns {{name?: string, description?: string, author?: string, homepage?: string}|null}
 *   非 JSON 或非对象形态时返回 null（表示"此文件没有元信息"）
 */
export function extractSubscriptionMeta(content, format) {
  if (format !== "json") return null;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  // 裸数组 / 裸对象映射 → 没有元信息容器
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  // 带 terms 字段才认为是"库描述文件"；否则可能是对象映射形态，无元信息
  if (!("terms" in parsed)) return null;

  const str = (v) => (typeof v === "string" ? v.trim() : "");
  return {
    name: str(parsed.name),
    description: str(parsed.description),
    author: str(parsed.author),
    homepage: str(parsed.homepage),
  };
}

/**
 * 从 GitHub 原生 URL 解析作者名（兜底用）。
 *
 * ⚠️ **仅限明确的 GitHub 原生形态**，不可泛化：
 *   - `https://gist.githubusercontent.com/<user>/<id>/raw/...` → `<user>`
 *   - `https://raw.githubusercontent.com/<user>/<repo>/<branch>/...` → `<user>`
 *
 * **不解析 GitHub Pages**（`https://<user>.github.io/<repo>/...`）：
 * 该路径段是**仓库名**而非作者名。现有官方订阅源
 * `https://fishjar.github.io/kiss-rules/kiss-rules_v2.json` 中 `fishjar`
 * 恰好等于仓库所有者，但这是巧合而非规则 —— 有人 fork 后部署到自己的
 * Pages 时，取到的会是部署者而非词库作者。故不猜测。
 *
 * @param {string} url
 * @returns {string} `@user` 形式；无法解析时返回空串
 */
export function parseAuthorFromUrl(url) {
  if (!url || typeof url !== "string") return "";
  const patterns = [
    /^https?:\/\/gist\.githubusercontent\.com\/([^/]+)\//i,
    /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\//i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m && m[1]) {
      const user = decodeURIComponent(m[1]).trim();
      // 排除保留段名，避免把 "raw" 之类当成作者
      if (user && user !== "raw") return `@${user}`;
    }
  }
  return "";
}

/**
 * 解析订阅库的最终署名：文件声明优先，URL 解析兜底。
 * @param {{author?: string}|null} meta
 * @param {string} url
 * @returns {string} `@name` 或空串（空串 → UI 不显示署名行）
 */
export function resolveSubscriptionAuthor(meta, url) {
  const declared = meta?.author;
  if (declared) return declared.startsWith("@") ? declared : `@${declared}`;
  return parseAuthorFromUrl(url);
}

/**
 * 从远程 URL 同步/下载订阅术语源，校验后存入本地缓存。
 *
 * 守卫（缺一不可）：
 * - 解析出 0 条目 → 抛错，且**不写缓存**（防止 404/HTML 错误页污染缓存）
 * - 文本超长 → 抛错，且**不写缓存**（防止巨型词库卡死页面）
 * - 失败时**保留旧缓存**（不能因为一次拉取失败就让用户的术语消失）
 *
 * @param {string} url 订阅源 URL
 * @param {{shouldCommit?: () => boolean}} [options]
 * @returns {Promise<{text: string, entries: number, errors: Array, warnings: Array, format: string}>}
 */
export const syncSubTerms = async (url, { shouldCommit = () => true } = {}) => {
  const res = await apiFetch(url);
  const parsed = parseTermsSource(res);

  if (parsed.text.length > MAX_SUB_TERMS_TEXT_LENGTH) {
    throw new Error(
      `terms source too large: ${parsed.text.length} > ${MAX_SUB_TERMS_TEXT_LENGTH}`
    );
  }
  if (parsed.entries === 0) {
    throw new Error("empty terms source");
  }

  // 元信息契约（人类已确认）：
  //   - 若订阅文件带元信息容器（见 extractSubscriptionMeta），则 name **必填**。
  //   - 裸数组/裸映射（无元信息容器）不强制 —— 这是既有格式，需继续可用。
  //
  // 为什么 name 缺失要**拒绝**而不是用 URL 兜底：库名会随云同步传播并展示给
  // 用户，用 URL 当名字会让卡片显示成一长串地址。明确报错能促使作者补上，
  // 且错误信息说明"可能不是术语库订阅文件"，可帮用户识别误订阅（如把
  // kiss-rules 规则文件当术语库订阅 —— 那是裸数组，会走上面的非强制分支）。
  if (parsed.meta && !parsed.meta.name) {
    throw new Error("subscription missing required field: name");
  }

  // 引擎级预检：只做 fast 模式，避免 O(n²) 跨术语冲突分析阻塞订阅流程。
  // 注意：即使 hasErrors 为真也**不阻断缓存** —— parseTerms 已逐条排除非法项，
  // 返回的 terms 是可安全应用的合法集合（translator.js:1283-1284 同一判定）。
  const check = parseTerms(parsed.text, { fullDiagnostics: false });
  if (check.invalid.length > 0) {
    kissLog(`sub terms invalid regex (skipped): ${url}`, check.invalid.length);
  }

  if (shouldCommit()) {
    await setSubTerms(url, {
      text: parsed.text,
      entries: check.terms.length,
      format: parsed.format,
      fetchedAt: Date.now(),
      // 元信息一并缓存，供 UI 卡片显示（名字/简介/署名）
      meta: parsed.meta || null,
      author: resolveSubscriptionAuthor(parsed.meta, url),
    });
  }
  return parsed;
};

/**
 * 遍历并同步所有**已启用**的术语订阅源。
 * 单个源失败不阻断其他源（与 subRules.js:51-54 一致）。
 * @param {Array<{url: string, enabled?: boolean}>} subTermsList
 * @param {{shouldCommit?: () => boolean}} [options]
 * @returns {Promise<{ok: number, failed: number}>}
 */
export const syncAllSubTerms = async (subTermsList, options = {}) => {
  let ok = 0;
  let failed = 0;
  for (const item of subTermsList || []) {
    if (!item?.url) continue;
    if (item.enabled === false) continue; // 多源并行：仅同步启用项（决策 D3）
    try {
      await syncSubTerms(item.url, options);
      await updateSubTermsSyncAt(item.url);
      ok += 1;
    } catch (err) {
      failed += 1;
      kissLog(`sync sub terms error: ${item.url}`, err);
    }
  }
  return { ok, failed };
};

/**
 * 按**源粒度**尝试增量同步（默认 24 小时）。
 *
 * 与 subRules.trySyncAllSubRules 的关键差异：不使用全局时间戳判定，
 * 而是逐源比较 `now - dataCaches["terms:"+url] > 24h`。
 * 这样单个源失败不会连累其他源，且新增源会立即同步。
 *
 * @param {{subTermsList?: Array<{url: string, enabled?: boolean}>}} params
 * @returns {Promise<{ok: number, failed: number, skipped: number}>}
 */
export const trySyncAllSubTerms = async ({ subTermsList = [] } = {}) => {
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  try {
    const now = Date.now();
    for (const item of subTermsList || []) {
      if (!item?.url || item.enabled === false) continue;
      const last = await getSubTermsSyncAt(item.url);
      if (now - last <= SYNC_INTERVAL) {
        skipped += 1;
        continue;
      }
      try {
        await syncSubTerms(item.url);
        await updateSubTermsSyncAt(item.url, now);
        ok += 1;
      } catch (err) {
        failed += 1;
        kissLog(`try sync sub terms error: ${item.url}`, err);
      }
    }
  } catch (err) {
    kissLog("try sync all sub terms", err);
  }
  return { ok, failed, skipped };
};

/**
 * 优先从本地缓存加载订阅术语文本，缓存不存在或为空时再发起网络同步。
 * 网络失败时返回空串（由调用方兜底），**绝不因网络问题清空已有缓存**。
 * @param {string} url 订阅源 URL
 * @returns {Promise<{text: string, entries: number, format?: string, fromCache: boolean}>}
 */
export const loadOrFetchSubTerms = async (url) => {
  let cached = await getSubTerms(url);
  if (cached?.text) {
    return { ...cached, fromCache: true };
  }
  try {
    const parsed = await syncSubTerms(url);
    await updateSubTermsSyncAt(url);
    return { ...parsed, fromCache: false };
  } catch (err) {
    kissLog(`load sub terms failed: ${url}`, err);
    return { text: "", entries: 0, fromCache: false };
  }
};

/**
 * 按优先级拼接所有已启用订阅源的术语文本（供 Translator 合成使用）。
 *
 * 拼接顺序：按 subTermsList 的**列表顺序**稳定拼接，保证同一配置下结果确定。
 * 单一来源内部由 parseTerms 负责去重；跨来源的去重由 termsCompose 负责。
 *
 * @param {Array<{url: string, enabled?: boolean}>} subTermsList
 * @returns {Promise<string>} 拼接后的 terms 文本（无内容时为空串）
 */
export const composeSubTermsText = async (subTermsList = []) => {
  const parts = [];
  for (const item of subTermsList || []) {
    if (!item?.url || item.enabled === false) continue;
    try {
      const { text } = await loadOrFetchSubTerms(item.url);
      if (text && text.trim()) parts.push(text.trim());
    } catch (err) {
      kissLog(`compose sub terms error: ${item.url}`, err);
    }
  }
  return parts.join("\n");
};

/**
 * 删除指定订阅源的缓存与时间戳（删除订阅源时调用）。
 * @param {string} url
 */
export const removeSubTerms = async (url) => {
  await delSubTerms(url);
  const { dataCaches = {} } = await getSyncWithDefault();
  if (dataCaches[TERMS_CACHE_PREFIX + url] !== undefined) {
    delete dataCaches[TERMS_CACHE_PREFIX + url];
    await putSync({ dataCaches });
  }
};
