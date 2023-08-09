import React from "react";
import ReactDOM from "react-dom/client";
import Options from "./views/Options";
import Action from "./views/Action";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";

import { getRules, matchRule } from "./libs";
import { getSetting } from "./libs";
import { transPool } from "./libs/pool";
import { Translator } from "./libs/translator";

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

  // skip iframe
  if (window.self !== window.top) {
    return;
  }

  // 翻译页面
  const { fetchInterval, fetchLimit } = await getSetting();
  transPool.update(fetchInterval, fetchLimit);
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
