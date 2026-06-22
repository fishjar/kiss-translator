/**
 * @file rules.js
 * @description 翻译规则引擎。提供选择器的继承与差分算法（如支持加减号追加/剔除选择器）、三级优先级规则合并（个人规则 > 订阅规则 > 全局规则）以及规则数据的健全性清洗校验与保存。
 */

import { matchValue, type, isMatch } from "./utils";
import {
  GLOBAL_KEY,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  DEFAULT_RULE,
  GLOBLA_RULE,
  OPT_SPLIT_PARAGRAPH_ALL,
  OPT_HIGHLIGHT_WORDS_ALL,
} from "../config";
import { loadOrFetchSubRules } from "./subRules";
import { getRulesWithDefault, setRules, getDisabledSubRules } from "./storage";
import { trySyncRules } from "./sync";
import { kissLog } from "./log";

/**
 * 差分合并 CSS 选择器。
 * 支持用户使用 “+” 号前缀在默认/基准选择器上追加自定义选择器，
 * 以及使用 “-” 号前缀从基准选择器中剔除某些被误伤的默认选择器。
 * 若无前缀（非补丁模式），则认为完全覆盖基准选择器。
 * @param {string} defaultStr 默认/基准 CSS 选择器字符串（逗号分割）
 * @param {string} userStr 覆盖的 CSS 选择器字符串（逗号分割）
 * @returns {string} 合并后的最终 CSS 选择器字符串
 */
function mergeSelectors(defaultStr, userStr) {
  if (!userStr || !userStr.trim()) {
    return defaultStr;
  }

  const defaultList = defaultStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const userList = userStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 判断是否属于追加/删除的补丁（Patch）模式（即列表中包含任意一个带 "+" 或 "-" 的项）
  const isPatchMode = userList.some(
    (s) => s.startsWith("+") || s.startsWith("-")
  );

  // 纯覆盖模式：直接去重并返回用户的选择器
  if (!isPatchMode) {
    return [...new Set(userList)].join(", ");
  }

  // 补丁差分模式
  let finalSet = new Set(defaultList);
  let currentMode = "add"; // 默认修饰动作为“添加”
  userList.forEach((item) => {
    let selector = item;

    if (item.startsWith("+")) {
      currentMode = "add";
      selector = item.slice(1).trim();
    } else if (item.startsWith("-")) {
      currentMode = "remove";
      selector = item.slice(1).trim();
    }

    if (!selector) return;

    if (currentMode === "remove") {
      finalSet.delete(selector); // 剔除选择器
    } else {
      finalSet.add(selector); // 追加选择器
    }
  });

  return [...finalSet].join(", ");
}

/**
 * 在给定的规则列表中，依据当前的 URL 匹配适合的规则
 * @param {Array<Object>} rules 待遍历的规则数组
 * @param {string} href 当前页面的完整 URL (如 location.href)
 * @returns {Object|undefined} 匹配到的首条规则，未匹配返回 undefined
 */
const findMatchingRule = (rules, href) => {
  return rules.find(
    (r) =>
      r.pattern !== GLOBAL_KEY &&
      r.enabled !== false &&
      r.pattern.split(/\n|,/).some((p) => isMatch(href, p.trim()))
  );
};

/**
 * 合并两条规则，高优先级（overrideRule）覆盖基准低优先级规则（baseRule）
 * 对于选择器字段（selector, keepSelector 等），会调用 mergeSelectors 进行智能继承/差分合并；
 * 对于枚举或普通字段，高优先级若为 `*` (GLOBAL_KEY) 或为空则继承低优先级，否则予以覆盖。
 * @param {Object} baseRule 基准低优先级规则
 * @param {Object} overrideRule 覆盖高优先级规则
 * @returns {Object} 合并后的最终规则
 */
