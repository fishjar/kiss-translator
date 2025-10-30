import browser from "webextension-polyfill";
import {
  MSG_FETCH,
  MSG_GET_HTTPCACHE,
  MSG_PUT_HTTPCACHE,
  MSG_TRANS_TOGGLE,
  MSG_OPEN_OPTIONS,
  MSG_SAVE_RULE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_OPEN_TRANBOX,
  MSG_CONTEXT_MENUS,
  MSG_COMMAND_SHORTCUTS,
  MSG_INJECT_JS,
  MSG_INJECT_CSS,
  MSG_UPDATE_CSP,
  MSG_BUILTINAI_DETECT,
  MSG_BUILTINAI_TRANSLATE,
  DEFAULT_CSPLIST,
  DEFAULT_ORILIST,
  CMD_TOGGLE_TRANSLATE,
  CMD_TOGGLE_STYLE,
  CMD_OPEN_OPTIONS,
  CMD_OPEN_TRANBOX,
  CLIENT_THUNDERBIRD,
  MSG_SET_LOGLEVEL,
  MSG_CLEAR_CACHES,
} from "./config";
import { getSettingWithDefault, tryInitDefaultData } from "./libs/storage";
import { trySyncSettingAndRules } from "./libs/sync";
import { fetchHandle } from "./libs/fetch";
import { tryClearCaches, getHttpCache, putHttpCache } from "./libs/cache";
import { sendTabMsg } from "./libs/msg";
import { trySyncAllSubRules } from "./libs/subRules";
import { saveRule } from "./libs/rules";
import { getCurTabId } from "./libs/msg";
import { injectInlineJsBg, injectInternalCss } from "./libs/injector";
import { kissLog, logger } from "./libs/log";
import { chromeDetect, chromeTranslate } from "./libs/builtinAI";

globalThis.ContextType = "BACKGROUND";

const CSP_RULE_START_ID = 1;
const ORI_RULE_START_ID = 10000;
const CSP_REMOVE_HEADERS = [
  `content-security-policy`,
  `content-security-policy-report-only`,
  `x-webkit-csp`,
  `x-content-security-policy`,
];

/**
 * 添加右键菜单
 */
async function addContextMenus(contextMenuType = 1) {
  // 添加前先删除,避免重复ID的错误
  try {
    await browser.contextMenus.removeAll();
  } catch (err) {
    kissLog("remove contextMenus", err);
  }

  switch (contextMenuType) {
    case 1:
      browser.contextMenus.create({
        id: CMD_TOGGLE_TRANSLATE,
        title: browser.i18n.getMessage("app_name"),
        contexts: ["page", "selection"],
      });
      break;
    case 2:
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
      break;
    default:
  }
}

/**
 * 更新CSP策略
 * @param {*} csplist
 */
async function updateCspRules({ csplist, orilist }) {
  try {
    const oldRules = await browser.declarativeNetRequest.getDynamicRules();

    const rulesToAdd = [];
    const idsToRemove = [];

    if (csplist !== undefined) {
      let processedCspList = csplist;
      if (typeof processedCspList === "string") {
        processedCspList = processedCspList
          .split(/\n|,/)
          .map((url) => url.trim())
          .filter(Boolean);
      }

      const oldCspRuleIds = oldRules
        .filter(
          (rule) => rule.id >= CSP_RULE_START_ID && rule.id < ORI_RULE_START_ID
        )
        .map((rule) => rule.id);
      idsToRemove.push(...oldCspRuleIds);

      const newCspRules = processedCspList.map((url, index) => ({
        id: CSP_RULE_START_ID + index,
        action: {
          type: "modifyHeaders",
          responseHeaders: CSP_REMOVE_HEADERS.map((header) => ({
            operation: "remove",
            header,
          })),
        },
        condition: {
          urlFilter: url,
          resourceTypes: ["main_frame", "sub_frame"],
        },
      }));
      rulesToAdd.push(...newCspRules);
    }

    if (orilist !== undefined) {
      let processedOriList = orilist;
      if (typeof processedOriList === "string") {
        processedOriList = processedOriList
          .split(/\n|,/)
          .map((url) => url.trim())
          .filter(Boolean);
      }

      const oldOriRuleIds = oldRules
        .filter((rule) => rule.id >= ORI_RULE_START_ID)
        .map((rule) => rule.id);
      idsToRemove.push(...oldOriRuleIds);

      const newOriRules = processedOriList.map((url, index) => ({
        id: ORI_RULE_START_ID + index,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Origin", operation: "set", value: url }],
        },
        condition: {
          urlFilter: url,
          resourceTypes: ["xmlhttprequest"],
        },
      }));
      rulesToAdd.push(...newOriRules);
    }

    if (idsToRemove.length > 0 || rulesToAdd.length > 0) {
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: idsToRemove,
        addRules: rulesToAdd,
      });
    }
  } catch (err) {
    kissLog("update csp rules", err);
  }
}

