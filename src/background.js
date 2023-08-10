import browser from "webextension-polyfill";
import {
  MSG_FETCH,
  MSG_FETCH_LIMIT,
  DEFAULT_SETTING,
  DEFAULT_RULES,
  DEFAULT_SYNC,
  STOKEY_SETTING,
  STOKEY_RULES,
  STOKEY_SYNC,
  CACHE_NAME,
} from "./config";
import storage from "./libs/storage";
import { getSetting } from "./libs";
import { syncAll } from "./libs/sync";
import { fetchData, fetchPool } from "./libs/fetch";

/**
 * 插件安装
 */
browser.runtime.onInstalled.addListener(() => {
  console.log("onInstalled");
  storage.trySetObj(STOKEY_SETTING, DEFAULT_SETTING);
  storage.trySetObj(STOKEY_RULES, DEFAULT_RULES);
  storage.trySetObj(STOKEY_SYNC, DEFAULT_SYNC);
});

/**
 * 浏览器启动
 */
browser.runtime.onStartup.addListener(async () => {
  console.log("onStartup");

  // 同步数据
  await syncAll();

  // 清除缓存
  const { clearCache } = await getSetting();
  if (clearCache) {
    caches.delete(CACHE_NAME);
  }
});

/**
 * 监听消息
 */
browser.runtime.onMessage.addListener(
  ({ action, args }, sender, sendResponse) => {
    switch (action) {
      case MSG_FETCH:
        const { input, init, opts } = args;
        fetchData(input, init, opts)
          .then((data) => {
            sendResponse({ data });
          })
          .catch((error) => {
            sendResponse({ error: error.message });
          });
        break;
      case MSG_FETCH_LIMIT:
        const { interval, limit } = args;
        fetchPool.update(interval, limit);
        sendResponse({ data: "ok" });
        break;
      default:
        sendResponse({ error: `message action is unavailable: ${action}` });
    }
    return true;
  }
);
