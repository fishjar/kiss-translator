import { CACHE_NAME } from "../config";

/**
 * 清除缓存数据
 */
export const tryClearCaches = async () => {
  try {
    caches.delete(CACHE_NAME);
  } catch (err) {
    console.log("[clean caches]", err.message);
  }
};
