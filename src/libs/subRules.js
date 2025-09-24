import { GLOBAL_KEY } from "../config";
import {
  getSyncWithDefault,
  putSync,
  setSubRules,
  getSubRules,
} from "./storage";
import { apiFetch } from "../apis";
import { checkRules } from "./rules";
import { isAllchar } from "./utils";
import { kissLog } from "./log";

/**
 * 更新缓存同步时间
 * @param {*} url
 */
const updateSyncDataCache = async (url) => {
  const { dataCaches = {} } = await getSyncWithDefault();
  dataCaches[url] = Date.now();
  await putSync({ dataCaches });
};

/**
 * 同步订阅规则
 * @param {*} url
 * @returns
 */
export const syncSubRules = async (url) => {
  const res = await apiFetch(url);
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
export const syncAllSubRules = async (subrulesList) => {
  for (const subrules of subrulesList) {
    try {
      await syncSubRules(subrules.url);
      await updateSyncDataCache(subrules.url);
    } catch (err) {
      kissLog(`sync subrule error: ${subrules.url}`, err);
    }
  }
};

/**
 * 根据时间同步所有订阅规则
 * @param {*} url
 * @returns
 */
export const trySyncAllSubRules = async ({ subrulesList }) => {
  try {
    const { subRulesSyncAt } = await getSyncWithDefault();
    const now = Date.now();
    const interval = 24 * 60 * 60 * 1000; // 间隔一天
    if (now - subRulesSyncAt > interval) {
      // 同步订阅规则
      await syncAllSubRules(subrulesList);
      await putSync({ subRulesSyncAt: now });
    }
  } catch (err) {
    kissLog("try sync all subrules", err);
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
