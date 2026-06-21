import {
  STOKEY_SETTING,
  STOKEY_SETTING_BACKUP_V1_BEFORE_V2,
  STOKEY_SETTING_OLD,
  STOKEY_RULES,
  STOKEY_RULES_OLD,
  STOKEY_WORDS,
  STOKEY_FAB,
  STOKEY_TRANBOX,
  STOKEY_SYNC,
  STOKEY_MSAUTH,
  STOKEY_BDAUTH,
  STOKEY_RULESCACHE_PREFIX,
  STOKEY_DISABLED_SUB_RULES,
  DEFAULT_SETTING,
  DEFAULT_RULES,
  DEFAULT_SYNC,
  BUILTIN_RULES,
  getSettingVersion,
  migrateSettingPromptsToV2,
  SETTINGS_VERSION_V2,
} from "../config";
import { isExt, isGm } from "./client";
import { browser } from "./browser";
import { kissLog } from "./log";
import { debounce } from "./utils";
import { getGmMethod } from "./gm";

/**
 * 获取适用于当前环境的 GM (Greasemonkey) 存储引擎方法集合。
 * 返回的对象包含跨环境安全调用的 setValue, getValue, deleteValue 方法。
 * 查找优先级：
 * 1. window.KISS_GM：用于网页沙盒内通过 CustomEvent 与特权层通信的代理对象。
 * 2. 原生 GM Promise API (如 GM.setValue)。
 * 3. 旧版 GM_xxx 同步 API。
 * @returns {{setValue: Function, getValue: Function, deleteValue: Function}} 封装好的存储方法集合
 */
function getGmStorage() {
  return {
    setValue: getGmMethod("setValue", "GM_setValue", [window.KISS_GM]),
    getValue: getGmMethod("getValue", "GM_getValue", [window.KISS_GM]),
    deleteValue: getGmMethod("deleteValue", "GM_deleteValue", [window.KISS_GM]),
  };
}

/**
 * 跨平台存储底层写入操作。
 * 会自动适配 Chrome Extension (browser.storage.local)、Userscript 油猴环境 (GM.setValue)
 * 以及普通网页环境 (localStorage)。
 * @param {string} key 键名
 * @param {*} val 待写入的字符串数据
 */
async function set(key, val) {
  if (isExt) {
    await browser.storage.local.set({ [key]: val });
  } else if (isGm) {
    await getGmStorage().setValue(key, val);
  } else {
    window.localStorage.setItem(key, val);
  }
}

/**
 * 跨平台存储底层读取操作。
 * @param {string} key 键名
 * @returns {Promise<string|null>} 读取到的原始字符串数据
 */
async function get(key) {
  if (isExt) {
    const val = await browser.storage.local.get([key]);
    return val[key];
  } else if (isGm) {
    const val = await getGmStorage().getValue(key);
    return val;
  }
  return window.localStorage.getItem(key);
}

/**
 * 跨平台存储底层删除操作。
 * @param {string} key 键名
 */
async function del(key) {
  if (isExt) {
    await browser.storage.local.remove([key]);
  } else if (isGm) {
    await getGmStorage().deleteValue(key);
  } else {
    window.localStorage.removeItem(key);
  }
}

/**
 * 写入序列化后的对象数据。
 * @param {string} key 键名
 * @param {Object|Array} obj 待存入 of JS 对象或数组
 */
async function setObj(key, obj) {
  await set(key, JSON.stringify(obj));
}

/**
 * 尝试写入默认对象数据。仅在当前键名不存在任何值时才会触发写入。
 * @param {string} key 键名
 * @param {Object|Array} obj 默认值对象
 */
async function trySetObj(key, obj) {
  if (!(await get(key))) {
    await setObj(key, obj);
  }
}

/**
 * 读取并自动反序列化 JSON 字符串为 JS 对象。
 * @param {string} key 键名
 * @returns {Promise<Object|Array|null>} 返回反序列化后的数据，发生解析错误或为空时返回 null
 */
