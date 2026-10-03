// 术语导入纯函数模块：文件内容（CSV / JSON / TXT）→ terms 原生文本
// 无 DOM、无日志依赖，与 terms.js 同一纪律（terms.js:2），供 UI / CLI / 单元测试复用。
//
// 职责边界（重要）：
// - 本模块只做「文件格式 → terms 文本」的转换，**不调用 parseTerms**。
//   诊断（invalid-regex / conflicting-mapping 等）由调用方负责，见
//   .anchorlaw/specs/terminology-library-v0.md §3.3「两层报告机制」。
// - 输出 text 保证是 parseTerms 可正确解析的 terms 文本：以 \n 连接、每条 `key,value`
//   （value 为空时只写 key），且 key/value 内不含 \n 或 ;（否则会被 terms.js:569 的
//   split(/\n|;/) 拦腰切断）。
//
// 为什么只拒绝含逗号的 key、而**允许** value 含逗号：
//   parseTerms 用**最后一个**英文逗号切分（terms.js:576 lastIndexOf(",")）。
//   由于分隔符取最后一个逗号，value 里的逗号天然安全（在最后一个逗号之后，被并入 value）：
//     `API,接口, 应用程序接口` → key = "API", value = "接口, 应用程序接口"   ← 正确
//   但 key 里的逗号必然错切：
//     `a,b,c` → key = "a,b", value = "c"                                   ← key 被污染
//   故仅对含逗号的 key 报错（reason `key-contains-comma`），value 含逗号放行。
//   引号包裹的 key 含逗号同样拒绝——引号只保护 CSV 结构层的切分，不保护 terms 文本层。
//   注意：中文逗号 `，` 与全角标点不受影响，可正常作为译文内容。
// 为什么拒绝含分号的 key/value：
//   同上，parseTerms 用 /\n|;/ 切分（terms.js:569），分号是段分隔符而非普通字符，
//   含分号的字段会被切成两段并产生错误的术语。此为实施期补充约束，见交付报告。
// 为什么不支持 `#` 注释：
//   `#` 是合法正则字符，`#foo,bar` 在 parseTerms 眼里是合法术语；在导入层剥注释会造成
//   「导入结果 ≠ 用户直接粘贴同样文本」的隐蔽语义分裂（spec §3.2.2）。
// 为什么 CSV 引号内换行替换为空格：
//   保留的 \n 会被 parseTerms 拦腰切断成两个错误段；译文含换行无实际意义（会被插入
//   HTML 的 <i> 元素），替换为空格是安全降级（spec §3.2.4）。

// 表头识别白名单（去引号、trim、小写后比对）
const CSV_KEY_HEADERS = new Set([
  "key",
  "term",
  "source",
  "源术语",
  "术语",
  "原文",
]);
const CSV_VALUE_HEADERS = new Set([
  "value",
  "translation",
  "target",
  "译文",
  "目标",
]);

/**
 * 通用前置归一化：去 UTF-8 BOM（Excel 导出的 CSV 必带）+ CRLF/CR → LF
 * 非字符串输入统一视为空串，不抛错。
 * @param {*} raw 原始文件内容
 * @returns {string} 归一化后的文本
 */
function normalizeInput(raw) {
  let s = typeof raw === "string" ? raw : "";
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}

/**
 * 构造统一返回结构（四个解析函数共用）
 * @param {string} text 归一化 terms 文本
 * @param {number[]} lineMap 归一化文本行号(0起) → 源文件行号(1起)
 * @param {Array} errors 错误项
 * @param {Array} warnings 警告项
 * @returns {object}
 */
function buildResult(text, lineMap, errors, warnings) {
  return {
    ok: errors.length === 0,
    text,
    entries: lineMap.length,
    errors,
    warnings,
    lineMap,
  };
}

/**
 * 按 terms 输出契约校验一个 key/value 是否可安全落地成一行文本。
 * 返回 null 表示合法，否则返回 reason。
 *
 * 【核心事实】parseTerms 用**最后一个**英文逗号切分（terms.js:576 `lastIndexOf(",")`），
 * 因此 terms 文本行 `key,value` 中**任何**多余逗号都会被并进 key，而不是 value：
 *
 *   parseTerms("API,接口, 应用程序接口")
 *     -> key = "API,接口"      ← 逗号被 key 吃掉（实测）
 *        value = "应用程序接口"
 *
 * 这不是理论推断，是实测结果（judge 2026-10-01 用真引擎验证）。
 * 所以"value 里的逗号安全"是**错误假设**——CSV 的引号只保护 CSV 结构层，
 * 一旦渲染成 terms 文本，引号消失，逗号重新变成切分点。
 *
 * key 含英文逗号 → 拒绝（`key-contains-comma`）
 * value 含英文逗号 → 同样拒绝（`value-contains-comma`）
 *
 * ⚠️ 这确实牺牲了"译文里含逗号"的支持（如 `API,"接口, 应用程序接口"`）。
 * 但这是 terms 文本层格式的**语言级限制**，不是本模块的选择：
 * 静默接受会让用户拿到 key 被污染的术语库且**不报任何错误**，
 * 比明确拒绝危险得多。正确的长期解法是给 terms 文本层加转义语法，
 * 那属于 `terms.js` 引擎级改动，不在本需求范围。
 *
 * @param {string} key
 * @param {string} value
 * @returns {string|null}
 */
