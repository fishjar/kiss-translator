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
 * 更新指定订阅源的本地缓存同步时间戳。
 * @param {string} url 订阅规则的 URL
 */
const updateSyncDataCache = async (url) => {
  const { dataCaches = {} } = await getSyncWithDefault();
  dataCaches[url] = Date.now();
  await putSync({ dataCaches });
};

/**
 * 从远程 URL 同步/下载订阅规则，校验合法性后存入本地。
 * @param {string} url 订阅规则的远程地址
 * @returns {Promise<Array<Object>>} 过滤清洗后的规则列表
 */
export const syncSubRules = async (url) => {
  // 从远程拉取规则数据
  const res = await apiFetch(url);
  // 校验规则格式，并过滤掉 pattern 为全局匹配星号 "*" 的规则，以防止订阅规则劫持用户的全局设置
  const rules = checkRules(res).filter(
    ({ pattern }) => !isAllchar(pattern, GLOBAL_KEY)
  );
  if (rules.length > 0) {
    await setSubRules(url, rules);
  }
  return rules;
};

/**
 * 遍历并同步所有订阅规则源。
 * @param {Array<Object>} subrulesList 包含订阅信息的列表，每项需有 url 字段
 */
export const syncAllSubRules = async (subrulesList) => {
  for (const subrules of subrulesList) {
    try {
      await syncSubRules(subrules.url);
      await updateSyncDataCache(subrules.url);
    } catch (err) {
      // 记录单个订阅源同步失败的日志，不影响后续其他订阅源同步
      kissLog(`sync subrule error: ${subrules.url}`, err);
    }
  }
};

/**
 * 根据时间间隔（目前为24小时）尝试增量同步所有选中的订阅规则。
 * @param {Object} params
 * @param {Array<Object>} params.subrulesList 订阅列表
 */
export const trySyncAllSubRules = async ({ subrulesList }) => {
  try {
    const { subRulesSyncAt } = await getSyncWithDefault();
    const now = Date.now();
    const interval = 24 * 60 * 60 * 1000; // 间隔一天

    // REVIEW: 只要距离上次成功时间超过 1 天，就会开始同步。
    // 在循环调用 syncAllSubRules 中，如果有些订阅源由于网络原因失败了，
    // 此处依然会执行 putSync({ subRulesSyncAt: now }) 更新最后同步时间。
    // 这样会导致那些失败的订阅规则在未来 24 小时内不会再次触发自动同步。
    // 建议对同步失败的订阅源，在本地进行标记，并在短时间（如 1 小时）后重试。
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
 * 优先从本地缓存加载订阅规则，缓存不存在或为空时再发起网络同步。
 * @param {string} url 订阅规则的 URL
 * @returns {Promise<Array<Object>>} 订阅规则数组，报错或为空时返回空数组 `[]`
 */
export const loadOrFetchSubRules = async (url) => {
  let rules = await getSubRules(url);
  // 如果本地没有缓存，或者缓存数据为空，则请求网络拉取
  if (!rules || rules.length === 0) {
    rules = await syncSubRules(url);
    await updateSyncDataCache(url);
  }
  return rules || [];
};
