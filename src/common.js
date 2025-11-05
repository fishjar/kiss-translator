import { OPT_HIGHLIGHT_WORDS_DISABLE } from "./config";
import {
  getFabWithDefault,
  getSettingWithDefault,
  getWordsWithDefault,
} from "./libs/storage";
import { isIframe } from "./libs/iframe";
import { genEventName } from "./libs/utils";
import { handlePing, injectScript } from "./libs/gm";
import { matchRule } from "./libs/rules";
import { trySyncAllSubRules } from "./libs/subRules";
import { isInBlacklist } from "./libs/blacklist";
import { runSubtitle } from "./subtitle/subtitle";
import { logger } from "./libs/log";
import { injectInlineJs } from "./libs/injector";
import TranslatorManager from "./libs/translatorManager";

/**
 * 油猴脚本设置页面
 */
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
    injectInlineJs(
      `(${injectScript})("${ping}")`,
      "kiss-translator-options-injector"
    );
  }
}

/**
 * 显示错误信息到页面顶部
 * @param {*} message
 */
function showErr(message) {
  const bannerId = "KISS-Translator-Message";
  const existingBanner = document.getElementById(bannerId);
  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement("div");
  banner.id = bannerId;

  Object.assign(banner.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    backgroundColor: "#f44336",
    color: "white",
    textAlign: "center",
    padding: "8px 16px",
    zIndex: "1001",
    boxSizing: "border-box",
    fontSize: "16px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
  });

  const closeButton = document.createElement("span");
  closeButton.textContent = "×";

  Object.assign(closeButton.style, {
    position: "absolute",
    top: "50%",
    right: "20px",
    transform: "translateY(-50%)",
    cursor: "pointer",
    fontSize: "22px",
    fontWeight: "bold",
  });

  const messageText = document.createTextNode(`KISS-Translator: ${message}`);
  banner.appendChild(messageText);
  banner.appendChild(closeButton);

  document.body.appendChild(banner);

  const removeBanner = () => {
    banner.style.transition = "opacity 0.5s ease";
    banner.style.opacity = "0";
    setTimeout(() => {
      if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 500);
  };

  closeButton.onclick = removeBanner;
  setTimeout(removeBanner, 10000);
}

async function getFavWords(rule) {
  if (
    rule.highlightWords &&
    rule.highlightWords !== OPT_HIGHLIGHT_WORDS_DISABLE
  ) {
    try {
      return Object.keys(await getWordsWithDefault());
    } catch (err) {
      logger.info("get fav words", err);
    }
  }

  return [];
}

/**
 * 入口函数
 */
export async function run(isUserscript = false) {
  try {
    // if (document?.documentElement?.tagName?.toUpperCase() !== "HTML") {
    //   return;
    // }
    if (!document?.contentType?.includes("html")) {
      return;
    }

    // 读取设置信息
    const setting = await getSettingWithDefault();

    // 日志
    logger.setLevel(setting.logLevel);

    const href = document.location.href;

    // 设置页面
    if (
      isUserscript &&
      (href.includes(process.env.REACT_APP_OPTIONSPAGE_DEV) ||
        href.includes(process.env.REACT_APP_OPTIONSPAGE))
    ) {
      runSettingPage();
      return;
    }

    // 黑名单
    if (isInBlacklist(href, setting)) {
      return;
    }

    // 翻译网页
    const rule = await matchRule(href, setting);
    const favWords = await getFavWords(rule);
    const fabConfig = await getFabWithDefault();
    const translatorManager = new TranslatorManager({
      setting,
      rule,
      fabConfig,
      favWords,
      isIframe,
      isUserscript,
    });
    translatorManager.start();

    if (isIframe) {
      return;
    }

    // 字幕翻译
    runSubtitle({ href, setting, rule, isUserscript });

    if (isUserscript) {
      trySyncAllSubRules(setting);
    }
  } catch (err) {
    console.error("[KISS-Translator]", err);
    showErr(err.message);
  }
}