const mergeRules = (baseRule, overrideRule) => {
  if (!overrideRule) return { ...baseRule };
  if (!baseRule) return { ...overrideRule };

  const merged = { ...baseRule };

  // 1. 合并 CSS 选择器类型的属性，支持追加/剔除
  [
    "selector",
    "keepSelector",
    "blockSelector",
    "rootsSelector",
    "ignoreSelector",
  ].forEach((key) => {
    merged[key] = mergeSelectors(baseRule[key] || "", overrideRule[key] || "");
  });

  // 2. 合并非空字符串类型的属性 (如自定义 JS/CSS/术语表样式)
  [
    "terms",
    "aiTerms",
    "termsStyle",
    "highlightStyle",
    "textExtStyle",
    "selectStyle",
    "parentStyle",
    "grandStyle",
    "injectJs",
    "injectCss",
    "transStartHook",
    "transEndHook",
    // "transRemoveHook",
  ].forEach((key) => {
    if (overrideRule[key]?.trim()) {
      merged[key] = overrideRule[key];
    }
  });

  // 3. 合并枚举类型的属性，若高优先级属性为星号 '*' 则继续继承，否则直接覆盖
  [
    "apiSlug",
    "fromLang",
    "toLang",
    "transOpen",
    "transOnly",
    "transOnlyRevert",
    "transOrder",
    "autoScan",
    "hasRichText",
    "hasShadowroot",
    "scanAll",
    "transTag",
    "transTitle",
    "splitParagraph",
    "highlightWords",
    "textStyle",
  ].forEach((key) => {
    if (overrideRule[key] && overrideRule[key] !== GLOBAL_KEY) {
      merged[key] = overrideRule[key];
    }
  });

  // 4. 合并数字数值类型属性
  ["splitLength", "transOnlyRevertDelay"].forEach((key) => {
    if (overrideRule[key] && overrideRule[key] !== GLOBAL_KEY) {
      merged[key] = overrideRule[key];
    }
  });

  // 5. 覆盖 pattern (URL 匹配模板)
  if (overrideRule.pattern) {
    merged.pattern = overrideRule.pattern;
  }

  return merged;
};

/**
 * 根据href匹配规则
 * 合并匹配到的个人规则、订阅规则、全局规则
 * 优先级：个人规则 > 订阅规则 > 全局规则
 * @param {*} rules
 * @param {string} href
 * @returns
 */
export const matchRule = async (href, { injectRules, subrulesList }) => {
  // 获取个人规则
  const personalRules = await getRulesWithDefault();

  // 获取全局规则
  const globalRule = {
    ...GLOBLA_RULE,
    ...(personalRules.find((r) => r.pattern === GLOBAL_KEY) || {}),
  };

  // 查找匹配的个人规则（排除全局规则）
  const matchedPersonalRule = findMatchingRule(personalRules, href);

  // 获取订阅规则并查找匹配
  let matchedSubRule = null;
  if (injectRules) {
    try {
      const selectedSub = subrulesList.find((item) => item.selected);
      if (selectedSub?.url) {
        const subRules = await loadOrFetchSubRules(selectedSub.url);
        matchedSubRule = findMatchingRule(subRules, href);
        // If the matched subscribed rule is disabled by user for this source, ignore it
        try {
          const disabled = await getDisabledSubRules(selectedSub.url);
          if (matchedSubRule && disabled.includes(matchedSubRule.pattern)) {
            matchedSubRule = null;
          }
        } catch (err) {
          kissLog("getDisabledSubRules", err);
        }
      }
    } catch (err) {
      kissLog("load injectRules", err);
    }
  }

  // 如果没有匹配到任何规则，返回全局规则
  if (!matchedPersonalRule && !matchedSubRule) {
    return globalRule;
  }

  // 合并规则：全局规则 <- 订阅规则 <- 个人规则
  // 优先级：个人规则 > 订阅规则 > 全局规则
  let finalRule = { ...globalRule };
  finalRule = mergeRules(finalRule, matchedSubRule);
  finalRule = mergeRules(finalRule, matchedPersonalRule);

  return finalRule;
};