async function getObj(key) {
  const val = await get(key);
  if (val === null || val === undefined) return null;
  try {
    return JSON.parse(val);
  } catch (err) {
    kissLog("parse json in storage err: ", key);
  }
  return null;
}

/**
 * 局部合并并更新已存的对象数据。
 * REVIEW: 该方法采用 ES6 属性展开符进行浅拷贝合并。若原对象含有较深的嵌套子结构，
 * 在调用此方法更新子结构时需要调用者自行处理好深度合并，否则会导致深层字段丢失。
 * @param {string} key 键名
 * @param {Object} obj 待合并的数据切片
 */
async function putObj(key, obj) {
  const cur = (await getObj(key)) ?? {};
  await setObj(key, { ...cur, ...obj });
}

/**
 * 对外暴露的底层通用 storage 接口封装
 */
export const storage = {
  get,
  set,
  del,
  setObj,
  trySetObj,
  getObj,
  putObj,
};

// --- 应用设置 (Settings) 数据存取 ---
export const getSetting = () => getObj(STOKEY_SETTING);
export const getSettingOld = () => getObj(STOKEY_SETTING_OLD);
const writeSettingBackupBeforeV2 = (setting) =>
  setObj(STOKEY_SETTING_BACKUP_V1_BEFORE_V2, setting);
const mergeSettingWithDefault = (setting) => ({
  ...DEFAULT_SETTING,
  ...(setting || {}),
  version: setting?.version ?? DEFAULT_SETTING.version,
});
export const migrateStoredSettingToV2 = async (
  setting,
  backupSetting = setting
) => {
  if (getSettingVersion(setting) >= SETTINGS_VERSION_V2) {
    return setting;
  }

  await writeSettingBackupBeforeV2(backupSetting);
  return migrateSettingPromptsToV2(setting);
};

export const runDataMigration = async () => {
  const rawSetting = await getSetting();
  if (rawSetting && getSettingVersion(rawSetting) < SETTINGS_VERSION_V2) {
    try {
      const nextSetting = await migrateStoredSettingToV2(
        rawSetting,
        rawSetting
      );
      await setObj(STOKEY_SETTING, nextSetting);
      kissLog("Migration to V2 completed.");
    } catch (err) {
      kissLog("Data migration to V2 failed:", err);
    }
  }
};

export const getSettingWithDefault = async () => {
  const rawSetting = await getSetting();
  if (!rawSetting) {
    return DEFAULT_SETTING;
  }

  const setting =
    getSettingVersion(rawSetting) < SETTINGS_VERSION_V2
      ? migrateSettingPromptsToV2(rawSetting)
      : rawSetting;

  return mergeSettingWithDefault(setting);
};
export const setSetting = async (val) => setObj(STOKEY_SETTING, val);
export const putSetting = async (obj) => {
  const cur = (await getSetting()) ?? {};
  await setSetting({ ...cur, ...obj });
};

// --- 用户翻译规则 (Rules) 数据存取 ---
export const getRules = () => getObj(STOKEY_RULES);
export const getRulesOld = () => getObj(STOKEY_RULES_OLD);
export const getRulesWithDefault = async () =>
  (await getRules()) || DEFAULT_RULES;
export const setRules = (val) => setObj(STOKEY_RULES, val);

// --- 个人生词本词汇 (Fav Words) 数据存取 ---
export const getWords = () => getObj(STOKEY_WORDS);
export const getWordsWithDefault = async () => (await getWords()) || {};
export const setWords = (val) => setObj(STOKEY_WORDS, val);

// --- 订阅翻译规则 (Subscription Rules Cache) 数据存取 ---
export const getSubRules = (url) => getObj(STOKEY_RULESCACHE_PREFIX + url);
export const getSubRulesWithDefault = async () => (await getSubRules()) || [];
export const delSubRules = (url) => del(STOKEY_RULESCACHE_PREFIX + url);
export const setSubRules = (url, val) =>
  setObj(STOKEY_RULESCACHE_PREFIX + url, val);

