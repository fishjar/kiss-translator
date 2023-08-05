import React from "react";
import ReactDOM from "react-dom/client";
import Options from "./views/Options";
import Action from "./views/Action";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";

import { browser } from "./libs/browser";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
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
  if (document.location.href.includes("kiss-translator-options")) {
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(
      <React.StrictMode>
        <Options />
      </React.StrictMode>
    );
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
  browser?.runtime.onMessage.addListener(async ({ action, args }) => {
    switch (action) {
      case MSG_TRANS_TOGGLE:
        translator.toggle();
        break;
      case MSG_TRANS_GETRULE:
        break;
      case MSG_TRANS_PUTRULE:
        translator.updateRule(args);
        break;
      default:
        return { error: `message action is unavailable: ${action}` };
    }
    return { data: translator.rule };
  });
})();
