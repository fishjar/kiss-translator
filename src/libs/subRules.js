import { GLOBAL_KEY } from "../config";
import {
  getSyncWithDefault,
  updateSync,
  setSubRules,
  getSubRules,
  updateSetting,
} from "./storage";
import { apiFetch } from "../apis";
import { checkRules } from "./rules";
import { isAllchar } from "./utils";

/**
 * 更新缓存同步时间
 * @param {*} url
 */
const updateSyncDataCache = async (url) => {
  const { dataCaches = {} } = await getSyncWithDefault();
  dataCaches[url] = Date.now();
  await updateSync({ dataCaches });
};

/**
 * 同步订阅规则
 * @param {*} url
 * @returns
 */
export const syncSubRules = async (url, isBg = false) => {
  const res = await apiFetch(url, isBg);
  const rules = checkRules(res).filter(
    ({ pattern }) => !isAllchar(pattern, GLOBAL_KEY)
  );
  if (rules.length > 0) {
    await setSubRules(url, rules);
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
      await updateSyncDataCache(subrules.url);
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
    subrulesList.forEach((item) => {
      item.syncAt = now;
    });
    await updateSetting({ subrulesList });
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
  let rules = await getSubRules(url);
  if (!rules || rules.length === 0) {
    rules = await syncSubRules(url);
    await updateSyncDataCache(url);
  }
  return rules || [];
};
