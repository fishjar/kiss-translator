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
  DEFAULT_CSPLIST,
  CMD_TOGGLE_TRANSLATE,
  CMD_TOGGLE_STYLE,
  CMD_OPEN_OPTIONS,
  CMD_OPEN_TRANBOX,
  CLIENT_THUNDERBIRD,
} from "./config";
import { getSettingWithDefault, tryInitDefaultData } from "./libs/storage";
import { trySyncSettingAndRules } from "./libs/sync";
import { fetchHandle } from "./libs/fetch";
import { tryClearCaches, getHttpCache, putHttpCache } from "./libs/cache";
import { sendTabMsg } from "./libs/msg";
import { trySyncAllSubRules } from "./libs/subRules";
import { saveRule } from "./libs/rules";
import { getCurTabId } from "./libs/msg";
import { injectInlineJs, injectInternalCss } from "./libs/injector";
import { kissLog } from "./libs/log";

globalThis.ContextType = "BACKGROUND";

const REMOVE_HEADERS = [
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
async function updateCspRules(csplist = DEFAULT_CSPLIST.join(",\n")) {
  try {
    const newRules = csplist
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url, idx) => ({
        id: idx + 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: REMOVE_HEADERS.map((header) => ({
            operation: "remove",
            header,
          })),
        },
        condition: {
          urlFilter: url,
          resourceTypes: ["main_frame", "sub_frame"],
        },
      }));
    const oldRules = await browser.declarativeNetRequest.getDynamicRules();
    const oldRuleIds = oldRules.map((rule) => rule.id);
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldRuleIds,
      addRules: newRules,
    });
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
  updateCspRules();
});

/**
 * 浏览器启动
 */
browser.runtime.onStartup.addListener(async () => {
  // 同步数据
  await trySyncSettingAndRules();

  const { clearCache, contextMenuType, subrulesList, csplist } =
    await getSettingWithDefault();

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
  updateCspRules(csplist);

  // 同步订阅规则
  trySyncAllSubRules({ subrulesList });
});

/**
 * 监听消息
 */
browser.runtime.onMessage.addListener(async ({ action, args }) => {
  switch (action) {
    case MSG_FETCH:
      return await fetchHandle(args);
    case MSG_GET_HTTPCACHE:
      return await getHttpCache(args.input, args.init);
    case MSG_PUT_HTTPCACHE:
      return await putHttpCache(args.input, args.init, args.data);
    case MSG_OPEN_OPTIONS:
      return await browser.runtime.openOptionsPage();
    case MSG_SAVE_RULE:
      return await saveRule(args);
    case MSG_INJECT_JS:
      return await browser.scripting.executeScript({
        target: { tabId: await getCurTabId(), allFrames: true },
        func: injectInlineJs,
        args: [args],
        world: "MAIN",
      });
    case MSG_INJECT_CSS:
      return await browser.scripting.executeScript({
        target: { tabId: await getCurTabId(), allFrames: true },
        func: injectInternalCss,
        args: [args],
        world: "MAIN",
      });
    case MSG_UPDATE_CSP:
      return await updateCspRules(args);
    case MSG_CONTEXT_MENUS:
      return await addContextMenus(args);
    case MSG_COMMAND_SHORTCUTS:
      return await browser.commands.getAll();
    default:
      throw new Error(`message action is unavailable: ${action}`);
  }
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
