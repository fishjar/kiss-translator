import { browser } from "./libs/browser";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
} from "./config";
import { getRules, matchRule } from "./libs";
import { getSetting } from "./libs";
import { Translator } from "./libs/translator";

/**
 * 入口函数
 */
(async () => {
  const setting = await getSetting();
  const rules = await getRules();
  const rule = matchRule(rules, document.location.href);
  const translator = new Translator(rule, setting);

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