/**
 * 获取指定订阅源中被用户手动禁用/屏蔽的匹配规则 (Pattern)。
 * @param {string} url 订阅规则的 URL
 * @returns {Promise<Array<string>>} 禁用的规则模式列表
 */
export const getDisabledSubRules = async (url) => {
  if (!url) return [];
  const raw = await getObj(STOKEY_DISABLED_SUB_RULES);
  if (!raw) return [];
  if (typeof raw === "object") {
    const list = raw[url];
    return Array.isArray(list) ? list : [];
  }
  return [];
};

/**
 * 屏蔽/禁用订阅规则中的特定规则匹配模式。
 * @param {string} url 订阅规则的 URL
 * @param {Array<string>} patterns 屏蔽的规则 pattern 数组
 */
export const setDisabledSubRules = async (url, patterns) => {
  if (!url) return;
  const map = (await getObj(STOKEY_DISABLED_SUB_RULES)) || {};
  const arr = Array.isArray(patterns) ? [...new Set(patterns)] : [];
  if (arr.length === 0) {
    if (map[url]) delete map[url];
  } else {
    map[url] = arr;
  }
  await setObj(STOKEY_DISABLED_SUB_RULES, map);
};

/**
 * 解除指定订阅规则源的所有屏蔽配置。
 * @param {string} url 订阅规则的 URL
 */
export const removeDisabledSubRules = async (url) => {
  if (!url) return;
  const raw = await getObj(STOKEY_DISABLED_SUB_RULES);
  if (!raw || typeof raw !== "object") return;
  if (raw[url]) {
    delete raw[url];
    await setObj(STOKEY_DISABLED_SUB_RULES, raw);
  }
};

// --- 悬浮球 (Fab Button) 位置及偏好存取 ---
export const getFab = () => getObj(STOKEY_FAB);
export const getFabWithDefault = async () => (await getFab()) || {};
export const setFab = (obj) => setObj(STOKEY_FAB, obj);
export const putFab = (obj) => putObj(STOKEY_FAB, obj);

// --- 交互翻译框 (TranBox UI) 位置与大小存取 ---
export const getTranBox = () => getObj(STOKEY_TRANBOX);
export const putTranBox = (obj) => putObj(STOKEY_TRANBOX, obj);
// 节流处理高频更新的 TranBox 位置写入
export const debouncePutTranBox = debounce(putTranBox, 300);

// --- 云同步元数据 (Sync Settings & Timestamps) 存取 ---
export const getSync = () => getObj(STOKEY_SYNC);
export const getSyncWithDefault = async () => (await getSync()) || DEFAULT_SYNC;
export const putSync = (obj) => putObj(STOKEY_SYNC, obj);
export const putSyncMeta = async (key) => {
  const { syncMeta = {} } = await getSyncWithDefault();
  syncMeta[key] = { ...(syncMeta[key] || {}), updateAt: Date.now() };
  await putSync({ syncMeta });
};
// 节流处理同步时间元数据的更新
export const debounceSyncMeta = debounce(putSyncMeta, 300);

// --- 微软云服务授权 Token 存取 ---
export const getMsauth = () => getObj(STOKEY_MSAUTH);
export const setMsauth = (val) => setObj(STOKEY_MSAUTH, val);

// --- 百度云服务授权 Token 存取 ---
export const getBdauth = () => getObj(STOKEY_BDAUTH);
export const setBdauth = (val) => setObj(STOKEY_BDAUTH, val);

/**
 * 首次加载或升级时，尝试向本地写入系统默认初始数据。
 * @param {string} uiLang 系统的默认语言设置
 */
export const tryInitDefaultData = async (uiLang) => {
  try {
    await trySetObj(STOKEY_SETTING, { ...DEFAULT_SETTING, uiLang });
    await trySetObj(STOKEY_RULES, DEFAULT_RULES);
    await trySetObj(STOKEY_SYNC, DEFAULT_SYNC);
    await trySetObj(
      `${STOKEY_RULESCACHE_PREFIX}${process.env.REACT_APP_RULESURL}`,
      BUILTIN_RULES
    );
  } catch (err) {
    kissLog("init default", err);
  }
};
