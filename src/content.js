import { browser } from "./libs/browser";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
} from "./config";
import { getSettingWithDefault, getRulesWithDefault } from "./libs/storage";
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
