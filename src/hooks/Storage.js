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

  useEffect(() => {
    (async () => {
      setData(await storage.getObj(key));
    })();
  }, [key]);

  return { data, save, update, remove };
}

// /**
//  * 默认配置
//  */
// export const defaultStorage = {
//   [STOKEY_SETTING]: DEFAULT_SETTING,
//   [STOKEY_RULES]: DEFAULT_RULES,
//   [STOKEY_SYNC]: DEFAULT_SYNC,
// };

// const activeKeys = Object.keys(defaultStorage);

// const StoragesContext = createContext(null);

// export function StoragesProvider({ children }) {
//   const [storages, setStorages] = useState(null);

//   const handleChanged = (changes) => {
//     if (isWeb || isGm) {
//       const { key, oldValue, newValue } = changes;
//       changes = {
//         [key]: {
//           oldValue,
//           newValue,
//         },
//       };
//     }
//     const newStorages = {};
//     Object.entries(changes)
//       .filter(
//         ([key, { oldValue, newValue }]) =>
//           activeKeys.includes(key) && oldValue !== newValue
//       )
//       .forEach(([key, { newValue }]) => {
//         newStorages[key] = JSON.parse(newValue);
//       });
//     if (Object.keys(newStorages).length !== 0) {
//       setStorages((pre) => ({ ...pre, ...newStorages }));
//     }
//   };

//   useEffect(() => {
//     // 首次从storage同步配置到内存
//     (async () => {
//       const curStorages = {};
//       for (const key of activeKeys) {
//         const val = await storage.get(key);
//         if (val) {
//           curStorages[key] = JSON.parse(val);
//         } else {
//           await storage.setObj(key, defaultStorage[key]);
//           curStorages[key] = defaultStorage[key];
//         }
//       }
//       setStorages(curStorages);
//     })();

//     // 监听storage，并同步到内存中
//     storage.onChanged(handleChanged);

//     // 解除监听
//     return () => {
//       if (isExt) {
//         browser.storage.onChanged.removeListener(handleChanged);
//       } else {
//         window.removeEventListener("storage", handleChanged);
//       }
//     };
//   }, []);

//   return (
//     <StoragesContext.Provider value={storages}>
//       {children}
//     </StoragesContext.Provider>
//   );
// }

// export function useStorages() {
//   return useContext(StoragesContext);
// }
