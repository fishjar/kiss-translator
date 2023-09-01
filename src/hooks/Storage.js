import { useCallback, useEffect, useState } from "react";
import { storage } from "../libs/storage";

export function useStorage(key, defaultVal = null) {
  const [data, setData] = useState(defaultVal);

  const save = useCallback(
    async (val) => {
      setData(val);
      await storage.setObj(key, val);
    },
    [key]
  );

  const update = useCallback(
    async (obj) => {
      setData((pre) => ({ ...pre, ...obj }));
      await storage.putObj(key, obj);
    },
    [key]
  );

  const remove = useCallback(async () => {
    setData(null);
    await storage.del(key);
  }, [key]);

  const reload = useCallback(async () => {
    const val = await storage.getObj(key);
    if (val) {
      setData(val);
    } else if (defaultVal) {
      await storage.setObj(key, defaultVal);
    }
  }, [key, defaultVal]);

  useEffect(() => {
    (async () => {
      await reload();
    })();
  }, [reload]);

  return { data, save, update, remove, reload };
}
