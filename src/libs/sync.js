import {
  KV_SETTING_KEY,
  KV_RULES_KEY,
  KV_RULES_SHARE_KEY,
  KV_SALT_SHARE,
  OPT_SYNCTYPE_WEBDAV,
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

const syncByWorker = async ({
  key,
  value,
  syncUrl,
  syncKey,
  updateAt = 0,
  syncAt = 0,
  isBg = false,
  isForce = false,
}) => {
  if (isForce) {
    updateAt = Date.now();
  }
  return await apiSyncData(
    `${syncUrl}/sync`,
    syncKey,
    {
      key,
      value,
      updateAt: syncAt === 0 ? 0 : updateAt,
    },
    isBg
  );
};

/**
 * 同步设置
 * @returns
 */
const syncSetting = async (isBg = false, isForce = false) => {
  const {
    syncType,
    syncUrl,
    syncUser,
    syncKey,
    settingUpdateAt = 0,
    settingSyncAt = 0,
  } = await getSyncWithDefault();
  if (!syncUrl || !syncKey || (syncType === OPT_SYNCTYPE_WEBDAV && !syncUser)) {
    return;
  }

  const setting = await getSettingWithDefault();
  const res = await syncByWorker({
    key: KV_SETTING_KEY,
    value: setting,
    syncUrl,
    syncKey,
    updateAt: settingUpdateAt,
    syncAt: settingSyncAt,
    isBg,
    isForce,
  });

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
  const {
    syncType,
    syncUrl,
    syncUser,
    syncKey,
    rulesUpdateAt = 0,
    rulesSyncAt = 0,
  } = await getSyncWithDefault();
  if (!syncUrl || !syncKey || (syncType === OPT_SYNCTYPE_WEBDAV && !syncUser)) {
    return;
  }

  const rules = await getRulesWithDefault();
  const res = await syncByWorker({
    key: KV_RULES_KEY,
    value: rules,
    syncUrl,
    syncKey,
    updateAt: rulesUpdateAt,
    syncAt: rulesSyncAt,
    isBg,
    isForce,
  });

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
  await syncByWorker({
    key: KV_RULES_SHARE_KEY,
    value: rules,
    syncUrl,
    syncKey,
    updateAt: Date.now(),
    syncAt: Date.now(),
  });
  const psk = await sha256(syncKey, KV_SALT_SHARE);
  const shareUrl = `${syncUrl}/rules?psk=${psk}`;
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
