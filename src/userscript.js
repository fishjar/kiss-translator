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
import { MSG_TRANS_TOGGLE, MSG_TRANS_PUTRULE } from "./config";
import { isIframe } from "./libs/iframe";
import { handlePing, injectScript } from "./libs/gm";
import { matchRule } from "./libs/rules";

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
      unsafeWindow.APP_NAME = process.env.REACT_APP_NAME;
    } else {
      const ping = btoa(Math.random()).slice(3, 11);
      window.addEventListener(ping, handlePing);
      // window.eval(`(${injectScript})("${ping}")`); // eslint-disable-line
      const script = document.createElement("script");
      script.textContent = `(${injectScript})("${ping}")`;
      document.head.append(script);
    }

    return;
  }

  // 翻译页面
  const href = isIframe ? document.referrer : document.location.href;
  const setting = await getSettingWithDefault();
  const rules = await getRulesWithDefault();
  const rule = await matchRule(rules, href, setting);
  const translator = new Translator(rule, setting);

  if (isIframe) {
    // iframe
    window.addEventListener("message", (e) => {
      const action = e?.data?.action;
      switch (action) {
        case MSG_TRANS_TOGGLE:
          translator.toggle();
          break;
        case MSG_TRANS_PUTRULE:
          translator.updateRule(e.data.args || {});
          break;
        default:
      }
    });
    return;
  }

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
    key: "css",
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
    const $err = document.createElement("div");
    $err.innerText = `KISS-Translator: ${err.message}`;
    $err.style.cssText = "background:red; color:#fff; z-index:10000;";
    document.body.prepend($err);
  }
})();
