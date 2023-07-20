import storage from "./storage";
import {
  DEFAULT_SETTING,
  STOKEY_SETTING,
  STOKEY_RULES,
  DEFAULT_RULE,
} from "../config";
import browser from "./browser";

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
export const matchRule = (rules, href) =>
  rules.find((rule) =>
    rule.pattern
      .split(",")
      .some((p) => p.trim() === "*" || href.includes(p.trim()))
  ) || DEFAULT_RULE;

/**
 * 本地语言识别
 * @param {*} q
 * @returns
 */
export const detectLang = async (q) => {
  const res = await browser?.i18n.detectLanguage(q);
  return res?.languages?.[0]?.language;
};