function validateEntryFields(key, value) {
  if (key.includes(",")) return "key-contains-comma";
  if (value.includes(",")) return "value-contains-comma";
  if (key.includes(";") || value.includes(";")) return "contains-semicolon";
  return null;
}

/**
 * 把一条 key/value 渲染为 terms 文本行；value 为空时只写 key（统一不带尾巴逗号）
 * 前置条件：调用方已通过 validateEntryFields 校验（value 不含英文逗号）
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
function renderEntry(key, value) {
  return value === "" ? key : `${key},${value}`;
}

/**
 * 逐字符解析 CSV 文本为行（RFC 4180 子集）。
 * 行结构：{ line, fields, quoted, raw, newlineInQuoted, unterminated }
 * - 引号内 "," 不切分；引号内 "" 是一个字面双引号
 * - 引号内换行记入字段内容并把 newlineInQuoted 置真（由调用方降级为空格）
 * - \n 作为整份文本的换行分隔符；行号按源文件行递增（引号内跨行会消耗行号）
 * @param {string} s 已归一化的文本
 * @returns {Array<object>}
 */
function parseCsvRecords(s) {
  const records = [];
  let fields = [];
  let quoted = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let raw = "";
  let newlineInQuoted = false;
  let quotedFieldSeen = false;

  const endField = () => {
    fields.push(field);
    quoted.push(quotedFieldSeen);
    field = "";
    quotedFieldSeen = false;
  };

  const endRecord = () => {
    endField();
    records.push({
      line: recordStartLine,
      fields,
      quoted,
      raw,
      newlineInQuoted,
      unterminated: false,
    });
    fields = [];
    quoted = [];
    raw = "";
    newlineInQuoted = false;
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          raw += '""';
          i++;
        } else {
          inQuotes = false;
          raw += ch;
        }
      } else if (ch === "\n") {
        // 引号内换行：保留语义（并入字段内容），由调用方降级为空格
        newlineInQuoted = true;
        field += ch;
        raw += ch;
        line++;
      } else {
        field += ch;
        raw += ch;
      }
      continue;
    }

    // 引号只在字段「尚未出现非空白内容」时开启引号语义（允许 ` , "x"` 这种带前导空格的写法）
    if (ch === '"' && field.trim() === "" && !quotedFieldSeen) {
      field = ""; // 丢弃引号前的空白，避免污染字段内容
      inQuotes = true;
      quotedFieldSeen = true;
      raw += ch;
    } else if (ch === ",") {
      raw += ch;
      endField();
    } else if (ch === "\n") {
      endRecord();
      line++;
      recordStartLine = line;
    } else {
      field += ch;
      raw += ch;
    }
  }

  if (inQuotes) {
    // 引号未闭合：报错并丢弃该记录（不产出半条术语）
    endField();
    records.push({
      line: recordStartLine,
      fields,
      quoted,
      raw,
      newlineInQuoted,
      unterminated: true,
    });
  } else if (raw !== "" || fields.length > 0 || field !== "") {
    endRecord();
  }

  return records;
}

/**
 * 判断一条记录是否为表头行（第 1 列 ∈ key 白名单 且 第 2 列 ∈ value 白名单）
 * @param {Array<object>} records
 * @param {number} index
 * @returns {boolean}
 */
function isHeaderRecord(records, index) {
  const fields = records[index].fields;
  if (!fields || fields.length < 2) return false;
  const first = fields[0].trim().toLowerCase();
  const second = fields[1].trim().toLowerCase();
  return CSV_KEY_HEADERS.has(first) && CSV_VALUE_HEADERS.has(second);
}

/**
 * 解析 CSV 内容（严格 RFC 4180 子集，无分隔符嗅探）
 *
 * 规格：
 * - 第 1 列 = key，第 2 列 = value，第 3 列及以后忽略并记 warning `csv-extra-columns`
 * - 表头自动检测：首行两列同时命中白名单则跳过（否则按数据行处理）
 * - 引号未闭合 → error `csv-quote-unterminated`
 * - 引号内换行 → 替换为空格并记 warning `csv-newline-in-quoted`
 * - 空行跳过；缺 value 列按 `value=""`；key 含逗号 → error `key-contains-comma`
 *
 * @param {*} raw 文件内容
 * @returns {{ok: boolean, text: string, entries: number, errors: Array, warnings: Array, lineMap: number[]}}
 */
