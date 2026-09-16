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
  STOKEY_BDAUTH,
  STOKEY_RULESCACHE_PREFIX,
  STOKEY_DISABLED_SUB_RULES,
  DEFAULT_SETTING,
  DEFAULT_RULES,
  DEFAULT_SYNC,
  BUILTIN_RULES,
  getSettingVersion,
  migrateSettingPromptsToV2,
  migrateSettingToV3,
  SETTINGS_VERSION_V2,
  CURRENT_SETTINGS_VERSION,
  DEFAULT_TRANBOX_SETTING,
  normalizeApiThinkingSettings,
  KV_SETTING_KEY,
  KV_RULES_KEY,
  KV_WORDS_KEY,
} from "../config";
import { isExt, isGm } from "./client";
import { browser } from "./browser";
import { kissLog } from "./log";
import { debounce } from "./utils";
import { getGmMethod } from "./gmMethods";
import { publishStorageWrite } from "./storageEvents";
import { withStorageLock } from "./storageCoordination";
import { cloneStorageValue, isSameStorageValue } from "./storageEquality";

const SYNC_KEYS = {
  [STOKEY_SETTING]: KV_SETTING_KEY,
  [STOKEY_RULES]: KV_RULES_KEY,
  [STOKEY_WORDS]: KV_WORDS_KEY,
};
const sameValue = isSameStorageValue;
const EDIT_DEFAULTS = {
  [STOKEY_SETTING]: DEFAULT_SETTING,
  [STOKEY_RULES]: DEFAULT_RULES,
  [STOKEY_WORDS]: {},
  [STOKEY_SYNC]: DEFAULT_SYNC,
  [STOKEY_FAB]: {},
  [STOKEY_TRANBOX]: {},
};
const DESTINATION_FIELDS = [
  "syncType",
  "syncUrl",
  "syncUser",
  "syncKey",
  "syncEncryptKey",
];

/** Update metadata under the same boundary as related business writes. */
export function updateSyncState(updater, options) {
  return withTransaction((transaction) =>
    transaction.updateSyncState(updater, options)
  );
}

