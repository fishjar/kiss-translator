import { useCallback, useEffect, useState } from "react";
import { storage } from "../libs/storage";
import { kissLog } from "../libs/log";
import { syncData } from "../libs/sync";
import { useDebouncedCallback } from "./DebouncedCallback";

/**
 * 用于将组件状态与 Storage 同步
 *
 * @param {string} key 用于在 Storage 中存取值的键
 * @param {*} defaultVal 默认值。建议在组件外定义为常量。
 * @param {string} [syncKey=""] 用于远端同步的可选键名
 * @returns {{
 * data: *,
 * save: (valueOrFn: any | ((prevData: any) => any)) => void,
 * update: (partialDataOrFn: object | ((prevData: object) => object)) => void,
 * remove: () => Promise<void>,
 * reload: () => Promise<void>
 * }}
 */
export function useStorage(key, defaultVal = null, syncKey = "") {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(defaultVal);

  // 首次加载数据
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        const storedVal = await storage.getObj(key);
        if (storedVal === undefined || storedVal === null) {
          await storage.setObj(key, defaultVal);
        } else if (isMounted) {
          setData(storedVal);
        }
      } catch (err) {
        kissLog(`storage load error for key: ${key}`, err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [key, defaultVal]);

  // 远端同步
  const runSync = useCallback(async (keyToSync, valueToSync) => {
    try {
      const res = await syncData(keyToSync, valueToSync);
      if (res?.isNew) {
        setData(res.value);
      }
    } catch (error) {
      kissLog("Sync failed", keyToSync);
    }
  }, []);

  const debouncedSync = useDebouncedCallback(runSync, 3000);

  // 持久化
  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (data === null) {
      return;
    }

    storage.setObj(key, data).catch((err) => {
      kissLog(`storage save error for key: ${key}`, err);
    });

    // 触发远端同步
    if (syncKey) {
      debouncedSync(syncKey, data);
    }
  }, [key, syncKey, isLoading, data, debouncedSync]);

  /**
   * 全量替换状态值
   * @param {any | ((prevData: any) => any)} valueOrFn 新的值或一个返回新值的函数。
   */
  const save = useCallback((valueOrFn) => {
    // kissLog("save storage:", valueOrFn);
    setData((prevData) =>
      typeof valueOrFn === "function" ? valueOrFn(prevData) : valueOrFn
    );
  }, []);

  /**
   * 合并对象到当前状态（假设状态是一个对象）。
   * @param {object | ((prevData: object) => object)} partialDataOrFn 要合并的对象或一个返回该对象的函数。
   */
  const update = useCallback((partialDataOrFn) => {
    // kissLog("update storage:", partialDataOrFn);
    setData((prevData) => {
      const partialData =
        typeof partialDataOrFn === "function"
          ? partialDataOrFn(prevData)
          : partialDataOrFn;
      // 确保 preData 是一个对象，避免展开 null 或 undefined
      const baseObj =
        typeof prevData === "object" && prevData !== null ? prevData : {};
      return { ...baseObj, ...partialData };
    });
  }, []);

  /**
   * 从 Storage 中删除该值，并将状态重置为 null。
   */
  const remove = useCallback(async () => {
    // kissLog("remove storage:");
    try {
      await storage.del(key);
      setData(null);
    } catch (err) {
      kissLog(`storage remove error for key: ${key}`, err);
    }
  }, [key]);

  /**
   * 从 Storage 重新加载数据以覆盖当前状态。
   */
  const reload = useCallback(async () => {
    // kissLog("reload storage:");
    try {
      const storedVal = await storage.getObj(key);
      setData(storedVal ?? defaultVal);
    } catch (err) {
      kissLog(`storage reload error for key: ${key}`, err);
      // setData(defaultVal);
    }
  }, [key, defaultVal]);

  return { data, save, update, remove, reload, isLoading };
}
