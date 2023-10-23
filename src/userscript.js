import { getSettingWithDefault } from "./libs/storage";
import { trySyncAllSubRules } from "./libs/subRules";
import { isIframe } from "./libs/iframe";
import { handlePing, injectScript } from "./libs/gm";
import { genEventName } from "./libs/utils";
import { runWebfix } from "./libs/webfix";
import {
  runIframe,
  runTranslator,
  showFab,
  windowListener,
  showErr,
} from "./common";

function runSettingPage() {
  if (GM?.info?.script?.grant?.includes("unsafeWindow")) {
    unsafeWindow.GM = GM;
    unsafeWindow.APP_INFO = {
      name: process.env.REACT_APP_NAME,
      version: process.env.REACT_APP_VERSION,
    };
  } else {
    const ping = genEventName();
    window.addEventListener(ping, handlePing);
    // window.eval(`(${injectScript})("${ping}")`); // eslint-disable-line
    const script = document.createElement("script");
    script.textContent = `(${injectScript})("${ping}")`;
    document.head.append(script);
  }
}

/**
 * 入口函数
 */
(async () => {
  try {
    // 设置页面
    if (
      document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE_DEV) ||
      document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE) ||
      document.location.href.includes(process.env.REACT_APP_OPTIONSPAGE2)
    ) {
      runSettingPage();
      return;
    }

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

    // 浮球按钮
    await showFab(translator);

    // 同步订阅规则
    await trySyncAllSubRules(setting);
  } catch (err) {
    showErr(err);
  }
})();
