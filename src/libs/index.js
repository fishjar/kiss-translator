import storage from "./storage";
import {
  DEFAULT_SETTING,
  STOKEY_SETTING,
  STOKEY_RULES,
  GLOBLA_RULE,
  GLOBAL_KEY,
} from "../config";
import { browser } from "./browser";

/**
 * 获取节点列表并转为数组
 * @param {*} selector
 * @param {*} el
 * @returns
 */
export const queryEls = (selector, el = document) =>
  Array.from(el.querySelectorAll(selector));

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
 * 根据href匹配规则
 * TODO: 支持通配符（*）匹配
 * @param {*} rules
 * @param {string} href
 * @returns
 */
export const matchRule = (rules, href) => {
  const rule = rules.find((rule) =>
    rule.pattern
      .split(",")
      .some((p) => p.trim() === "*" || href.includes(p.trim()))
  );

  if (!rule) {
    return GLOBLA_RULE;
  }

  if (!rule?.selector?.trim()) {
    rule.selector = GLOBLA_RULE.selector;
  }

  rule.bgColor = rule?.bgColor?.trim() || GLOBLA_RULE?.bgColor?.trim();

  ["translator", "fromLang", "toLang", "textStyle", "transOpen"].forEach(
    (key) => {
      if (rule[key] === GLOBAL_KEY) {
        rule[key] = GLOBLA_RULE[key];
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
  const res = await browser?.i18n.detectLanguage(q);
  return res?.languages?.[0]?.language;
};
