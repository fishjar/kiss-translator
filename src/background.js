import browser from "webextension-polyfill";
import {
  MSG_FETCH,
  MSG_FETCH_LIMIT,
  MSG_FETCH_CLEAR,
  MSG_TRANS_TOGGLE,
  MSG_OPEN_OPTIONS,
  MSG_SAVE_RULE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_OPEN_TRANBOX,
  MSG_CONTEXT_MENUS,
  MSG_COMMAND_SHORTCUTS,
  CMD_TOGGLE_TRANSLATE,
  CMD_TOGGLE_STYLE,
  CMD_OPEN_OPTIONS,
  CMD_OPEN_TRANBOX,
} from "./config";
import { getSettingWithDefault, tryInitDefaultData } from "./libs/storage";
import { trySyncSettingAndRules } from "./libs/sync";
import { fetchData, fetchPool } from "./libs/fetch";
import { sendTabMsg } from "./libs/msg";
import { trySyncAllSubRules } from "./libs/subRules";
import { tryClearCaches } from "./libs";
import { saveRule } from "./libs/rules";

globalThis.ContextType = "BACKGROUND";

/**
 * 添加右键菜单
 */
function addContextMenus() {
  browser.contextMenus.create({
    id: CMD_TOGGLE_TRANSLATE,
    title: browser.i18n.getMessage("toggle_translate"),
    contexts: ["page", "selection"],
  });
  browser.contextMenus.create({
    id: CMD_TOGGLE_STYLE,
    title: browser.i18n.getMessage("toggle_style"),
    contexts: ["page", "selection"],
  });
  browser.contextMenus.create({
    id: CMD_OPEN_TRANBOX,
    title: browser.i18n.getMessage("open_tranbox"),
    contexts: ["page", "selection"],
  });
  browser.contextMenus.create({
    id: "options_separator",
    type: "separator",
    contexts: ["page", "selection"],
  });
  browser.contextMenus.create({
    id: CMD_OPEN_OPTIONS,
    title: browser.i18n.getMessage("open_options"),
    contexts: ["page", "selection"],
  });
}

/**
 * 清除右键菜单
 */
function removeContextMenus() {
  browser.contextMenus.removeAll();
}

/**
 * 插件安装
 */
browser.runtime.onInstalled.addListener(() => {
  tryInitDefaultData();

  // 右键菜单
  addContextMenus();
});

/**
 * 浏览器启动
 */
browser.runtime.onStartup.addListener(async () => {
  // 同步数据
  await trySyncSettingAndRules();

  const {
    clearCache,
    contextMenus = true,
    subrulesList,
  } = await getSettingWithDefault();

  // 清除缓存
  if (clearCache) {
    tryClearCaches();
  }

  // 右键菜单
  if (!contextMenus) {
    removeContextMenus();
  }

  // 同步订阅规则
  trySyncAllSubRules({ subrulesList });
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
            sendResponse({ error: error.message, cause: error.cause });
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
      case MSG_OPEN_OPTIONS:
        browser.runtime.openOptionsPage();
        break;
      case MSG_SAVE_RULE:
        saveRule(args);
        break;
      case MSG_CONTEXT_MENUS:
        const { contextMenus } = args;
        if (contextMenus) {
          addContextMenus();
        } else {
          removeContextMenus();
        }
        break;
      case MSG_COMMAND_SHORTCUTS:
        browser.commands
          .getAll()
          .then((commands) => {
            sendResponse({ data: commands });
          })
          .catch((error) => {
            sendResponse({ error: error.message });
          });
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
    case CMD_OPEN_TRANBOX:
      sendTabMsg(MSG_OPEN_TRANBOX);
      break;
    case CMD_TOGGLE_STYLE:
      sendTabMsg(MSG_TRANS_TOGGLE_STYLE);
      break;
    case CMD_OPEN_OPTIONS:
      browser.runtime.openOptionsPage();
      break;
    default:
  }
});

/**
 * 监听右键菜单
 */
browser.contextMenus.onClicked.addListener(({ menuItemId }) => {
  switch (menuItemId) {
    case CMD_TOGGLE_TRANSLATE:
      sendTabMsg(MSG_TRANS_TOGGLE);
      break;
    case CMD_TOGGLE_STYLE:
      sendTabMsg(MSG_TRANS_TOGGLE_STYLE);
      break;
    case CMD_OPEN_TRANBOX:
      sendTabMsg(MSG_OPEN_TRANBOX);
      break;
    case CMD_OPEN_OPTIONS:
      browser.runtime.openOptionsPage();
      break;
    default:
  }
});
