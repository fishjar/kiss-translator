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
import { getRulesWithDefault, setRules } from "./storage";
import { trySyncRules } from "./sync";
import { kissLog } from "./log";

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

  const isPatchMode = userList.some(
    (s) => s.startsWith("+") || s.startsWith("-")
  );

  if (!isPatchMode) {
    return [...new Set(userList)].join(", ");
  }

  let finalSet = new Set(defaultList);
  let currentMode = "add";
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
      finalSet.delete(selector);
    } else {
      finalSet.add(selector);
    }
  });

  return [...finalSet].join(", ");
}

/**
 * 在规则列表中查找匹配的规则
 * @param {Array} rules 规则列表
 * @param {string} href 当前页面URL
 * @returns {Object|null} 匹配的规则或null
 */
const findMatchingRule = (rules, href) => {
  return rules.find(
    (r) =>
      r.pattern !== GLOBAL_KEY &&
      r.pattern.split(/\n|,/).some((p) => isMatch(href, p.trim()))
  );
};

/**
 * 合并规则，应用优先级
 * 对于选择器类型的属性，使用mergeSelectors合并
 * 对于其他属性，高优先级规则覆盖低优先级规则
 * @param {Object} baseRule 基准规则（低优先级）
 * @param {Object} overrideRule 覆盖规则（高优先级）
 * @returns {Object} 合并后的规则
 */
const mergeRules = (baseRule, overrideRule) => {
  if (!overrideRule) return { ...baseRule };
  if (!baseRule) return { ...overrideRule };

  const merged = { ...baseRule };

  // 选择器类型的属性需要使用mergeSelectors合并
  ["selector", "keepSelector", "rootsSelector", "ignoreSelector"].forEach(
    (key) => {
      merged[key] = mergeSelectors(
        baseRule[key] || "",
        overrideRule[key] || ""
      );
    }
  );

  // 字符串类型的属性，非空则覆盖
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

  // 枚举类型的属性，非全局值则覆盖
  [
    "apiSlug",
    "fromLang",
    "toLang",
    "transOpen",
    "transOnly",
    "autoScan",
    "hasRichText",
    "hasShadowroot",
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

  // 数字类型的属性
  ["splitLength"].forEach((key) => {
    if (overrideRule[key]) {
      merged[key] = overrideRule[key];
    }
  });

  // pattern使用高优先级规则的pattern
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
 * 检查过滤rules
 * @param {*} rules
 * @returns
 */
export const checkRules = (rules) => {
  if (type(rules) === "string") {
    rules = JSON.parse(rules);
  }
  if (type(rules) !== "array") {
    throw new Error("data error");
  }

  const fromLangs = OPT_LANGS_FROM.map((item) => item[0]);
  const toLangs = OPT_LANGS_TO.map((item) => item[0]);
  const patternSet = new Set();
  rules = rules
    .filter((rule) => type(rule) === "object")
    .filter(({ pattern }) => {
      if (type(pattern) !== "string" || patternSet.has(pattern.trim())) {
        return false;
      }
      patternSet.add(pattern.trim());
      return true;
    })
    .map(
      ({
        pattern,
        selector,
        keepSelector,
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
        autoScan,
        hasRichText,
        hasShadowroot,
        transTag,
        transTitle,
        transStartHook,
        transEndHook,
        // transRemoveHook,
        splitParagraph,
        splitLength,
        highlightWords,
      }) => ({
        pattern: pattern.trim(),
        selector: type(selector) === "string" ? selector : "",
        keepSelector: type(keepSelector) === "string" ? keepSelector : "",
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
        // textStyle: matchValue([GLOBAL_KEY, ...OPT_STYLE_ALL], textStyle),
        textStyle:
          type(textStyle) === "string" && textStyle.trim() !== ""
            ? textStyle.trim()
            : GLOBAL_KEY,
        transOpen: matchValue([GLOBAL_KEY, "true", "false"], transOpen),
        transOnly: matchValue([GLOBAL_KEY, "true", "false"], transOnly),
        autoScan: matchValue([GLOBAL_KEY, "true", "false"], autoScan),
        hasRichText: matchValue([GLOBAL_KEY, "true", "false"], hasRichText),
        hasShadowroot: matchValue([GLOBAL_KEY, "true", "false"], hasShadowroot),
        transTag: matchValue([GLOBAL_KEY, "span", "font"], transTag),
        transTitle: matchValue([GLOBAL_KEY, "true", "false"], transTitle),
        transStartHook: type(transStartHook) === "string" ? transStartHook : "",
        transEndHook: type(transEndHook) === "string" ? transEndHook : "",
        // transRemoveHook:
        //   type(transRemoveHook) === "string" ? transRemoveHook : "",
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
 * 保存或更新rule
 * @param {*} curRule
 */
export const saveRule = async (curRule) => {
  const rules = await getRulesWithDefault();

  const index = rules.findIndex(
    (item) =>
      item.pattern !== GLOBAL_KEY && isMatch(curRule.pattern, item.pattern)
  );
  if (index !== -1) {
    const rule = rules.splice(index, 1)[0];
    curRule = {
      ...rule,
      ...curRule,
      pattern: rule.pattern,
      selector: rule.selector,
      keepSelector: rule.keepSelector,
      rootsSelector: rule.rootsSelector,
      ignoreSelector: rule.ignoreSelector,
    };
  }

  const newRule = {};
  const globalRule = {
    ...GLOBLA_RULE,
    ...(rules.find((r) => r.pattern === GLOBAL_KEY) || {}),
  };
  Object.keys(GLOBLA_RULE).forEach((key) => {
    newRule[key] =
      !curRule[key] || curRule[key] === globalRule[key]
        ? DEFAULT_RULE[key]
        : curRule[key];
  });

  rules.unshift(newRule);
  await setRules(rules);

  trySyncRules();
};
