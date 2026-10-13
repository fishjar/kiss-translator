export function getCssAtRuleBodies(css, prelude) {
  const source = String(css || "");
  const bodies = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(prelude, cursor);
    if (start < 0) break;
    const openingBrace = source.indexOf("{", start + prelude.length);
    if (openingBrace < 0) break;

    let depth = 1;
    let index = openingBrace + 1;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}") depth -= 1;
      index += 1;
    }

    if (depth !== 0) break;
    bodies.push(source.slice(openingBrace + 1, index - 1));
    cursor = index;
  }

  return bodies;
}

// 剥除顶层块注释与任意顶层 @keyword{...} 块（括号深度配平，任意嵌套
// 深度，不限于 media/supports），返回仅含顶层普通规则与 @import 类
// 无块语句的文本。styles.test.js 的 parseTopLevelRules 以此为单一解析
// 语义源，不再自备第二套正则。
// 退化输入契约（不抛错、不挂起）：空串/非字符串归一为空串；@ 后直至
// 末尾既无 { 也无 ;（裸 "@media" 前导）、以及未闭合块（深度不归零），
// 一律把 @ 起的剩余文本按普通顶层文本保留并结束扫描。
export function stripTopLevelAtRuleBlocks(css) {
  const stripped = String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let cursor = 0;
  while (cursor < stripped.length) {
    const at = stripped.indexOf("@", cursor);
    if (at < 0) {
      out += stripped.slice(cursor);
      break;
    }
    out += stripped.slice(cursor, at);
    const brace = stripped.indexOf("{", at);
    const semi = stripped.indexOf(";", at);
    if (brace < 0 && semi < 0) {
      // 退化域：@ 后直到末尾既无 { 也无 ;，剩余文本按普通文本收尾。
      out += stripped.slice(at);
      break;
    }
    if (brace < 0 || (semi >= 0 && semi < brace)) {
      // 无块的 @keyword;（如 @import）：保留至分号。
      out += stripped.slice(at, semi + 1);
      cursor = semi + 1;
      continue;
    }
    let depth = 1;
    let index = brace + 1;
    while (index < stripped.length && depth > 0) {
      if (stripped[index] === "{") depth += 1;
      else if (stripped[index] === "}") depth -= 1;
      index += 1;
    }
    if (depth !== 0) {
      // 退化域：未闭合块，@ 起剩余文本按普通文本收尾（对齐旧正则
      // 「不匹配即留原文」语义）。
      out += stripped.slice(at);
      break;
    }
    cursor = index;
  }
  return out;
}
