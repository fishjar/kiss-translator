import { useCallback, useMemo } from "react";
import { STOKEY_SYNC, DEFAULT_SYNC } from "../config";
import { useStorage } from "./Storage";

/**
 * 远端云同步（如 WebDAV）配置数据的读取与更新自定义 Hook
 * @returns {object} { sync: *, updateSync: function, reloadSync: function }
 */
export function useSync() {
  // 使用 useStorage 代理同步配置 STOKEY_SYNC 的持久化存储
  const { data, update, reload } = useStorage(STOKEY_SYNC, DEFAULT_SYNC);
  return { sync: data, updateSync: update, reloadSync: reload };
}

/**
 * 更新特定同步配置键对应更新时间戳的自定义 Hook
 * 用于向云端元数据标识该类配置发生了更改
 * @returns {object} { updateSyncMeta: function }
 */
export function useSyncMeta() {
  const { updateSync } = useSync();

  // 接收一个规则或配置的 key (例如 'rules', 'setting')，更新其对应的 syncMeta 时间戳并写入存储
  const updateSyncMeta = useCallback(
    (key) => {
      updateSync((prevSync) => {
        const newSyncMeta = {
          ...(prevSync?.syncMeta || {}),
          [key]: {
            ...(prevSync?.syncMeta?.[key] || {}),
            updateAt: Date.now(),
          },
        };
        return { syncMeta: newSyncMeta };
      });
    },
    [updateSync]
  );

  return { updateSyncMeta };
}

/**
 * 同步网页缓存数据的自定义 Hook，记录网页是否已被成功同步/缓存过及对应时间戳
 * @returns
 */
export function useSyncCaches() {
  const { sync, updateSync, reloadSync } = useSync();

  // 将特定网页 URL 的最新同步缓存时间记录为当前时间戳
  const updateDataCache = useCallback(
    (url) => {
      updateSync((prevSync) => ({
        dataCaches: {
          ...(prevSync?.dataCaches || {}),
          [url]: Date.now(),
        },
      }));
    },
    [updateSync]
  );

  // 删除特定网页 URL 的同步缓存记录
  const deleteDataCache = useCallback(
    (url) => {
      updateSync((prevSync) => {
        const newDataCaches = { ...(prevSync?.dataCaches || {}) };
        delete newDataCaches[url];
        return { dataCaches: newDataCaches };
      });
    },
    [updateSync]
  );

  // 对 dataCaches 缓存映射对象进行缓存优化
  const dataCaches = useMemo(() => sync?.dataCaches || {}, [sync?.dataCaches]);

  return {
    dataCaches,
    updateDataCache,
    deleteDataCache,
    reloadSync,
  };
}
