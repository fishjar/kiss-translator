import {
  APP_LCNAME,
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
import { createClient, getPatcher } from "webdav";
import { fetchApi } from "./fetch";

getPatcher().patch("request", (opts) => {
  return fetchApi({
    input: opts.url,
    init: { method: opts.method, headers: opts.headers, body: opts.data },
  });
});

const syncByWebdav = async ({
  key,
  value,
  syncUrl,
  syncUser,
  syncKey,
  updateAt = 0,
  syncAt = 0,
  isForce = false,
}) => {
  const client = createClient(syncUrl, {
    username: syncUser,
    password: syncKey,
  });
  const pathname = `/${APP_LCNAME}`;
  const filename = `/${APP_LCNAME}/${key}`;
  const data = JSON.stringify(value, null, "  ");

  if ((await client.exists(pathname)) === false) {
    await client.createDirectory(pathname);
  }

  const isExist = await client.exists(filename);
  if (isExist && !isForce) {
    const { lastmod } = await client.stat(filename);
    const fileUpdateAt = Date.parse(lastmod);
    if (syncAt === 0 || fileUpdateAt > updateAt) {
      const data = await client.getFileContents(filename, { format: "text" });
      return { updateAt: fileUpdateAt, value: JSON.parse(data) };
    }
  }

  await client.putFileContents(filename, data);
  const { lastmod } = await client.stat(filename);
  const fileUpdateAt = Date.parse(lastmod);
  return { updateAt: fileUpdateAt, value };
};

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
  const args = {
    key: KV_SETTING_KEY,
    value: setting,
    syncUrl,
    syncUser,
    syncKey,
    updateAt: settingUpdateAt,
    syncAt: settingSyncAt,
    isBg,
    isForce,
  };
  const res =
    syncType === OPT_SYNCTYPE_WEBDAV
      ? await syncByWebdav(args)
      : await syncByWorker(args);

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
  const args = {
    key: KV_RULES_KEY,
    value: rules,
    syncUrl,
    syncUser,
    syncKey,
    updateAt: rulesUpdateAt,
    syncAt: rulesSyncAt,
    isBg,
    isForce,
  };
  const res =
    syncType === OPT_SYNCTYPE_WEBDAV
      ? await syncByWebdav(args)
      : await syncByWorker(args);

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
  const args = {
    key: KV_RULES_SHARE_KEY,
    value: rules,
    syncUrl,
    syncKey,
    updateAt: Date.now(),
    syncAt: Date.now(),
  };
  await syncByWorker(args);
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
