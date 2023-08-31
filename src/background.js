import browser from "webextension-polyfill";
import {
  MSG_FETCH,
  MSG_FETCH_LIMIT,
  MSG_FETCH_CLEAR,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  CMD_TOGGLE_TRANSLATE,
  CMD_TOGGLE_STYLE,
} from "./config";
import { getSettingWithDefault, tryInitDefaultData } from "./libs/storage";
import { trySyncSettingAndRules } from "./libs/sync";
import { fetchData, fetchPool } from "./libs/fetch";
import { sendTabMsg } from "./libs/msg";
import { trySyncAllSubRules } from "./libs/subRules";
import { tryClearCaches } from "./libs";

/**
 * 插件安装
 */
browser.runtime.onInstalled.addListener(() => {
  tryInitDefaultData();
});

/**
 * 浏览器启动
 */
browser.runtime.onStartup.addListener(async () => {
  console.log("browser onStartup");

  // 同步数据
  await trySyncSettingAndRules(true);

  // 清除缓存
  const setting = await getSettingWithDefault();
  if (setting.clearCache) {
    tryClearCaches();
  }

  // 同步订阅规则
  trySyncAllSubRules(setting, true);
});

/**
 * 监听消息
 */
browser.runtime.onMessage.addListener(
  ({ action, args }, sender, sendResponse) => {
    switch (action) {
      case MSG_FETCH:
        const { input, opts } = args;
        fetchData(input, opts)
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
      case MSG_FETCH_CLEAR:
        fetchPool.clear();
        sendResponse({ data: "ok" });
        break;
      default:
        sendResponse({ error: `message action is unavailable: ${action}` });
    }
    return true;
  }
);

/**
 * 监听快捷键
 */
browser.commands.onCommand.addListener((command) => {
  // console.log(`Command: ${command}`);
  switch (command) {
    case CMD_TOGGLE_TRANSLATE:
      sendTabMsg(MSG_TRANS_TOGGLE);
      break;
    case CMD_TOGGLE_STYLE:
      sendTabMsg(MSG_TRANS_TOGGLE_STYLE);
      break;
    default:
  }
});
