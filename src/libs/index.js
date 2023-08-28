import storage from "./storage";
import {
  DEFAULT_SETTING,
  STOKEY_SETTING,
  STOKEY_RULES,
  STOKEY_FAB,
  GLOBLA_RULE,
  GLOBAL_KEY,
  DEFAULT_SUBRULES_LIST,
} from "../config";
import { browser } from "./browser";
import { isMatch } from "./utils";
import { loadSubRules } from "./rules";

/**
 * 查询storage中的设置
 * @returns
 */
export const getSetting = async () => ({
  ...DEFAULT_SETTING,
  ...((await storage.getObj(STOKEY_SETTING)) || {}),
});

/**
 * 查询规则列表
 * @returns
 */
export const getRules = async () => (await storage.getObj(STOKEY_RULES)) || [];

/**
 * 查询fab位置信息
 * @returns
 */
export const getFab = async () => (await storage.getObj(STOKEY_FAB)) || {};

/**
 * 设置fab位置信息
 * @returns
 */
export const setFab = async (obj) => await storage.setObj(STOKEY_FAB, obj);

/**
 * 根据href匹配规则
 * @param {*} rules
 * @param {string} href
 * @returns
 */
export const matchRule = async (
  rules,
  href,
  { injectRules = true, subrulesList = DEFAULT_SUBRULES_LIST }
) => {
  rules = [...rules];
  if (injectRules) {
    try {
      const selectedSub = subrulesList.find((item) => item.selected);
      if (selectedSub?.url) {
        const subRules = await loadSubRules(selectedSub.url);
        rules.splice(-1, 0, ...subRules);
      }
    } catch (err) {
      console.log("[load injectRules]", err);
    }
  }

  const rule = rules.find((r) =>
    r.pattern.split(",").some((p) => isMatch(href, p.trim()))
  );

  const globalRule =
    rules.find((r) => r.pattern.split(",").some((p) => p.trim() === "*")) ||
    GLOBLA_RULE;

  if (!rule) {
    return globalRule;
  }

  rule.selector =
    rule?.selector?.trim() ||
    globalRule?.selector?.trim() ||
    GLOBLA_RULE.selector;

  rule.bgColor = rule?.bgColor?.trim() || globalRule?.bgColor?.trim();

  ["translator", "fromLang", "toLang", "textStyle", "transOpen"].forEach(
    (key) => {
      if (rule[key] === GLOBAL_KEY) {
        rule[key] = globalRule[key];
      }
    }
  );

  return rule;
};

/**
 * 本地语言识别
 * @param {*} q
 * @returns
 */
export const detectLang = async (q) => {
  try {
    const res = await browser?.i18n?.detectLanguage(q);
    return res?.languages?.[0]?.language;
  } catch (err) {
    console.log("[detect lang]", err);
  }
};