/**
 * 注册邮件显示脚本
 */
async function registerMsgDisplayScript() {
  await messenger.messageDisplayScripts.register({
    js: [{ file: "/content.js" }],
  });
}

/**
 * 插件安装
 */
browser.runtime.onInstalled.addListener(() => {
  tryInitDefaultData();

  //在thunderbird中注册脚本
  if (process.env.REACT_APP_CLIENT === CLIENT_THUNDERBIRD) {
    registerMsgDisplayScript();
  }

  // 右键菜单
  addContextMenus();

  // 禁用CSP
  updateCspRules({ csplist: DEFAULT_CSPLIST, orilist: DEFAULT_ORILIST });
});

/**
 * 浏览器启动
 */
browser.runtime.onStartup.addListener(async () => {
  const {
    clearCache,
    contextMenuType,
    subrulesList,
    csplist,
    orilist,
    logLevel,
  } = await getSettingWithDefault();

  // 设置日志
  logger.setLevel(logLevel);

  // 清除缓存
  if (clearCache) {
    tryClearCaches();
  }

  //在thunderbird中注册脚本
  if (process.env.REACT_APP_CLIENT === CLIENT_THUNDERBIRD) {
    registerMsgDisplayScript();
  }

  // 右键菜单
  // firefox重启后菜单会消失,故重复添加
  addContextMenus(contextMenuType);

  // 禁用CSP
  updateCspRules({ csplist, orilist });

  // 同步数据
  trySyncSettingAndRules();

  // 同步订阅规则
  trySyncAllSubRules({ subrulesList });
});

/**
 * 向当前活动标签页注入脚本或CSS
 */
const injectToCurrentTab = async (func, args) => {
  const tabId = await getCurTabId();
  return browser.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: func,
    args: [args],
    world: "MAIN",
  });
};

// 动作处理器映射表
const messageHandlers = {
  [MSG_FETCH]: (args) => fetchHandle(args),
  [MSG_GET_HTTPCACHE]: (args) => getHttpCache(args),
  [MSG_PUT_HTTPCACHE]: (args) => putHttpCache(args),
  [MSG_OPEN_OPTIONS]: () => browser.runtime.openOptionsPage(),
  [MSG_SAVE_RULE]: (args) => saveRule(args),
  [MSG_INJECT_JS]: (args) => injectToCurrentTab(injectInlineJsBg, args),
  [MSG_INJECT_CSS]: (args) => injectToCurrentTab(injectInternalCss, args),
  [MSG_UPDATE_CSP]: (args) => updateCspRules(args),
  [MSG_CONTEXT_MENUS]: (args) => addContextMenus(args),
  [MSG_COMMAND_SHORTCUTS]: () => browser.commands.getAll(),
  [MSG_BUILTINAI_DETECT]: (args) => chromeDetect(args),
  [MSG_BUILTINAI_TRANSLATE]: (args) => chromeTranslate(args),
  [MSG_SET_LOGLEVEL]: (args) => logger.setLevel(args),
  [MSG_CLEAR_CACHES]: () => tryClearCaches(),
};

/**
 * 监听消息
 * todo: 返回含错误的结构化信息
 */
browser.runtime.onMessage.addListener(async ({ action, args }) => {
  const handler = messageHandlers[action];
  if (!handler) {
    throw new Error(`Message action is unavailable: ${action}`);
  }

  return handler(args);
});

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
