import React from "react";
import ReactDOM from "react-dom/client";
import Action from "./views/Action";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { fetchUpdate } from "./libs/fetch";
import { getRules, matchRule } from "./libs";
import { getSetting } from "./libs";
import { Translator } from "./libs/translator";

/**
 * 入口函数
 */
(async () => {
  // 设置页面
  if (
    document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE_DEV) ||
    document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE) ||
    document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE2)
  ) {
    window.unsafeWindow.GM = window.GM;
    window.unsafeWindow.GM_xmlhttpRequest = window.GM_xmlhttpRequest;
    window.unsafeWindow.GM_setValue = window.GM_setValue;
    window.unsafeWindow.GM_getValue = window.GM_getValue;
    window.unsafeWindow.GM_deleteValue = window.GM_deleteValue;
    window.unsafeWindow.APP_NAME = process.env.REACT_APP_NAME;
    return;
  }

  // skip iframe
  if (window.self !== window.top) {
    return;
  }

  // 翻译页面
  const { fetchInterval, fetchLimit } = await getSetting();
  fetchUpdate(fetchInterval, fetchLimit);
  const rules = await getRules();
  const rule = matchRule(rules, document.location.href);
  const translator = new Translator(rule);

  // 浮球按钮
  const $action = document.createElement("div");
  $action.setAttribute("id", "kiss-translator");
  document.body.parentElement.appendChild($action);
  const shadowContainer = $action.attachShadow({ mode: "open" });
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
        <Action translator={translator} />
      </CacheProvider>
    </React.StrictMode>
  );
})();
