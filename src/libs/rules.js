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

/**
 * 根据href匹配规则
 * @param {*} rules
 * @param {string} href
 * @returns
 */
export const matchRule = async (href, { injectRules, subrulesList }) => {
  const rules = await getRulesWithDefault();
  if (injectRules) {
    try {
      const selectedSub = subrulesList.find((item) => item.selected);
      if (selectedSub?.url) {
        const subRules = await loadOrFetchSubRules(selectedSub.url);
        rules.splice(-1, 0, ...subRules);
      }
    } catch (err) {
      kissLog("load injectRules", err);
    }
  }

  const rule = rules.find((r) =>
    r.pattern.split(",").some((p) => isMatch(href, p.trim()))
  );
  const globalRule = {
    ...GLOBLA_RULE,
    ...(rules.find((r) => r.pattern === GLOBAL_KEY) || {}),
  };
  if (!rule) {
    return globalRule;
  }

  [
    "selector",
    "keepSelector",
    "rootsSelector",
    "ignoreSelector",
    "terms",
    "aiTerms",
    "termsStyle",
    "highlightStyle",
    "textExtStyle",
    "selectStyle",
    "parentStyle",
    "grandStyle",
    "injectJs",
    // "injectCss",
    "transStartHook",
    "transEndHook",
    // "transRemoveHook",
  ].forEach((key) => {
    if (!rule[key]?.trim()) {
      rule[key] = globalRule[key];
    }
  });

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
    if (!rule[key] || rule[key] === GLOBAL_KEY) {
      rule[key] = globalRule[key];
    }
  });

  ["splitLength"].forEach((key) => {
    if (!rule[key]) {
      rule[key] = globalRule[key];
    }
  });

  return rule;
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
        // injectCss,
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
        // injectCss: type(injectCss) === "string" ? injectCss : "",
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
    curRule = { ...rule, ...curRule, pattern: rule.pattern };
  }

  const newRule = {};
  Object.entries(GLOBLA_RULE).forEach(([key, val]) => {
    newRule[key] =
      !curRule[key] || curRule[key] === val ? DEFAULT_RULE[key] : curRule[key];
  });

  rules.unshift(newRule);
  await setRules(rules);

  trySyncRules();
};