/**
 * 检查、清洗并过滤规则列表数据。
 * 支持输入 JSON 字符串或数组，对所有字段进行格式规范化与去重。
 * @param {Array<Object>|string} rules 待校验的规则数组或 JSON 字符串
 * @returns {Array<Object>} 校验规范化后的规则数组
 * @throws {Error} 如果解析失败或数据格式不为数组，则抛出 "data error" 异常
 */
export const checkRules = (rules) => {
  // 如果是 JSON 字符串，先尝试解析为 JavaScript 对象
  if (type(rules) === "string") {
    rules = JSON.parse(rules);
  }
  // 必须是数组格式
  if (type(rules) !== "array") {
    throw new Error("data error");
  }

  const fromLangs = OPT_LANGS_FROM.map((item) => item[0]);
  const toLangs = OPT_LANGS_TO.map((item) => item[0]);
  const patternSet = new Set();

  // 过滤并映射规则列表
  rules = rules
    .filter((rule) => type(rule) === "object") // 过滤出有效的规则对象
    .filter(({ pattern }) => {
      // 过滤掉没有 pattern 或 pattern 重复的规则
      if (type(pattern) !== "string" || patternSet.has(pattern.trim())) {
        return false;
      }
      patternSet.add(pattern.trim());
      return true;
    })
    .map(
      ({
        pattern,
        enabled,
        selector,
        keepSelector,
        blockSelector,
        rootsSelector,
        ignoreSelector,
        terms,
        aiTerms,
        termsStyle,
        highlightStyle,
        textExtStyle,
        selectStyle,
        parentStyle,
        grandStyle,
        injectJs,
        injectCss,
        apiSlug,
        fromLang,
        toLang,
        textStyle,
        transOpen,
        transOnly,
        transOnlyRevert,
        transOnlyRevertDelay,
        transOrder,
        autoScan,
        hasRichText,
        hasShadowroot,
        scanAll,
        transTag,
        transTitle,
        transStartHook,
        transEndHook,
        // transRemoveHook,
        splitParagraph,
        splitLength,
        highlightWords,
      }) => ({
        // 确保字段类型及取值的合法性，不合法或空值时回退到默认占位符或空值
        pattern: pattern.trim(),
        enabled: type(enabled) === "boolean" ? enabled : true,
        selector: type(selector) === "string" ? selector : "",
        keepSelector: type(keepSelector) === "string" ? keepSelector : "",
        blockSelector: type(blockSelector) === "string" ? blockSelector : "",
        rootsSelector: type(rootsSelector) === "string" ? rootsSelector : "",
        ignoreSelector: type(ignoreSelector) === "string" ? ignoreSelector : "",
        terms: type(terms) === "string" ? terms : "",
        aiTerms: type(aiTerms) === "string" ? aiTerms : "",
        termsStyle: type(termsStyle) === "string" ? termsStyle : "",
        highlightStyle: type(highlightStyle) === "string" ? highlightStyle : "",
        textExtStyle: type(textExtStyle) === "string" ? textExtStyle : "",
        selectStyle: type(selectStyle) === "string" ? selectStyle : "",
        parentStyle: type(parentStyle) === "string" ? parentStyle : "",
        grandStyle: type(grandStyle) === "string" ? grandStyle : "",
        injectJs: type(injectJs) === "string" ? injectJs : "",
        injectCss: type(injectCss) === "string" ? injectCss : "",
        apiSlug:
          type(apiSlug) === "string" && apiSlug.trim() !== ""
            ? apiSlug.trim()
            : GLOBAL_KEY,
        fromLang: matchValue([GLOBAL_KEY, ...fromLangs], fromLang),
        toLang: matchValue([GLOBAL_KEY, ...toLangs], toLang),
        textStyle:
          type(textStyle) === "string" && textStyle.trim() !== ""
            ? textStyle.trim()
            : GLOBAL_KEY,
        transOpen: matchValue([GLOBAL_KEY, "true", "false"], transOpen),
        transOnly: matchValue([GLOBAL_KEY, "true", "false"], transOnly),
        transOnlyRevert: matchValue(
          [GLOBAL_KEY, "true", "false"],
          transOnlyRevert
        ),
        transOnlyRevertDelay:
          type(transOnlyRevertDelay) === "string" &&
          !isNaN(parseFloat(transOnlyRevertDelay))
            ? transOnlyRevertDelay
            : GLOBAL_KEY,
        transOrder: matchValue(
          [GLOBAL_KEY, "original-first", "translation-first"],
          transOrder
        ),
        autoScan: matchValue([GLOBAL_KEY, "true", "false"], autoScan),
        hasRichText: matchValue([GLOBAL_KEY, "true", "false"], hasRichText),
        hasShadowroot: matchValue([GLOBAL_KEY, "true", "false"], hasShadowroot),
        scanAll: matchValue([GLOBAL_KEY, "true", "false"], scanAll),
        transTag: matchValue([GLOBAL_KEY, "span", "font"], transTag),
        transTitle: matchValue([GLOBAL_KEY, "true", "false"], transTitle),
        transStartHook: type(transStartHook) === "string" ? transStartHook : "",
        transEndHook: type(transEndHook) === "string" ? transEndHook : "",
        splitParagraph: matchValue(
          [GLOBAL_KEY, ...OPT_SPLIT_PARAGRAPH_ALL],
          splitParagraph
        ),
        splitLength: Number.isInteger(splitLength) ? splitLength : 0,
        highlightWords: matchValue(
          [GLOBAL_KEY, ...OPT_HIGHLIGHT_WORDS_ALL],
          highlightWords
        ),
      })
    );

  return rules;
};

