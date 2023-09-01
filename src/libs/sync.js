import {
  KV_SETTING_KEY,
  KV_RULES_KEY,
  KV_RULES_SHARE_KEY,
  KV_SALT_SHARE,
} from "../config";
import {
  getSyncWithDefault,
  updateSync,
  getSettingWithDefault,
  getRulesWithDefault,
  setSetting,
  setRules,
} from "./storage";
import { apiSyncData } from "../apis";
import { sha256 } from "./utils";

/**
 * 同步设置
 * @returns
 */
const syncSetting = async (isBg = false) => {
  const { syncUrl, syncKey, settingUpdateAt } = await getSyncWithDefault();
  if (!syncUrl || !syncKey) {
    return;
  }

  const setting = await getSettingWithDefault();
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
    await updateSync({
      settingUpdateAt: res.updateAt,
      settingSyncAt: res.updateAt,
    });
    await setSetting(res.value);
    return res.value;
  } else {
    await updateSync({ settingSyncAt: res.updateAt });
  }
};

export const trySyncSetting = async (isBg = false) => {
  try {
    return await syncSetting(isBg);
  } catch (err) {
    console.log("[sync setting]", err);
  }
};

/**
 * 同步规则
 * @returns
 */
const syncRules = async (isBg = false) => {
  const { syncUrl, syncKey, rulesUpdateAt } = await getSyncWithDefault();
  if (!syncUrl || !syncKey) {
    return;
  }

  const rules = await getRulesWithDefault();
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
    await updateSync({
      rulesUpdateAt: res.updateAt,
      rulesSyncAt: res.updateAt,
    });
    await setRules(res.value);
    return res.value;
  } else {
    await updateSync({ rulesSyncAt: res.updateAt });
  }
};

export const trySyncRules = async (isBg = false) => {
  try {
    return await syncRules(isBg);
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
export const syncSettingAndRules = async (isBg = false) => {
  return [await syncSetting(isBg), await syncRules(isBg)];
};

export const trySyncSettingAndRules = async (isBg = false) => {
  return [await trySyncSetting(isBg), await trySyncRules(isBg)];
};
