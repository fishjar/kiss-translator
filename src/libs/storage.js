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
import { getGmMethod } from "./gm";
import { publishStorageWrite } from "./storageEvents";
import { withStorageLock } from "./storageCoordination";

const SYNC_KEYS = {
  [STOKEY_SETTING]: KV_SETTING_KEY,
  [STOKEY_RULES]: KV_RULES_KEY,
  [STOKEY_WORDS]: KV_WORDS_KEY,
};
const GM_RECORD_SCHEMA = "kiss-sync-record-v1";
const GM_ACK_SCHEMA = "kiss-sync-ack-v1";
const gmRecordKey = (key) => `${STOKEY_SYNC}:record:${key}`;
const gmAckKey = (key) => `${STOKEY_SYNC}:ack:${key}`;
const newRecordRevision = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random()}-${Math.random()}`;
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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

async function getGmRecord(key, records) {
  if (records?.has(key)) return records.get(key);
  const read = (async () => {
    const record = parseStoredValue(await rawGet(gmRecordKey(key)), key);
    return record?.schema === GM_RECORD_SCHEMA ? record : null;
  })();
  records?.set(key, read);
  return read;
}

async function getObj(key, records = new Map()) {
  if (isGm && SYNC_KEYS[key]) {
    const record = await getGmRecord(SYNC_KEYS[key], records);
    if (record && Object.prototype.hasOwnProperty.call(record, "value"))
      return record.value;
  }
  const value = parseStoredValue(await rawGet(key), key);
  if (!isGm || key !== STOKEY_SYNC) return value;
  const syncMeta = { ...(value?.syncMeta || {}) };
  let hasMetadata = false;
  const destinationRevision = value?.destinationRevision || 0;
  await Promise.all(
    Object.values(SYNC_KEYS).map(async (syncKey) => {
      const record = await getGmRecord(syncKey, records);
      const ack = parseStoredValue(await rawGet(gmAckKey(syncKey)), syncKey);
      let meta = syncMeta[syncKey];
      if (record && Object.prototype.hasOwnProperty.call(record, "meta")) {
        meta =
          (record.destinationRevision || 0) === destinationRevision
            ? record.meta
            : null;
      }
      if (
        ack?.schema === GM_ACK_SCHEMA &&
        ack.businessRevision === (record?.revision || "legacy") &&
        (ack.destinationRevision || 0) === destinationRevision
      )
        meta = ack.meta;
      if (meta === null || meta === undefined) delete syncMeta[syncKey];
      else {
        hasMetadata = true;
        syncMeta[syncKey] = meta;
      }
    })
  );
  return value || hasMetadata ? { ...(value || DEFAULT_SYNC), syncMeta } : null;
}

async function get(key) {
  if (isGm && (SYNC_KEYS[key] || key === STOKEY_SYNC)) {
    const value = await getObj(key);
    return value === null ? null : JSON.stringify(value);
  }
  return rawGet(key);
}

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
    const gmRecords = new Map();
    const errorHandlers = [];
    const read = async (key) => {
      if (writes.has(key)) return writes.get(key).value;
      if (!originals.has(key)) originals.set(key, await getObj(key, gmRecords));
      return originals.get(key);
    };
    const stage = async (key, value, remove = false, options = {}) => {
      const current =
        (await read(key)) ?? (options.syncStateUpdate ? DEFAULT_SYNC : null);
      // Metadata updates may read defaults without initializing configuration.
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
      } else if (
        isGm &&
        key === STOKEY_SYNC &&
        value &&
        DESTINATION_FIELDS.some(
          (field) =>
            value[field] !== undefined && value[field] !== DEFAULT_SYNC[field]
        )
      ) {
        // Bind imported configuration without discarding its metadata or
        // accepting acknowledgements from the unconfigured default state.
        value = {
          ...value,
          destinationRevision: Math.max(1, value.destinationRevision || 0),
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
      updateSyncState: async (
        updater,
        { onWriteError, preserveDestination } = {}
      ) => {
        const current = (await read(STOKEY_SYNC)) ?? DEFAULT_SYNC;
        const next = await updater(current, transaction);
        if (onWriteError) errorHandlers.push(onWriteError);
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
      if (isGm && SYNC_KEYS[key]) {
        const config = (await read(STOKEY_SYNC)) || DEFAULT_SYNC;
        await stageRaw(
          gmRecordKey(SYNC_KEYS[key]),
          JSON.stringify({
            schema: GM_RECORD_SCHEMA,
            revision: newRecordRevision(),
            destinationRevision: config.destinationRevision || 0,
            value,
            meta: config.syncMeta?.[SYNC_KEYS[key]] ?? null,
          })
        );
      } else if (isGm && key === STOKEY_SYNC) {
        const previous = originals.get(key);
        for (const [storageKey, syncKey] of Object.entries(SYNC_KEYS)) {
          if (
            !writes.has(storageKey) &&
            !sameValue(
              previous?.syncMeta?.[syncKey],
              value?.syncMeta?.[syncKey]
            )
          ) {
            const record = await getGmRecord(syncKey, gmRecords);
            await stageRaw(
              gmAckKey(syncKey),
              JSON.stringify({
                schema: GM_ACK_SCHEMA,
                businessRevision: record?.revision || "legacy",
                destinationRevision: value?.destinationRevision || 0,
                meta: value?.syncMeta?.[syncKey] ?? null,
              })
            );
          }
        }
        // Keep legacy inline metadata as a read fallback until each key is used.
        // Migrating every key here would race a write from another origin.
        const inlineMeta = (sync) =>
          Object.fromEntries(
            Object.entries(sync?.syncMeta || {}).filter(
              ([syncKey]) => !Object.values(SYNC_KEYS).includes(syncKey)
            )
          );
        const configFields = (sync) =>
          sync && { ...sync, syncMeta: inlineMeta(sync) };
        // An acknowledgement must never rewrite a destination changed elsewhere.
        // Compare this transaction's snapshots, not the latest stored config.
        if (
          remove ||
          !sameValue(configFields(configurationBaseline), configFields(value))
        ) {
          const rawConfig = parseStoredValue(await rawGet(key), key);
          const legacyMeta =
            (value?.destinationRevision || 0) ===
            (rawConfig?.destinationRevision || 0)
              ? Object.fromEntries(
                  Object.entries(rawConfig?.syncMeta || {}).filter(
                    ([syncKey]) => Object.values(SYNC_KEYS).includes(syncKey)
                  )
                )
              : {};
          const nextConfig = value && {
            ...value,
            syncMeta: { ...legacyMeta, ...inlineMeta(value) },
          };
          if (remove || !sameValue(rawConfig, nextConfig))
            await stageRaw(key, remove ? null : JSON.stringify(nextConfig));
        }
      } else {
        await stageRaw(key, remove ? null : JSON.stringify(value));
      }
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
          // GM has no cross-origin CAS; never compensate another page's write.
          const stored = await rawGet(key);
          if (value === null ? stored != null : stored !== value) continue;
          if (previous === undefined || previous === null) await rawDel(key);
          else await rawSet(key, previous);
        } catch (recoveryError) {
          error.storageRecoveryFailed = true;
          kissLog("Unable to compensate a storage transaction", recoveryError);
        }
      }
      for (const handler of errorHandlers) await handler(error);
      throw error;
    }
    for (const [key, { value }] of writes) {
      publishStorageWrite(
        key,
        isGm && key === STOKEY_SYNC ? await getObj(key) : value,
        key === STOKEY_SYNC
      );
    }
    return result;
  });
}

/** Persist an edit and its conflict timestamp before any sync may read either. */
export function saveEdit(
  key,
  valueOrFn,
  syncKey = SYNC_KEYS[key],
  options = {}
) {
  const { timestamp = Date.now(), pendingUpload = false } =
    typeof options === "number" ? { timestamp: options } : options;
  return withTransaction(async (transaction) => {
    const previous = await transaction.getObj(key);
    const value =
      typeof valueOrFn === "function" ? valueOrFn(previous) : valueOrFn;
    await transaction.setObj(key, value);
    if (!syncKey) return { value, updateAt: timestamp };
    const current = (await transaction.getObj(STOKEY_SYNC)) ?? DEFAULT_SYNC;
    const meta = current.syncMeta?.[syncKey] || {};
    const updateAt = Math.max(timestamp, (meta.updateAt || 0) + 1);
    await transaction.updateSyncState(() => ({
      ...current,
      syncMeta: {
        ...current.syncMeta,
        [syncKey]: {
          ...meta,
          updateAt,
          ...(pendingUpload || meta.firstAttemptAt
            ? { pendingUpload: true }
            : {}),
        },
      },
    }));
    return { value, updateAt };
  });
}

/** Read one business value and the metadata belonging to that exact record. */
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

  const setting =
    getSettingVersion(rawSetting) < CURRENT_SETTINGS_VERSION
      ? migrateSettingToV3(rawSetting)
      : rawSetting;

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
