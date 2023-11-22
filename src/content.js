import { browser } from "./libs/browser";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANSLATE_SELECTED,
  MSG_OPEN_TRANBOX,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
} from "./config";
import { getSettingWithDefault } from "./libs/storage";
import { isIframe, sendIframeMsg } from "./libs/iframe";
import { runWebfix } from "./libs/webfix";
import {
  runIframe,
  runTranslator,
  showFab,
  showTransbox,
  windowListener,
  showErr,
  touchOperation,
} from "./common";

function runtimeListener(translator) {
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
      case MSG_TRANSLATE_SELECTED:
        window.dispatchEvent(new CustomEvent(MSG_TRANSLATE_SELECTED));
        break;
      case MSG_OPEN_TRANBOX:
        window.dispatchEvent(new CustomEvent(MSG_OPEN_TRANBOX));
        break;
      default:
        return { error: `message action is unavailable: ${action}` };
    }
    return { data: translator.rule };
  });
}

/**
 * 入口函数
 */
(async () => {
  try {
    // 读取设置信息
    const setting = await getSettingWithDefault();

    // 适配iframe
    if (isIframe) {
      runIframe(setting);
      return;
    }

    // 不规范网页修复
    await runWebfix(setting);

    // 翻译网页
    const { translator, rule } = await runTranslator(setting);

    // 监听消息
    windowListener(rule);
    runtimeListener(translator);

    // 划词翻译
    showTransbox(setting);

    // 浮球按钮
    await showFab(translator);

    // 触屏操作
    touchOperation(translator);
  } catch (err) {
    console.error("[KISS-Translator]", err);
    showErr(err.message);
  }
})();