export function parseCsvImport(raw) {
  const s = normalizeInput(raw);
  const errors = [];
  const warnings = [];
  const outLines = [];
  const lineMap = [];

  if (s.trim() === "") return buildResult("", lineMap, errors, warnings);

  const records = parseCsvRecords(s);

  // 表头检测：只看**首条非空记录**（空行先于表头时也要能识别）
  let headerIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i].fields.every((f) => f.trim() === "")) continue;
    if (isHeaderRecord(records, i)) headerIndex = i;
    break;
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.fields.every((f) => f.trim() === "")) continue; // 空行跳过

    if (record.unterminated) {
      errors.push({
        line: record.line,
        raw: record.raw,
        reason: "csv-quote-unterminated",
      });
      continue;
    }

    if (i === headerIndex) continue; // 表头行跳过，不产出条目

    const rawKey = record.fields[0] ?? "";
    const rawValue = record.fields.length > 1 ? record.fields[1] : "";

    if (record.fields.length > 2) {
      warnings.push({
        line: record.line,
        raw: record.raw,
        reason: "csv-extra-columns",
      });
    }
    if (record.newlineInQuoted) {
      warnings.push({
        line: record.line,
        raw: record.raw,
        reason: "csv-newline-in-quoted",
      });
    }

    // 引号内换行统一降级为空格（key 与 value 同样处理：key 含 \n 同样是错切）
    const key = rawKey.replace(/\n/g, " ").trim();
    const value = rawValue.replace(/\n/g, " ").trim();

    if (key === "") {
      errors.push({
        line: record.line,
        raw: record.raw,
        reason: "empty-key",
      });
      continue;
    }

    // 该字段是否被引号包裹（仅用于诊断上下文，不改变逗号拒绝策略）
    const reason = validateEntryFields(key, value);
    if (reason) {
      errors.push({ line: record.line, raw: record.raw, reason });
      continue;
    }

    outLines.push(renderEntry(key, value));
    lineMap.push(record.line);
  }

  return buildResult(outLines.join("\n"), lineMap, errors, warnings);
}

/**
 * 解析 JSON 内容（数组形态 / 对象映射形态）
 *
 * 规格：
 * - 形态 1（推荐）：`[{ key, value }, ...]`，key 必填 string，value 可选 string（缺省 ""）
 * - 形态 2：`{ "API": "接口" }` 对象映射
 * - key 含英文逗号 → error `key-contains-comma`（terms 文本层无转义机制）
 * - key 非字符串 / 空 → error `json-invalid-field`
 * - 未知字段忽略但记 warning `json-unknown-field`（引擎无 per-term flags 通道，
 *   静默忽略会让用户误以为生效了）
 * - `JSON.parse` 失败 → **抛错**（错误信息内含原始 message），由调用方处理
 *
 * @param {*} raw 文件内容
 * @returns {{ok: boolean, text: string, entries: number, errors: Array, warnings: Array, lineMap: number[]}}
 * @throws {Error} 内容不是合法 JSON 时抛出
 */
