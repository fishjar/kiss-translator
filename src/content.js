import { browser } from "./libs/browser";
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
} from "./config";
import {
  getSettingWithDefault,
  getRulesWithDefault,
  getFabWithDefault,
} from "./libs/storage";
import { Translator } from "./libs/translator";
import { isIframe, sendIframeMsg, sendPrentMsg } from "./libs/iframe";
import { matchRule } from "./libs/rules";
import { webfix } from "./libs/webfix";

/**
 * 入口函数
 */
const init = async () => {
  const setting = await getSettingWithDefault();

  if (isIframe) {
    let translator;
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
          if (!translator) {
            translator = new Translator(args, setting);
          } else {
            translator.updateRule(args || {});
          }
          break;
        default:
      }
    });
    sendPrentMsg(MSG_TRANS_GETRULE);
    return;
  }

  const href = document.location.href;
  const rules = await getRulesWithDefault();
  const rule = await matchRule(rules, href, setting);
  const translator = new Translator(rule, setting);
  webfix(href, setting);

  // 监听消息
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
      default:
        return { error: `message action is unavailable: ${action}` };
    }
    return { data: translator.rule };
  });
  window.addEventListener("message", (e) => {
    const { action } = e.data || {};
    switch (action) {
      case MSG_TRANS_GETRULE:
        sendIframeMsg(MSG_TRANS_PUTRULE, rule);
        break;
      default:
    }
  });

  // 浮球按钮
  const fab = await getFabWithDefault();
  if (!fab.isHide) {
    const $action = document.createElement("div");
    $action.setAttribute("id", "kiss-translator");
    document.body.parentElement.appendChild($action);
    const shadowContainer = $action.attachShadow({ mode: "closed" });
    const emotionRoot = document.createElement("style");
    const shadowRootElement = document.createElement("div");
    shadowContainer.appendChild(emotionRoot);
    shadowContainer.appendChild(shadowRootElement);
    const cache = createCache({
      key: "kiss-translator",
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
};

(async () => {
  try {
    await init();
  } catch (err) {
    console.error("[KISS-Translator]", err);
    const $err = document.createElement("div");
    $err.innerText = `KISS-Translator: ${err.message}`;
    $err.style.cssText = "background:red; color:#fff;";
    document.body.prepend($err);
  }
})();
