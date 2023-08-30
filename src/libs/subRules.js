import { getSyncWithDefault, updateSync } from "./storage";
import { apiFetchRules } from "../apis";

/**
 * 同步订阅规则
 * @param {*} url
 * @returns
 */
export const syncSubRules = async (url, isBg = false) => {
  const rules = await apiFetchRules(url, isBg);
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
    const { subRulesSyncAt } = await getSyncWithDefault();
    const now = Date.now();
    const interval = 24 * 60 * 60 * 1000; // 间隔一天
    if (now - subRulesSyncAt > interval) {
      await syncAllSubRules(subrulesList, isBg);
      await updateSync({ subRulesSyncAt: now });
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
export const loadOrFetchSubRules = async (url) => {
  const rules = await apiFetchRules(url);
  if (rules?.length) {
    return rules;
  }
  return await syncSubRules(url);
};