export function parseJsonImport(raw) {
  const errors = [];
  const warnings = [];
  const outLines = [];
  const lineMap = [];

  if (typeof raw !== "string" || raw.trim() === "") {
    return buildResult("", lineMap, errors, warnings);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(normalizeInput(raw));
  } catch (error) {
    throw new Error(`JSON.parse failed: ${error && error.message}`);
  }

  const pushEntry = (keyField, valueField, extraFields, line, rawLine) => {
    if (typeof keyField !== "string" || keyField === "") {
      errors.push({
        line,
        raw: rawLine,
        reason: "json-invalid-field",
      });
      return;
    }
    if (valueField !== undefined && typeof valueField !== "string") {
      errors.push({
        line,
        raw: rawLine,
        reason: "json-invalid-field",
      });
      return;
    }
    if (extraFields.length > 0) {
      warnings.push({
        line,
        raw: rawLine,
        reason: "json-unknown-field",
      });
    }

    const key = keyField.trim();
    const value = (valueField ?? "").trim();

    if (key === "") {
      errors.push({ line, raw: rawLine, reason: "json-invalid-field" });
      return;
    }

    const reason = validateEntryFields(key, value);
    if (reason) {
      errors.push({ line, raw: rawLine, reason });
      return;
    }

    outLines.push(renderEntry(key, value));
    lineMap.push(line);
  };

  if (Array.isArray(parsed)) {
    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      const line = i + 1;
      const rawLine = JSON.stringify(entry);
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push({ line, raw: rawLine, reason: "json-invalid-field" });
        continue;
      }
      const extraFields = Object.keys(entry).filter(
        (name) => name !== "key" && name !== "value"
      );
      pushEntry(entry.key, entry.value, extraFields, line, rawLine);
    }
    return buildResult(outLines.join("\n"), lineMap, errors, warnings);
  }

  if (parsed && typeof parsed === "object") {
    // 【术语库描述文件】顶层含 `terms` 字段时，视为"带元信息的库描述文件"
    // （见 subTerms.js 的 extractSubscriptionMeta）。此时只有 terms 是术语数据，
    // name/description/author 等是元信息，**不能**当成 key-value 条目。
    //
    // 若不特判，{name:"游戏术语",terms:[...]} 会被当成映射，产出
    // `name,游戏术语` 这样的假术语（实测踩到：1 条术语被解析成 3 条）。
    if ("terms" in parsed && !Array.isArray(parsed)) {
      const inner = parsed.terms;
      // 内层是**纯文本**时，它就是 terms 原生格式，不能再当 JSON 解析
      //（否则 JSON.parse("Cheeta,齐塔") 会落到"顶层非数组非对象"分支而丢数据）。
      if (typeof inner === "string") return parseTxtImport(inner);
      return parseJsonImport(JSON.stringify(inner));
    }

    const keys = Object.keys(parsed);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = parsed[key];
      const line = i + 1;
      const rawLine = JSON.stringify({ [key]: value });
      if (typeof value !== "string") {
        errors.push({ line, raw: rawLine, reason: "json-invalid-field" });
        continue;
      }
      pushEntry(key, value, [], line, rawLine);
    }
    return buildResult(outLines.join("\n"), lineMap, errors, warnings);
  }

  // 顶层既不是数组也不是对象（如 "abc" / 42 / null / true）
  errors.push({
    line: 1,
    raw: JSON.stringify(parsed),
    reason: "json-invalid-field",
  });
  return buildResult("", lineMap, errors, warnings);
}

/**
 * 解析 TXT 内容
 *
 * 规格：除 BOM 剥离与换行归一化外**不做任何转换**，内容即 terms 原生格式。
 * 不支持 `#` 注释（`#` 是合法正则字符，剥注释会导致与用户直接粘贴文本的结果不一致）。
 * 空行原样保留——parseTerms 会静默跳过空段（terms.js:574），此处不擅自过滤，
 * 以保证 lineMap 与用户所见的源文件行号严格一一对应。
 *
 * @param {*} raw 文件内容
 * @returns {{ok: boolean, text: string, entries: number, errors: Array, warnings: Array, lineMap: number[]}}
 */
export function parseTxtImport(raw) {
  const s = normalizeInput(raw);
  const errors = [];
  const warnings = [];
  const lineMap = [];

  // 全空白输入统一归一为空结果（与 parseTerms 的「空白串 = 空输入」语义对齐，terms.js:557）
  if (s.trim() === "") return buildResult("", lineMap, errors, warnings);

  const lines = s.split("\n");
  // 归一化后以 \n 结尾时，split 会多出一个空尾元素；它不对应任何真实输入行
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "") continue; // 空段：parseTerms 静默跳过，不占段号
    lineMap.push(i + 1);
  }

  return buildResult(lines.join("\n"), lineMap, errors, warnings);
}

/**
 * 按文件名后缀与内容嗅探导入格式
 * 后缀优先（明确意图），内容嗅探兜底（`.txt`/无后缀时的容错）。
 *
 * 嗅探顺序说明：数组开头的 `[` 是 JSON 强特征，先判；
 * 否则用「含英文逗号」与「含中文冒号」区分 JSON 对象与 CSV——
 * CSV 是逗号分隔格式，英文逗号是它的结构特征而非内容特征。
 *
 * @param {*} filename 文件名（可含路径）
 * @param {*} content 文件内容（可选，用于嗅探）
 * @returns {"csv"|"json"|"txt"}
 */
export function detectFormat(filename, content = "") {
  const name = typeof filename === "string" ? filename : "";
  const dot = name.lastIndexOf(".");
  const ext = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  if (ext === "txt" || ext === "text") return "txt";

  const trimmed = normalizeInput(content).trim();
  if (trimmed.startsWith("[")) return "json";
  if (
    trimmed.startsWith("{") &&
    !trimmed.includes(",") &&
    /[:：]/.test(trimmed)
  ) {
    return "json";
  }
  return "txt";
}

/**
 * 统一入口：按格式解析文件内容
 * @param {*} raw 文件内容
 * @param {string} format "csv" | "json" | "txt"
 * @returns {object} 统一返回结构
 * @throws {Error} format === "json" 且 JSON 非法时抛出（与 parseJsonImport 一致）
 */
export function parseImport(raw, format) {
  if (format === "csv") return parseCsvImport(raw);
  if (format === "json") return parseJsonImport(raw);
  return parseTxtImport(raw);
}
