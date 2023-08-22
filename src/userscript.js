import React from "react";
import ReactDOM from "react-dom/client";
import Action from "./views/Action";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { getSetting, getRules, matchRule, getFab } from "./libs";
import { Translator } from "./libs/translator";
import { trySyncAllSubRules } from "./libs/rules";

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
    unsafeWindow.GM = GM;
    unsafeWindow.APP_NAME = process.env.REACT_APP_NAME;
    return;
  }

  // skip iframe
  if (window.self !== window.top) {
    return;
  }

  // 翻译页面
  const setting = await getSetting();
  const rules = await getRules();
  const rule = await matchRule(rules, document.location.href, setting);
  const translator = new Translator(rule, setting);

  // 浮球按钮
  const fab = await getFab();
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
        <Action translator={translator} fab={fab} />
      </CacheProvider>
    </React.StrictMode>
  );

  // 注册菜单
  GM.registerMenuCommand(
    "Toggle Translate",
    (event) => {
      translator.toggle();
    },
    "Q"
  );
  GM.registerMenuCommand(
    "Toggle Style",
    (event) => {
      translator.toggleStyle();
    },
    "C"
  );

  // 同步订阅规则
  trySyncAllSubRules(setting);
})();
