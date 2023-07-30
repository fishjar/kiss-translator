import { fetchPolyfill } from "../libs/fetch";
import {
  KV_HEADER_KEY,
  KV_RULES_KEY,
  KV_SETTING_KEY,
  STOKEY_RULES,
  STOKEY_SETTING,
  STOKEY_RULES_UPDATE_AT,
} from "../config";
import { getSetting, getRules } from "../libs";
import storage from "../libs/storage";

/**
 * 同步数据
 * @param {*} param0
 * @returns
 */
const apiSyncData = async ({ key, value, updateAt }) => {
  const { syncUrl, syncKey } = await getSetting();
  if (!syncUrl || !syncKey) {
    console.log("data sync should set the api and key");
    return;
  }
  return fetchPolyfill(syncUrl, {
    headers: {
      "Content-type": "application/json",
      [KV_HEADER_KEY]: syncKey,
    },
    method: "POST",
    body: JSON.stringify({ key, value, updateAt }),
  });
};

/**
 * 同步rules
 * @param {*} value
 * @param {*} updateAt
 */
export const apiSyncRules = async (value, updateAt) => {
  const res = await apiSyncData({
    key: KV_RULES_KEY,
    value,
    updateAt,
  });
  console.log("res", res);
  if (res && res.updateAt > updateAt) {
    await storage.setObj(STOKEY_RULES, res.value);
    await storage.setObj(STOKEY_RULES_UPDATE_AT, res.updateAt);
  }
};

/**
 * 同步setting
 * @param {*} value
 * @param {*} updateAt
 */
export const apiSyncSetting = async (value, updateAt) => {
  const res = await apiSyncData({
    key: KV_SETTING_KEY,
    value,
    updateAt,
  });
  console.log("res", res);
  if (res && res.updateAt > updateAt) {
    await storage.setObj(STOKEY_SETTING, res.value);
  }
};

/**
 * 同步全部数据
 */
export const apiSyncAll = async () => {
  const setting = await getSetting();
  const rules = await getRules();
  const settingUpdateAt = setting.updateAt;
  const rulesUpdateAt = (await storage.getObj(STOKEY_RULES_UPDATE_AT)) || 1;
  await apiSyncSetting(setting, settingUpdateAt);
  await apiSyncRules(rules, rulesUpdateAt);
};
