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
const syncSetting = async (isBg = false, isForce = false) => {
  let {
    syncUrl,
    syncKey,
    settingUpdateAt = 0,
    settingSyncAt = 0,
  } = await getSyncWithDefault();
  if (!syncUrl || !syncKey) {
    return;
  }

  if (isForce) {
    settingUpdateAt = Date.now();
  }

  const setting = await getSettingWithDefault();
  const res = await apiSyncData(
    syncUrl,
    syncKey,
    {
      key: KV_SETTING_KEY,
      value: setting,
      updateAt: settingSyncAt === 0 ? 0 : settingUpdateAt,
    },
    isBg
  );

  if (res.updateAt > settingUpdateAt) {
    await setSetting(res.value);
  }
  await updateSync({
    settingUpdateAt: res.updateAt,
    settingSyncAt: Date.now(),
  });

  return res.value;
};

export const trySyncSetting = async (isBg = false, isForce = false) => {
  try {
    return await syncSetting(isBg, isForce);
  } catch (err) {
    console.log("[sync setting]", err);
  }
};

/**
 * 同步规则
 * @returns
 */
const syncRules = async (isBg = false, isForce = false) => {
  let {
    syncUrl,
    syncKey,
    rulesUpdateAt = 0,
    rulesSyncAt = 0,
  } = await getSyncWithDefault();
  if (!syncUrl || !syncKey) {
    return;
  }

  if (isForce) {
    rulesUpdateAt = Date.now();
  }

  const rules = await getRulesWithDefault();
  const res = await apiSyncData(
    syncUrl,
    syncKey,
    {
      key: KV_RULES_KEY,
      value: rules,
      updateAt: rulesSyncAt === 0 ? 0 : rulesUpdateAt,
    },
    isBg
  );

  if (res.updateAt > rulesUpdateAt) {
    await setRules(res.value);
  }
  await updateSync({
    rulesUpdateAt: res.updateAt,
    rulesSyncAt: Date.now(),
  });

  return res.value;
};

export const trySyncRules = async (isBg = false, isForce = false) => {
  try {
    return await syncRules(isBg, isForce);
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
