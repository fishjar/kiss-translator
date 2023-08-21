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

export const loadSyncOpt = async () =>
  (await storage.getObj(STOKEY_SYNC)) || DEFAULT_SYNC;

export const syncSetting = async () => {
  try {
    const { syncUrl, syncKey, settingUpdateAt } = await loadSyncOpt();
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
  } catch (err) {
    console.log("[sync setting]", err);
  }
};

export const syncRules = async () => {
  try {
    const { syncUrl, syncKey, rulesUpdateAt } = await loadSyncOpt();
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
  } catch (err) {
    console.log("[sync user rules]", err);
  }
};

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

export const syncAll = async () => {
  await syncSetting();
  await syncRules();
};
