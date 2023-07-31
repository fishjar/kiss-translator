import {
  STOKEY_SYNC,
  DEFAULT_SYNC,
  KV_SETTING_KEY,
  KV_RULES_KEY,
  STOKEY_SETTING,
  STOKEY_RULES,
} from "../config";
import storage from "../libs/storage";
import { getSetting, getRules } from ".";
import { apiSyncData } from "../apis";

const loadOpt = async () => (await storage.getObj(STOKEY_SYNC)) || DEFAULT_SYNC;

export const syncSetting = async () => {
  const { syncUrl, syncKey, settingUpdateAt } = await loadOpt();
  if (!syncUrl || !syncKey) {
    return;
  }

  const setting = await getSetting();
  const res = await apiSyncData(syncUrl, syncKey, {
    key: KV_SETTING_KEY,
    value: setting,
    updateAt: settingUpdateAt,
  });

  if (res && res.updateAt > settingUpdateAt) {
    await storage.putObj(STOKEY_SYNC, {
      settingUpdateAt: res.updateAt,
      settingSyncAt: res.updateAt,
    });
    await storage.setObj(STOKEY_SETTING, res.value);
  } else {
    await storage.putObj(STOKEY_SYNC, {
      settingSyncAt: res.updateAt,
    });
  }
};

export const syncRules = async () => {
  const { syncUrl, syncKey, rulesUpdateAt } = await loadOpt();
  if (!syncUrl || !syncKey) {
    return;
  }

  const rules = await getRules();
  const res = await apiSyncData(syncUrl, syncKey, {
    key: KV_RULES_KEY,
    value: rules,
    updateAt: rulesUpdateAt,
  });

  if (res && res.updateAt > rulesUpdateAt) {
    await storage.putObj(STOKEY_SYNC, {
      rulesUpdateAt: res.updateAt,
      rulesSyncAt: res.updateAt,
    });
    await storage.setObj(STOKEY_RULES, res.value);
  } else {
    await storage.putObj(STOKEY_SYNC, {
      rulesSyncAt: res.updateAt,
    });
  }
};

export const syncAll = async () => {
  try {
    await syncSetting();
    await syncRules();
  } catch (err) {
    console.log("[sync all]", err);
  }
};
