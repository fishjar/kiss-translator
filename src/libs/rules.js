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
import { syncOpt } from "./sync";

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
 * 订阅规则的本地缓存
 */
export const rulesCache = {
  fetch: async (url, isBg = false) => {
    const res = await fetchPolyfill(url, { isBg });
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
 * 同步订阅规则
 * @param {*} url
 * @returns
 */
export const syncSubRules = async (url, isBg = false) => {
  const rules = await rulesCache.fetch(url, isBg);
  if (rules.length > 0) {
    await rulesCache.set(url, rules);
  }
  return rules;
};

/**
 * 同步所有订阅规则
 * @param {*} url
 * @returns
 */
export const syncAllSubRules = async (subrulesList, isBg = false) => {
  for (let subrules of subrulesList) {
    try {
      await syncSubRules(subrules.url, isBg);
    } catch (err) {
      console.log(`[sync subrule error]: ${subrules.url}`, err);
    }
  }
};

/**
 * 根据时间同步所有订阅规则
 * @param {*} url
 * @returns
 */
export const trySyncAllSubRules = async ({ subrulesList }, isBg = false) => {
  try {
    const { subRulesSyncAt } = await syncOpt.load();
    const now = Date.now();
    const interval = 24 * 60 * 60 * 1000; // 间隔一天
    if (now - subRulesSyncAt > interval) {
      await syncAllSubRules(subrulesList, isBg);
      await syncOpt.update({ subRulesSyncAt: now });
    }
  } catch (err) {
    console.log("[try sync all subrules]", err);
  }
};

/**
 * 从缓存或远程加载订阅规则
 * @param {*} url
 * @returns
 */
export const loadSubRules = async (url) => {
  const rules = await rulesCache.get(url);
  if (rules?.length) {
    return rules;
  }
  return await syncSubRules(url);
};
