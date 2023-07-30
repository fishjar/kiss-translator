import browser from "webextension-polyfill";
import {
  MSG_FETCH,
  MSG_FETCH_LIMIT,
  DEFAULT_SETTING,
  DEFAULT_RULES,
  STOKEY_SETTING,
  STOKEY_RULES,
  CACHE_NAME,
} from "./config";
import { fetchData, setFetchLimit } from "./libs/fetch";
import storage from "./libs/storage";
import { getSetting } from "./libs";
import { apiSyncAll } from "./apis/data";

/**
 * 插件安装
 */
browser.runtime.onInstalled.addListener(() => {
  console.log("onInstalled");
  storage.trySetObj(STOKEY_SETTING, DEFAULT_SETTING);
  storage.trySetObj(STOKEY_RULES, DEFAULT_RULES);
});

/**
 * 浏览器启动
 */
browser.runtime.onStartup.addListener(async () => {
  console.log("onStartup");

  // 同步数据
  try {
    await apiSyncAll();
  } catch (err) {
    console.log("[sync all]", err);
  }

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
        fetchData(args.input, args.init)
          .then((data) => {
            sendResponse({ data });
          })
          .catch((error) => {
            sendResponse({ error: error.message });
          });
        break;
      case MSG_FETCH_LIMIT:
        setFetchLimit(args.limit);
        sendResponse({ data: "ok" });
        break;
      default:
        sendResponse({ error: `message action is unavailable: ${action}` });
    }
    return true;
  }
);
