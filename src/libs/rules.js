import storage from "./storage";
import { fetchPolyfill } from "./fetch";
import { matchValue, type } from "./utils";
import {
  STOKEY_RULESCACHE_PREFIX,
  GLOBAL_KEY,
  OPT_TRANS_ALL,
  OPT_STYLE_ALL,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
} from "../config";

const fromLangs = OPT_LANGS_FROM.map((item) => item[0]);
const toLangs = OPT_LANGS_TO.map((item) => item[0]);

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
        translator,
        fromLang,
        toLang,
        textStyle,
        transOpen,
        bgColor,
      }) => ({
        pattern: pattern.trim(),
        selector: type(selector) === "string" ? selector : "",
        bgColor: type(bgColor) === "string" ? bgColor : "",
        translator: matchValue([GLOBAL_KEY, ...OPT_TRANS_ALL], translator),
        fromLang: matchValue([GLOBAL_KEY, ...fromLangs], fromLang),
        toLang: matchValue([GLOBAL_KEY, ...toLangs], toLang),
        textStyle: matchValue([GLOBAL_KEY, ...OPT_STYLE_ALL], textStyle),
        transOpen: matchValue([GLOBAL_KEY, "true", "false"], transOpen),
      })
    );

  return rules;
};

/**
 * 本地rules缓存
 */
export const rulesCache = {
  fetch: async (url) => {
    const res = await fetchPolyfill(url);
    const rules = checkRules(res).filter(
      (rule) => rule.pattern.replaceAll(GLOBAL_KEY, "") !== ""
    );
    return rules;
  },
  set: async (url, rules) => {
    await storage.setObj(`${STOKEY_RULESCACHE_PREFIX}${url}`, rules);
  },
  get: async (url) => {
    return await storage.getObj(`${STOKEY_RULESCACHE_PREFIX}${url}`);
  },
  del: async (url) => {
    await storage.del(`${STOKEY_RULESCACHE_PREFIX}${url}`);
  },
};

/**
 * 从缓存或远程加载订阅的rules
 * @param {*} url
 * @returns
 */
export const tryLoadRules = async (url) => {
  let rules = await rulesCache.get(url);
  if (rules?.length) {
    return rules;
  }
  rules = await rulesCache.fetch(url);
  await rulesCache.set(url, rules);
  return rules;
};