/**
 * 保存或更新单条用户自定义规则。
 * 检查是否存在冲突并进行属性合并，最后同步更新规则列表。
 * @param {Object} curRule 待保存的规则对象
 */
export const saveRule = async (curRule) => {
  // 获取当前所有的规则列表
  const rules = await getRulesWithDefault();

  // 查找是否存在相同或模糊匹配 pattern 的已有规则
  // REVIEW: 此处使用 isMatch(curRule.pattern, item.pattern) 进行判断。
  // 如果 curRule.pattern 或 item.pattern 带有通配符，极易造成模糊匹配的误判，
  // 导致非同名的其它规则被错误合并覆盖。建议改为精确的字符串对比：item.pattern === curRule.pattern。
  const index = rules.findIndex(
    (item) =>
      item.pattern !== GLOBAL_KEY && isMatch(curRule.pattern, item.pattern)
  );

  if (index !== -1) {
    // 若匹配到了已有规则，将其从数组中取出，并与新属性合并，保留老规则的选择器等配置
    const rule = rules.splice(index, 1)[0];
    curRule = {
      ...rule,
      ...curRule,
      pattern: rule.pattern,
      selector: rule.selector,
      keepSelector: rule.keepSelector,
      blockSelector: rule.blockSelector,
      rootsSelector: rule.rootsSelector,
      ignoreSelector: rule.ignoreSelector,
    };
  }

  const newRule = {};
  // 获取当前的全局规则配置，用于做“冗余值过滤”
  const globalRule = {
    ...GLOBLA_RULE,
    ...(rules.find((r) => r.pattern === GLOBAL_KEY) || {}),
  };

  // 遍历所有全局规则键值，若新规则的某项值与全局规则一致，则只保存 DEFAULT_RULE 中的占位符以优化存储大小
  Object.keys(GLOBLA_RULE).forEach((key) => {
    newRule[key] =
      !curRule[key] || curRule[key] === globalRule[key]
        ? DEFAULT_RULE[key]
        : curRule[key];
  });

  // 将新规则插入到列表的最前端并保存
  rules.unshift(newRule);
  await setRules(rules);

  // 触发跨端/多终端规则同步
  trySyncRules();
};
