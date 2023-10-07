import React from "react";
import ReactDOM from "react-dom/client";
import Action from "./views/Action";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import {
  getSettingWithDefault,
  getRulesWithDefault,
  getFabWithDefault,
} from "./libs/storage";
import { Translator } from "./libs/translator";
import { trySyncAllSubRules } from "./libs/subRules";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
} from "./config";
import { isIframe, sendIframeMsg, sendPrentMsg } from "./libs/iframe";
import { handlePing, injectScript } from "./libs/gm";
import { matchRule } from "./libs/rules";
import { genEventName } from "./libs/utils";
import { webfix } from "./libs/webfix";

/**
 * 入口函数
 */
const init = async () => {
  // 设置页面
  if (
    document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE_DEV) ||
    document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE) ||
    document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE2)
  ) {
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

    return;
  }

  // 翻译页面
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

  const href = isIframe ? document.referrer : document.location.href;
  const rules = await getRulesWithDefault();
  const rule = await matchRule(rules, href, setting);
  const translator = new Translator(rule, setting);
  webfix(href, setting);

  // 监听消息
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

  // 同步订阅规则
  trySyncAllSubRules(setting);
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
