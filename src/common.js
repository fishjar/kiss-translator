import React from "react";
import ReactDOM from "react-dom/client";
import Action from "./views/Action";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  MSG_OPEN_TRANBOX,
  APP_LCNAME,
  DEFAULT_TRANBOX_SETTING,
} from "./config";
import { getFabWithDefault, getSettingWithDefault } from "./libs/storage";
import { Translator } from "./libs/translator";
import { isIframe, sendIframeMsg } from "./libs/iframe";
import Slection from "./views/Selection";
import { touchTapListener } from "./libs/touch";
import { debounce, genEventName } from "./libs/utils";
import { handlePing, injectScript } from "./libs/gm";
import { browser } from "./libs/browser";
import { matchRule } from "./libs/rules";
import { trySyncAllSubRules } from "./libs/subRules";
import { isInBlacklist } from "./libs/blacklist";
import inputTranslate from "./libs/inputTranslate";

/**
 * 油猴脚本设置页面
 */
function runSettingPage() {
  if (GM?.info?.script?.grant?.includes("unsafeWindow")) {
    unsafeWindow.GM = GM;
    unsafeWindow.APP_INFO = {
      name: process.env.REACT_APP_NAME,
      version: process.env.REACT_APP_VERSION,
    };
  } else {
    const ping = genEventName();
    window.addEventListener(ping, handlePing);
    // window.eval(`(${injectScript})("${ping}")`); // eslint-disable-line
    const script = document.createElement("script");
    script.textContent = `(${injectScript})("${ping}")`;
    document.head.append(script);
  }
}

/**
 * 插件监听后端事件
 * @param {*} translator
 */
function runtimeListener(translator) {
  browser?.runtime.onMessage.addListener(async ({ action, args }) => {
    switch (action) {
      case MSG_TRANS_TOGGLE:
        translator.toggle();
        sendIframeMsg(MSG_TRANS_TOGGLE);
        break;
      case MSG_TRANS_TOGGLE_STYLE:
        translator.toggleStyle();
        sendIframeMsg(MSG_TRANS_TOGGLE_STYLE);
        break;
      case MSG_TRANS_GETRULE:
        break;
      case MSG_TRANS_PUTRULE:
        translator.updateRule(args);
        sendIframeMsg(MSG_TRANS_PUTRULE, args);
        break;
      case MSG_OPEN_TRANBOX:
        window.dispatchEvent(new CustomEvent(MSG_OPEN_TRANBOX));
        break;
      default:
        return { error: `message action is unavailable: ${action}` };
    }
    return { data: translator.rule };
  });
}

/**
 * iframe 页面执行
 * @param {*} translator
 */
function runIframe(translator) {
  window.addEventListener("message", (e) => {
    const { action, args } = e.data || {};
    switch (action) {
      case MSG_TRANS_TOGGLE:
        translator?.toggle();
        break;
      case MSG_TRANS_TOGGLE_STYLE:
        translator?.toggleStyle();
        break;
      case MSG_TRANS_PUTRULE:
        translator.updateRule(args || {});
        break;
      default:
    }
  });
}

/**
 * 悬浮按钮
 * @param {*} translator
 * @returns
 */
async function showFab(translator) {
  const fab = await getFabWithDefault();
  const $action = document.createElement("div");
  $action.setAttribute("id", APP_LCNAME);
  $action.style.fontSize = "0";
  $action.style.width = "0";
  $action.style.height = "0";
  document.body.parentElement.appendChild($action);
  const shadowContainer = $action.attachShadow({ mode: "closed" });
  const emotionRoot = document.createElement("style");
  const shadowRootElement = document.createElement("div");
  shadowContainer.appendChild(emotionRoot);
  shadowContainer.appendChild(shadowRootElement);
  const cache = createCache({
    key: APP_LCNAME,
    prepend: true,
    container: emotionRoot,
  });
  ReactDOM.createRoot(shadowRootElement).render(
    <React.StrictMode>
      <CacheProvider value={cache}>
        <Action translator={translator} fab={fab} />
      </CacheProvider>
    </React.StrictMode>
  );
}

/**
 * 划词翻译
 * @param {*} param0
 * @returns
 */
function showTransbox({
  contextMenuType,
  tranboxSetting = DEFAULT_TRANBOX_SETTING,
  transApis,
}) {
  if (!tranboxSetting?.transOpen) {
    return;
  }

  const $tranbox = document.createElement("div");
  $tranbox.setAttribute("id", "kiss-transbox");
  $tranbox.style.fontSize = "0";
  $tranbox.style.width = "0";
  $tranbox.style.height = "0";
  document.body.parentElement.appendChild($tranbox);
  const shadowContainer = $tranbox.attachShadow({ mode: "closed" });
  const emotionRoot = document.createElement("style");
  const shadowRootElement = document.createElement("div");
  shadowContainer.appendChild(emotionRoot);
  shadowContainer.appendChild(shadowRootElement);
  const cache = createCache({
    key: "kiss-transbox",
    prepend: true,
    container: emotionRoot,
  });
  ReactDOM.createRoot(shadowRootElement).render(
    <React.StrictMode>
      <CacheProvider value={cache}>
        <Slection
          contextMenuType={contextMenuType}
          tranboxSetting={tranboxSetting}
          transApis={transApis}
        />
      </CacheProvider>
    </React.StrictMode>
  );
}

/**
 * 显示错误信息到页面顶部
 * @param {*} message
 */
function showErr(message) {
  const $err = document.createElement("div");
  $err.innerText = `KISS-Translator: ${message}`;
  $err.style.cssText = "background:red; color:#fff;";
  document.body.prepend($err);
}

/**
 * 监听触屏操作
 * @param {*} translator
 * @returns
 */
function touchOperation(translator) {
  const { touchTranslate = 2 } = translator.setting;
  if (touchTranslate === 0) {
    return;
  }

  const handleTap = debounce(() => {
    translator.toggle();
    sendIframeMsg(MSG_TRANS_TOGGLE);
  });
  touchTapListener(handleTap, touchTranslate);
}

/**
 * 入口函数
 */
export async function run(isUserscript = false) {
  try {
    const href = document.location.href;

    // 设置页面
    if (
      isUserscript &&
      (href.includes(process.env.REACT_APP_OPTIONSPAGE_DEV) ||
        href.includes(process.env.REACT_APP_OPTIONSPAGE) ||
        href.includes(process.env.REACT_APP_OPTIONSPAGE2))
    ) {
      runSettingPage();
      return;
    }

    // 读取设置信息
    const setting = await getSettingWithDefault();

    // 黑名单
    if (isInBlacklist(href, setting)) {
      return;
    }

    // 翻译网页
    const rule = await matchRule(href, setting);
    const translator = new Translator(rule, setting);

    // 适配iframe
    if (isIframe) {
      runIframe(translator);
      return;
    }

    // 监听消息
    !isUserscript && runtimeListener(translator);

    // 输入框翻译
    inputTranslate(setting);

    // 划词翻译
    showTransbox(setting);

    // 浮球按钮
    await showFab(translator);

    // 触屏操作
    touchOperation(translator);

    // 同步订阅规则
    isUserscript && (await trySyncAllSubRules(setting));
  } catch (err) {
    console.error("[KISS-Translator]", err);
    showErr(err.message);
  }
}
