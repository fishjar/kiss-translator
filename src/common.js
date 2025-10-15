import React from "react";
import ReactDOM from "react-dom/client";
import Action from "./views/Action";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_PUTRULE,
  APP_CONSTS,
} from "./config";
import { getFabWithDefault, getSettingWithDefault } from "./libs/storage";
import { Translator } from "./libs/translator";
import { isIframe, sendIframeMsg } from "./libs/iframe";
import { touchTapListener } from "./libs/touch";
import { debounce, genEventName } from "./libs/utils";
import { handlePing, injectScript } from "./libs/gm";
import { matchRule } from "./libs/rules";
import { trySyncAllSubRules } from "./libs/subRules";
import { isInBlacklist } from "./libs/blacklist";
import { runSubtitle } from "./subtitle/subtitle";
import { logger } from "./libs/log";
import { injectInlineJs } from "./libs/injector";

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
    injectInlineJs(
      `(${injectScript})("${ping}")`,
      "kiss-translator-options-injector"
    );
  }
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
  $action.id = APP_CONSTS.fabID;
  $action.className = "notranslate";
  $action.style.fontSize = "0";
  $action.style.width = "0";
  $action.style.height = "0";
  document.body.parentElement.appendChild($action);
  const shadowContainer = $action.attachShadow({ mode: "closed" });
  const emotionRoot = document.createElement("style");
  const shadowRootElement = document.createElement("div");
  shadowRootElement.className = `${APP_CONSTS.fabID}_warpper notranslate`;
  shadowContainer.appendChild(emotionRoot);
  shadowContainer.appendChild(shadowRootElement);
  const cache = createCache({
    key: APP_CONSTS.fabID,
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
 * 显示错误信息到页面顶部
 * @param {*} message
 */
function showErr(message) {
  const bannerId = "KISS-Translator-Message";
  const existingBanner = document.getElementById(bannerId);
  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement("div");
  banner.id = bannerId;

  Object.assign(banner.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    backgroundColor: "#f44336",
    color: "white",
    textAlign: "center",
    padding: "8px 16px",
    zIndex: "1001",
    boxSizing: "border-box",
    fontSize: "16px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
  });

  const closeButton = document.createElement("span");
  closeButton.textContent = "×";

  Object.assign(closeButton.style, {
    position: "absolute",
    top: "50%",
    right: "20px",
    transform: "translateY(-50%)",
    cursor: "pointer",
    fontSize: "22px",
    fontWeight: "bold",
  });

  const messageText = document.createTextNode(`KISS-Translator: ${message}`);
  banner.appendChild(messageText);
  banner.appendChild(closeButton);

  document.body.appendChild(banner);

  const removeBanner = () => {
    banner.style.transition = "opacity 0.5s ease";
    banner.style.opacity = "0";
    setTimeout(() => {
      if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 500);
  };

  closeButton.onclick = removeBanner;
  setTimeout(removeBanner, 10000);
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
    // 读取设置信息
    const setting = await getSettingWithDefault();

    // 日志
    logger.setLevel(setting.logLevel);

    const href = document.location.href;

    // 设置页面
    if (
      isUserscript &&
      (href.includes(process.env.REACT_APP_OPTIONSPAGE_DEV) ||
        href.includes(process.env.REACT_APP_OPTIONSPAGE))
    ) {
      runSettingPage();
      return;
    }

    // 黑名单
    if (isInBlacklist(href, setting)) {
      return;
    }

    // 翻译网页
    const rule = await matchRule(href, setting);
    const translator = new Translator(rule, setting, isUserscript);

    // 适配iframe
    if (isIframe) {
      runIframe(translator);
      return;
    }

    // 字幕翻译
    runSubtitle({ href, setting, rule, isUserscript });

    // 监听消息
    // !isUserscript && runtimeListener(translator);

    // 输入框翻译
    // inputTranslate(setting);

    // 划词翻译
    // showTransbox(setting, rule);

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
