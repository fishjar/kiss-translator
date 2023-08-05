import React from "react";
import ReactDOM from "react-dom/client";
import Options from "./views/Options";

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
