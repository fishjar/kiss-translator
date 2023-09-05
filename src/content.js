import { browser } from "./libs/browser";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
} from "./config";
import { getSettingWithDefault, getRulesWithDefault } from "./libs/storage";
import { Translator } from "./libs/translator";
import { isIframe } from "./libs/iframe";
import { matchRule } from "./libs/rules";

/**
 * 入口函数
 */
const init = async () => {
  const href = isIframe ? document.referrer : document.location.href;
  const setting = await getSettingWithDefault();
  const rules = await getRulesWithDefault();
  const rule = await matchRule(rules, href, setting);
  const translator = new Translator(rule, setting);

  // 监听消息
  browser?.runtime.onMessage.addListener(async ({ action, args }) => {
    switch (action) {
      case MSG_TRANS_TOGGLE:
        translator.toggle();
        break;
      case MSG_TRANS_TOGGLE_STYLE:
        translator.toggleStyle();
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
