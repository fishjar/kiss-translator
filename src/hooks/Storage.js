import { useCallback, useEffect, useState } from "react";
import { storage } from "../libs/storage";

/**
 * 
 * @param {*} key 
 * @param {*} defaultVal 需为调用hook外的常量
 * @returns 
 */
export function useStorage(key, defaultVal) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const save = useCallback(
    async (val) => {
      setData(val);
      await storage.setObj(key, val);
    },
    [key]
  );

  const update = useCallback(
    async (obj) => {
      setData((pre = {}) => ({ ...pre, ...obj }));
      await storage.putObj(key, obj);
    },
    [key]
  );

  const remove = useCallback(async () => {
    setData(null);
    await storage.del(key);
  }, [key]);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const val = await storage.getObj(key);
      if (val) {
        setData(val);
      }
    } catch (err) {
      console.log("[storage reload]", err.message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const val = await storage.getObj(key);
        if (val) {
          setData(val);
        } else if (defaultVal) {
          setData(defaultVal);
          await storage.setObj(key, defaultVal);
        }
      } catch (err) {
        console.log("[storage load]", err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [key, defaultVal]);

  return { data, save, update, remove, reload, loading };
}
