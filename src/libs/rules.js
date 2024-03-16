import { matchValue, type, isMatch } from "./utils";
import {
  GLOBAL_KEY,
  REMAIN_KEY,
  OPT_TRANS_ALL,
  OPT_STYLE_ALL,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_TIMING_ALL,
  GLOBLA_RULE,
} from "../config";
import { loadOrFetchSubRules } from "./subRules";
import { getRulesWithDefault, setRules } from "./storage";
import { trySyncRules } from "./sync";
import { FIXER_ALL } from "./webfix";

/**
 * 根据href匹配规则
 * @param {*} rules
 * @param {string} href
 * @returns
 */
export const matchRule = async (
  href,
  { injectRules, subrulesList, owSubrule }
) => {
  const rules = await getRulesWithDefault();
  if (injectRules) {
    try {
      const selectedSub = subrulesList.find((item) => item.selected);
      if (selectedSub?.url) {
        const mixRule = {};
        Object.entries(owSubrule)
          .filter(([key, val]) => {
            if (
              owSubrule.textStyle === REMAIN_KEY &&
              (key === "bgColor" || key === "textDiyStyle")
            ) {
              return false;
            }
            return val !== REMAIN_KEY;
          })
          .forEach(([key, val]) => {
            mixRule[key] = val;
          });

        let subRules = await loadOrFetchSubRules(selectedSub.url);
        subRules = subRules.map((item) => ({ ...item, ...mixRule }));
        rules.splice(-1, 0, ...subRules);
      }
    } catch (err) {
      console.log("[load injectRules]", err);
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
    "terms",
    "selectStyle",
    "parentStyle",
    "injectJs",
    "injectCss",
    "fixerSelector",
  ].forEach((key) => {
    if (!rule[key]?.trim()) {
      rule[key] = globalRule[key];
    }
  });

  [
    "translator",
    "fromLang",
    "toLang",
    "transOpen",
    "transOnly",
    "transTiming",
    "transTag",
    "transTitle",
    "detectRemote",
    "fixerFunc",
  ].forEach((key) => {
    if (rule[key] === undefined || rule[key] === GLOBAL_KEY) {
      rule[key] = globalRule[key];
    }
  });

  if (!rule.skipLangs || rule.skipLangs.length === 0) {
    rule.skipLangs = globalRule.skipLangs;
  }
  if (rule.textStyle === GLOBAL_KEY) {
    rule.textStyle = globalRule.textStyle;
    rule.bgColor = globalRule.bgColor;
    rule.textDiyStyle = globalRule.textDiyStyle;
  } else {
    rule.bgColor = rule.bgColor?.trim() || globalRule.bgColor;
    rule.textDiyStyle = rule.textDiyStyle?.trim() || globalRule.textDiyStyle;
  }

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
        terms,
        selectStyle,
        parentStyle,
        injectJs,
        injectCss,
        translator,
        fromLang,
        toLang,
        textStyle,
        transOpen,
        bgColor,
        textDiyStyle,
        transOnly,
        transTiming,
        transTag,
        transTitle,
        detectRemote,
        skipLangs,
        fixerSelector,
        fixerFunc,
      }) => ({
        pattern: pattern.trim(),
        selector: type(selector) === "string" ? selector : "",
        keepSelector: type(keepSelector) === "string" ? keepSelector : "",
        terms: type(terms) === "string" ? terms : "",
        selectStyle: type(selectStyle) === "string" ? selectStyle : "",
        parentStyle: type(parentStyle) === "string" ? parentStyle : "",
        injectJs: type(injectJs) === "string" ? injectJs : "",
        injectCss: type(injectCss) === "string" ? injectCss : "",
        bgColor: type(bgColor) === "string" ? bgColor : "",
        textDiyStyle: type(textDiyStyle) === "string" ? textDiyStyle : "",
        translator: matchValue([GLOBAL_KEY, ...OPT_TRANS_ALL], translator),
        fromLang: matchValue([GLOBAL_KEY, ...fromLangs], fromLang),
        toLang: matchValue([GLOBAL_KEY, ...toLangs], toLang),
        textStyle: matchValue([GLOBAL_KEY, ...OPT_STYLE_ALL], textStyle),
        transOpen: matchValue([GLOBAL_KEY, "true", "false"], transOpen),
        transOnly: matchValue([GLOBAL_KEY, "true", "false"], transOnly),
        transTiming: matchValue([GLOBAL_KEY, ...OPT_TIMING_ALL], transTiming),
        transTag: matchValue([GLOBAL_KEY, "font", "span"], transTag),
        transTitle: matchValue([GLOBAL_KEY, "true", "false"], transTitle),
        detectRemote: matchValue([GLOBAL_KEY, "true", "false"], detectRemote),
        skipLangs: type(skipLangs) === "array" ? skipLangs : [],
        fixerSelector: type(fixerSelector) === "string" ? fixerSelector : "",
        fixerFunc: matchValue([GLOBAL_KEY, ...FIXER_ALL], fixerFunc),
      })
    );

  return rules;
};

/**
 * 保存或更新rule
 * @param {*} newRule
 */
export const saveRule = async (newRule) => {
  const rules = await getRulesWithDefault();
  const rule = rules.find((item) => isMatch(newRule.pattern, item.pattern));
  if (rule && rule.pattern !== GLOBAL_KEY) {
    Object.assign(rule, { ...newRule, pattern: rule.pattern });
  } else {
    rules.unshift(newRule);
  }
  await setRules(rules);
  trySyncRules();
};