function preserveNewerSyncMeta(current, incoming) {
  const merged = { ...current, ...incoming };
  Object.entries(current || {}).forEach(([key, meta]) => {
    const next = incoming?.[key];
    if (
      !next ||
      meta.updateAt > next.updateAt ||
      (meta.updateAt === next.updateAt &&
        (meta.syncAt > next.syncAt ||
          (meta.syncAt === next.syncAt &&
            ((meta.pendingUpload && !next.pendingUpload) ||
              (meta.firstAttemptAt && !next.firstAttemptAt)))))
    ) {
      merged[key] = meta;
    }
  });
  return merged;
}

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
async function rawSet(key, val) {
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
async function rawGet(key) {
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
async function rawDel(key) {
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
  return withTransaction(async (transaction) => {
    if (key === STOKEY_SYNC) {
      const current = await transaction.getObj(key);
      return transaction.setObj(key, {
        ...obj,
        syncMeta: preserveNewerSyncMeta(current?.syncMeta, obj?.syncMeta),
      });
    }
    await transaction.setObj(key, obj);
  });
}

/**
 * 尝试写入默认对象数据。仅在当前键名不存在任何值时才会触发写入。
 * @param {string} key 键名
 * @param {Object|Array} obj 默认值对象
 */
async function trySetObj(key, obj) {
  return withTransaction(async (transaction) => {
    if ((await transaction.getObj(key)) === null)
      await transaction.setObj(key, obj);
  });
}

/**
 * 读取并自动反序列化 JSON 字符串为 JS 对象。
 * @param {string} key 键名
 * @returns {Promise<Object|Array|null>} 返回反序列化后的数据，发生解析错误或为空时返回 null
 */
function parseStoredValue(val, key) {
  if (val === null || val === undefined) return null;
  try {
    return JSON.parse(val);
  } catch (err) {
    kissLog("parse json in storage err: ", key);
  }
  return null;
}

async function getObj(key) {
  return parseStoredValue(await rawGet(key), key);
}

const get = rawGet;

async function set(key, value) {
  return withStorageLock(async (coordinator) => {
    if (coordinator?.commit)
      await coordinator.commit([{ key, value, previous: await rawGet(key) }]);
    else await rawSet(key, value);
  });
}

async function del(key) {
  return withTransaction((transaction) => transaction.del(key));
}

/** Stage writes, compensate failures, and notify only after persistence succeeds. */
export function withTransaction(operation) {
  return withStorageLock(async (coordinator) => {
    const writes = new Map();
    const originals = new Map();
    const read = async (key) => {
      if (writes.has(key)) return writes.get(key).value;
      if (!originals.has(key)) originals.set(key, await getObj(key));
      return originals.get(key);
    };
    const stage = async (key, value, remove = false, options = {}) => {
      const current =
        (await read(key)) ??
        (key === STOKEY_SYNC && (options.syncStateUpdate || options.userEdit)
          ? DEFAULT_SYNC
          : null);
      // Use the same defaults when comparing metadata-only changes.
      const configurationBaseline = options.syncStateUpdate
        ? writes.has(key)
          ? writes.get(key).configurationBaseline
          : current
        : originals.get(key);
      if (key === STOKEY_SYNC && value && current) {
        const destinationChanged = DESTINATION_FIELDS.some(
          (field) => current[field] !== value[field]
        );
        const revision = current.destinationRevision || 0;
        value = {
          ...value,
          ...(current.destinationRevision !== undefined ||
          (destinationChanged && !options.preserveDestination)
            ? {
                destinationRevision:
                  revision +
                  (destinationChanged && !options.preserveDestination ? 1 : 0),
              }
            : {}),
          ...(destinationChanged && !options.preserveDestination
            ? { syncMeta: {} }
            : {}),
        };
      }
      writes.set(key, { value, remove, configurationBaseline });
      return value;
    };
    const transaction = {
      getObj: read,
      setObj: (key, value) => stage(key, value),
      discard: (key) => writes.delete(key),
      del: (key) => stage(key, null, true),
      saveEdit: (key, valueOrFn, syncKey = SYNC_KEYS[key], options = {}) =>
        stageEdit(transaction, stage, key, valueOrFn, syncKey, options),
      updateSyncState: async (updater, { preserveDestination } = {}) => {
        const current = (await read(STOKEY_SYNC)) ?? DEFAULT_SYNC;
        const next = await updater(current, transaction);
        if (next === undefined) return current;
        return stage(STOKEY_SYNC, next, false, {
          preserveDestination,
          syncStateUpdate: true,
        });
      },
    };
    const result = await operation(transaction);
    if (!writes.size) return result;
    const persisted = new Map();
    const stageRaw = async (key, value) => {
      if (!persisted.has(key))
        persisted.set(key, { previous: await rawGet(key), value });
      else persisted.get(key).value = value;
    };
    for (const [key, { value, remove, configurationBaseline }] of writes) {
      const configFields = (sync) => {
        if (!sync) return sync;
        const { syncMeta, ...configuration } = sync;
        return configuration;
      };
      if (
        isGm &&
        key === STOKEY_SYNC &&
        !remove &&
        sameValue(configFields(configurationBaseline), configFields(value))
      ) {
        // Keep the original sync key and merge only metadata changed here.
        // Re-read configuration so a delayed update cannot restore an old target.
        const previous = configurationBaseline || DEFAULT_SYNC;
        const current = (await getObj(key)) || DEFAULT_SYNC;
        const changedDestination =
          (current.destinationRevision || 0) !==
            (previous.destinationRevision || 0) ||
          DESTINATION_FIELDS.some(
            (field) => current[field] !== previous[field]
          );
        if (changedDestination) {
          writes.delete(key);
          continue;
        }
        const changedMeta = Object.fromEntries(
          Object.entries(value.syncMeta || {}).filter(
            ([syncKey, meta]) => !sameValue(previous.syncMeta?.[syncKey], meta)
          )
        );
        const syncMeta = preserveNewerSyncMeta(current.syncMeta, changedMeta);
        Object.entries(changedMeta).forEach(([syncKey, meta]) => {
          // An accepted remote version may be older than the local edit.
          // Preserve newer metadata only if another origin changed this key.
          if (
            sameValue(current.syncMeta?.[syncKey], previous.syncMeta?.[syncKey])
          )
            syncMeta[syncKey] = meta;
        });
        const next = {
          ...current,
          syncMeta,
        };
        writes.get(key).value = next;
        await stageRaw(key, JSON.stringify(next));
        continue;
      }
      await stageRaw(key, remove ? null : JSON.stringify(value));
    }
    const attempted = [];
    try {
      if (coordinator?.commit) {
        await coordinator.commit(
          [...persisted].map(([key, entry]) => ({ key, ...entry }))
        );
      } else {
        for (const [key, { value }] of persisted) {
          attempted.push(key);
          if (value === null) await rawDel(key);
          else await rawSet(key, value);
        }
      }
    } catch (error) {
      for (const key of attempted.reverse()) {
        const { previous, value } = persisted.get(key);
        try {
          // Avoid compensation when a newer value is already observable.
          const stored = await rawGet(key);
          if (value === null ? stored != null : stored !== value) {
            // A concurrent writer makes the outcome of this edit indeterminate.
            if (stored !== previous && (stored != null || previous != null))
              error.storageOutcome = "unknown";
            continue;
          }
          if (previous === undefined || previous === null) await rawDel(key);
          else await rawSet(key, previous);
        } catch (recoveryError) {
          error.storageRecoveryFailed = true;
          error.storageOutcome = "unknown";
          kissLog("Unable to compensate a storage transaction", recoveryError);
        }
      }
      error.storageOutcome ||= "not-committed";
      throw error;
    }
    for (const [key, { value }] of writes) {
      publishStorageWrite(key, value, key === STOKEY_SYNC);
    }
    return result;
  }).catch((error) => {
    error.storageOutcome ||= "not-committed";
    throw error;
  });
}

/** Stage a pure edit and its metadata without acquiring another lock. */
async function stageEdit(
  transaction,
  stage,
  key,
  valueOrFn,
  syncKey,
  options = {}
) {
  const { timestamp = Date.now(), defaultValue = EDIT_DEFAULTS[key] } = options;
  const captured =
    typeof valueOrFn === "function" ? valueOrFn : cloneStorageValue(valueOrFn);
  const capturedDefault = cloneStorageValue(defaultValue);
  const previous = (await transaction.getObj(key)) ?? capturedDefault;
  const computed =
    typeof captured === "function"
      ? captured(cloneStorageValue(previous))
      : captured;
  if (computed && typeof computed.then === "function") {
    void Promise.resolve(computed).catch(() => {});
    throw new TypeError("Storage edit updaters must be synchronous");
  }
  let value = cloneStorageValue(computed);
  const current =
    key === STOKEY_SYNC
      ? previous
      : syncKey
        ? ((await transaction.getObj(STOKEY_SYNC)) ?? DEFAULT_SYNC)
        : undefined;
  const meta = current?.syncMeta?.[syncKey] || {};
  if (key === STOKEY_SYNC && value) {
    // Configuration edits cannot restore stale metadata or choose a revision.
    const { destinationRevision, ...configuration } = value;
    value = {
      ...configuration,
      syncMeta: cloneStorageValue(current?.syncMeta || {}),
      ...(current?.destinationRevision !== undefined
        ? { destinationRevision: current.destinationRevision }
        : {}),
    };
  }
  if (sameValue(previous, value))
    return {
      value: cloneStorageValue(previous),
      changed: false,
      updateAt: meta.updateAt || 0,
    };
  value = await stage(key, value, false, { userEdit: true });
  let updateAt = meta.updateAt || 0;
  if (syncKey) {
    updateAt = Math.max(timestamp, updateAt + 1);
    await transaction.updateSyncState(() => ({
      ...current,
      syncMeta: {
        ...current.syncMeta,
        [syncKey]: {
          ...meta,
          updateAt,
          ...(meta.firstAttemptAt ? { pendingUpload: true } : {}),
        },
      },
    }));
  }
  return { value: cloneStorageValue(value), changed: true, updateAt };
}

/** Keep an edit and its timestamp in the same ordered write operation. */
export function saveEdit(
  key,
  valueOrFn,
  syncKey = SYNC_KEYS[key],
  options = {}
) {
  const captured =
    typeof valueOrFn === "function" ? valueOrFn : cloneStorageValue(valueOrFn);
  const capturedOptions = {
    ...options,
    timestamp: options.timestamp ?? Date.now(),
    ...(options.defaultValue !== undefined
      ? { defaultValue: cloneStorageValue(options.defaultValue) }
      : {}),
  };
  return withTransaction((transaction) =>
    transaction.saveEdit(key, captured, syncKey, capturedOptions)
  );
}

/** Read business data and sync settings within the page's write boundary. */
export function readSyncSnapshot(storageKey) {
  return withTransaction(async (transaction) => {
    const rawValue = await transaction.getObj(storageKey);
    const syncConfig = (await transaction.getObj(STOKEY_SYNC)) || DEFAULT_SYNC;
    const value =
      storageKey === STOKEY_SETTING
        ? normalizeStoredSetting(rawValue)
        : storageKey === STOKEY_RULES
          ? rawValue || DEFAULT_RULES
          : storageKey === STOKEY_WORDS
            ? rawValue || {}
            : rawValue;
    return { value, syncConfig };
  });
}

/**
 * 局部合并并更新已存的对象数据。
 * REVIEW: 该方法采用 ES6 属性展开符进行浅拷贝合并。若原对象含有较深的嵌套子结构，
 * 在调用此方法更新子结构时需要调用者自行处理好深度合并，否则会导致深层字段丢失。
 * @param {string} key 键名
 * @param {Object} obj 待合并的数据切片
 */
async function putObj(key, obj) {
  return withTransaction(async (transaction) => {
    const cur = (await transaction.getObj(key)) ?? {};
    await transaction.setObj(key, { ...cur, ...obj });
  });
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
  withTransaction,
  saveEdit,
  readSyncSnapshot,
};

// --- 应用设置 (Settings) 数据存取 ---
export const getSetting = () => getObj(STOKEY_SETTING);
export const getSettingOld = () => getObj(STOKEY_SETTING_OLD);
const writeSettingBackupBeforeV2 = (setting) =>
  setObj(STOKEY_SETTING_BACKUP_V1_BEFORE_V2, setting);
const mergeSettingWithDefault = (setting) => {
  const mergedSetting = {
    ...DEFAULT_SETTING,
    ...(setting || {}),
    tranboxSetting: {
      ...DEFAULT_TRANBOX_SETTING,
      ...(setting?.tranboxSetting || {}),
    },
    version: setting?.version ?? DEFAULT_SETTING.version,
  };

  // 设置读取时只在内存中归一化一次，避免每次请求重复解析模型能力。
  return {
    ...mergedSetting,
    transApis: normalizeApiThinkingSettings(mergedSetting.transApis),
  };
};
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

/** Return false if migration cannot persist settings; reads still reject. */
export const runDataMigration = async () => {
  const rawSetting = await getSetting();
  if (!rawSetting) return true;

  const needsSchemaMigration =
    getSettingVersion(rawSetting) < CURRENT_SETTINGS_VERSION;
  const needsThemeMigration = typeof rawSetting.darkMode === "boolean";
  if (!needsSchemaMigration && !needsThemeMigration) return true;

  try {
    let nextSetting = rawSetting;
    if (needsSchemaMigration) {
      const v2Setting = await migrateStoredSettingToV2(rawSetting, rawSetting);
      nextSetting = migrateSettingToV3(v2Setting);
    }
    if (needsThemeMigration) {
      nextSetting = {
        ...nextSetting,
        darkMode: rawSetting.darkMode ? "dark" : "light",
      };
    }
    await setObj(STOKEY_SETTING, nextSetting);
    kissLog(`Migration to V${CURRENT_SETTINGS_VERSION} completed.`);
    return true;
  } catch (err) {
    kissLog(`Data migration to V${CURRENT_SETTINGS_VERSION} failed:`, err);
    return false;
  }
};

export const normalizeStoredSetting = (rawSetting) => {
  if (!rawSetting) {
    // 新安装同样通过统一入口得到最终思考设置，避免默认配置绕过归一化。
    return mergeSettingWithDefault(DEFAULT_SETTING);
  }

  let setting =
    getSettingVersion(rawSetting) < CURRENT_SETTINGS_VERSION
      ? migrateSettingToV3(rawSetting)
      : rawSetting;

  if (typeof setting.darkMode === "boolean") {
    setting = { ...setting, darkMode: setting.darkMode ? "dark" : "light" };
  }

  return mergeSettingWithDefault(setting);
};
export const getSettingWithDefault = async () =>
  normalizeStoredSetting(await getSetting());
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
export const putSync = (obj, options) =>
  updateSyncState((current) => {
    if (
      options?.expectedDestinationRevision !== undefined &&
      (current.destinationRevision || 0) !== options.expectedDestinationRevision
    ) {
      throw new Error("Sync destination changed during the request");
    }
    return {
      ...current,
      ...obj,
      ...(obj.syncMeta
        ? {
            syncMeta: preserveNewerSyncMeta(current.syncMeta, obj.syncMeta),
          }
        : {}),
    };
  }, options);
export const putSyncMeta = (key) => {
  const updateAt = Date.now();
  return updateSyncState((current) => ({
    ...current,
    syncMeta: {
      ...current.syncMeta,
      [key]: {
        ...current.syncMeta?.[key],
        updateAt: Math.max(
          updateAt,
          (current.syncMeta?.[key]?.updateAt || 0) + 1
        ),
      },
    },
  }));
};
// Keep the legacy name without delaying or discarding another key's metadata.
export const debounceSyncMeta = putSyncMeta;

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
