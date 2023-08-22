import {
  STOKEY_SYNC,
  DEFAULT_SYNC,
  KV_SETTING_KEY,
  KV_RULES_KEY,
  KV_RULES_SHARE_KEY,
  STOKEY_SETTING,
  STOKEY_RULES,
  KV_SALT_SHARE,
} from "../config";
import storage from "../libs/storage";
import { getSetting, getRules } from ".";
import { apiSyncData } from "../apis";
import { sha256 } from "./utils";

/**
 * 同步相关数据
 */
export const syncOpt = {
  load: async () => (await storage.getObj(STOKEY_SYNC)) || DEFAULT_SYNC,
  update: async (obj) => {
    await storage.putObj(STOKEY_SYNC, obj);
  },
};

/**
 * 同步设置
 * @returns
 */
export const syncSetting = async (isBg = false) => {
  try {
    const { syncUrl, syncKey, settingUpdateAt } = await syncOpt.load();
    if (!syncUrl || !syncKey) {
      return;
    }

    const setting = await getSetting();
    const res = await apiSyncData(
      syncUrl,
      syncKey,
      {
        key: KV_SETTING_KEY,
        value: setting,
        updateAt: settingUpdateAt,
      },
      isBg
    );

    if (res && res.updateAt > settingUpdateAt) {
      await syncOpt.update({
        settingUpdateAt: res.updateAt,
        settingSyncAt: res.updateAt,
      });
      await storage.setObj(STOKEY_SETTING, res.value);
    } else {
      await syncOpt.update({ settingSyncAt: res.updateAt });
    }
  } catch (err) {
    console.log("[sync setting]", err);
  }
};

/**
 * 同步规则
 * @returns
 */
export const syncRules = async (isBg = false) => {
  try {
    const { syncUrl, syncKey, rulesUpdateAt } = await syncOpt.load();
    if (!syncUrl || !syncKey) {
      return;
    }

    const rules = await getRules();
    const res = await apiSyncData(
      syncUrl,
      syncKey,
      {
        key: KV_RULES_KEY,
        value: rules,
        updateAt: rulesUpdateAt,
      },
      isBg
    );

    if (res && res.updateAt > rulesUpdateAt) {
      await syncOpt.update({
        rulesUpdateAt: res.updateAt,
        rulesSyncAt: res.updateAt,
      });
      await storage.setObj(STOKEY_RULES, res.value);
    } else {
      await syncOpt.update({ rulesSyncAt: res.updateAt });
    }
  } catch (err) {
    console.log("[sync user rules]", err);
  }
};

/**
 * 同步分享规则
 * @param {*} param0
 * @returns
 */
export const syncShareRules = async ({ rules, syncUrl, syncKey }) => {
  await apiSyncData(syncUrl, syncKey, {
    key: KV_RULES_SHARE_KEY,
    value: rules,
    updateAt: Date.now(),
  });
  const psk = await sha256(syncKey, KV_SALT_SHARE);
  const shareUrl = `${syncUrl}?psk=${psk}`;
  return shareUrl;
};

/**
 * 同步个人设置和规则
 * @returns
 */
export const syncAll = async (isBg = false) => {
  await syncSetting(isBg);
  await syncRules(isBg);
};
