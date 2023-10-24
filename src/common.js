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
  APP_LCNAME,
  DEFAULT_TRANBOX_SETTING,
} from "./config";
import { getRulesWithDefault, getFabWithDefault } from "./libs/storage";
import { Translator } from "./libs/translator";
import { sendIframeMsg, sendParentMsg } from "./libs/iframe";
import { matchRule } from "./libs/rules";
import Slection from "./views/Selection";

export async function runTranslator(setting) {
  const href = document.location.href;
  const rules = await getRulesWithDefault();
  const rule = await matchRule(rules, href, setting);
  const translator = new Translator(rule, setting);

  return { translator, rule };
}

export function runIframe(setting) {
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
  sendParentMsg(MSG_TRANS_GETRULE);
}

export async function showFab(translator) {
  const fab = await getFabWithDefault();
  if (fab.isHide) {
    return;
  }

  const $action = document.createElement("div");
  $action.setAttribute("id", APP_LCNAME);
  document.body.parentElement.appendChild($action);
  const shadowContainer = $action.attachShadow({ mode: "closed" });
  const emotionRoot = document.createElement("style");
  const shadowRootElement = document.createElement("div");
  shadowContainer.appendChild(emotionRoot);
  shadowContainer.appendChild(shadowRootElement);
  const cache = createCache({
    key: APP_LCNAME,
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

export function showTransbox({
  tranboxSetting = DEFAULT_TRANBOX_SETTING,
  transApis,
}) {
  if (!tranboxSetting?.transOpen) {
    return;
  }

  const $tranbox = document.createElement("div");
  $tranbox.setAttribute("id", "kiss-transbox");
  document.body.parentElement.appendChild($tranbox);
  const shadowContainer = $tranbox.attachShadow({ mode: "closed" });
  const emotionRoot = document.createElement("style");
  const shadowRootElement = document.createElement("div");
  shadowContainer.appendChild(emotionRoot);
  shadowContainer.appendChild(shadowRootElement);
  const cache = createCache({
    key: "kiss-transbox",
    prepend: true,
    container: emotionRoot,
  });
  ReactDOM.createRoot(shadowRootElement).render(
    <React.StrictMode>
      <CacheProvider value={cache}>
        <Slection tranboxSetting={tranboxSetting} transApis={transApis} />
      </CacheProvider>
    </React.StrictMode>
  );
}

export function windowListener(rule) {
  window.addEventListener("message", (e) => {
    const { action } = e.data || {};
    switch (action) {
      case MSG_TRANS_GETRULE:
        sendIframeMsg(MSG_TRANS_PUTRULE, rule);
        break;
      default:
    }
  });
}

export function showErr(err) {
  console.error("[KISS-Translator]", err);
  const $err = document.createElement("div");
  $err.innerText = `KISS-Translator: ${err.message}`;
  $err.style.cssText = "background:red; color:#fff;";
  document.body.prepend($err);
}
