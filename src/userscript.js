import React from "react";
import ReactDOM from "react-dom/client";
import Options from "./views/Options";
import Action from "./views/Action";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";

import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  MSG_TRANS_CURRULE,
  EVENT_KISS,
} from "./config";
import { getRules, matchRule } from "./libs";
import { getSetting } from "./libs";
import { transPool } from "./libs/pool";
import { Translator } from "./libs/translator";

/**
 * 自定义元素
 */
class ActionElement extends HTMLElement {
  connectedCallback() {
    const shadowContainer = this.attachShadow({ mode: "open" });
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
          <Action />
        </CacheProvider>
      </React.StrictMode>
    );
  }
}

/**
 * 入口函数
 */
(async () => {
  // 设置页面
  if (
    document.location.href.includes("http://localhost:3000/options.html") ||
    document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE) ||
    document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE2)
  ) {
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(
      <React.StrictMode>
        <Options />
      </React.StrictMode>
    );
    return;
  }

  // iframe
  if (window.self !== window.top) {
    return;
  }

  // 插入按钮
  const actionName = "kiss-action";
  customElements.define(actionName, ActionElement);
  const $action = document.createElement(actionName);
  document.body.parentElement.appendChild($action);

  // 翻译页面
  const { fetchInterval, fetchLimit } = await getSetting();
  transPool.update(fetchInterval, fetchLimit);
  const rules = await getRules();
  const rule = matchRule(rules, document.location.href);
  const translator = new Translator(rule);

  // 监听消息
  window.addEventListener(EVENT_KISS, (e) => {
    const action = e?.detail?.action;
    const args = e?.detail?.args || {};
    switch (action) {
      case MSG_TRANS_TOGGLE:
        translator.toggle();
        break;
      case MSG_TRANS_GETRULE:
        window.dispatchEvent(
          new CustomEvent(EVENT_KISS, {
            detail: {
              action: MSG_TRANS_CURRULE,
              args: translator.rule,
            },
          })
        );
        break;
      case MSG_TRANS_PUTRULE:
        translator.updateRule(args);
        break;
      default:
      // console.log(`[entry] kissEvent action skip: ${action}`);
    }
  });
})();
