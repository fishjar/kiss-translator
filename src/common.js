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
import { isInBlacklist, isInWhitelist } from "./libs/blacklist";
import { runSubtitle } from "./subtitle/subtitle";
import { logger } from "./libs/log";
import { injectInlineJs } from "./libs/injector";
import TranslatorManager from "./libs/translatorManager";

/**
 * 油猴脚本特权桥接设置。
 * 当用户在浏览器中打开插件设置页时（打包后的 options.html 或是 dev 调试页面），
 * 该函数负责把油猴特权 GM 接口暴露给页面环境，以便设置页面能直接读写油猴配置项。
 */
function runSettingPage() {
  // 若油猴赋予了 unsafeWindow (直通宿主 window 权限)，则直接挂载
  if (GM.info?.script?.grant?.includes("unsafeWindow")) {
    unsafeWindow.GM = GM;
    unsafeWindow.APP_INFO = {
      name: process.env.REACT_APP_NAME,
      version: process.env.REACT_APP_VERSION,
    };
  } else {
    // 否则，回退到注册 CustomEvent 监听器进行间接通信代理
    const ping = genEventName();
    window.addEventListener(ping, handlePing);
    injectInlineJs(
      `(${injectScript})("${ping}")`,
      "kiss-translator-options-injector"
    );
  }
}

/**
 * 在页面顶部弹出一个悬浮的红色错误提示 Banner 框，持续 10 秒后自动淡出。
 * @param {string} message 错误内容信息
 */
function showErr(message) {
  const bannerId = "KISS-Translator-Message";
  const existingBanner = document.getElementById(bannerId);
  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement("div");
  banner.id = bannerId;

  // 设置 Banner 绝对定位和高 z-index，保证提示在前台可见
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

  // 渐隐淡出效果
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
  setTimeout(removeBanner, 10000); // 10秒后自动消失
}

/**
 * 依据匹配规则，获取用户生词本中的所有单词用于高亮显示。
 * @param {Object} rule 当前页面的翻译匹配规则
 * @returns {Promise<Array<string>>} 生词本里的单词数组
 */
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
 * 前端翻译器的核心运行总入口。
 * @param {boolean} isUserscript 是否作为油猴 Userscript 脚本模式运行 (false 代表作为浏览器 Extension 运行)
 */
export async function run(isUserscript = false) {
  try {
    // 1. 加载本地设置
    const setting = await getSettingWithDefault();

    // 2. 初始化全局日志配置
    logger.setLevel(setting.logLevel);

    // 3. 页面类型拦截：若是 PDF / 图片 / 音视频等非 HTML 或纯文本媒体页面，则终止执行，避免注入多余 DOM
    const contentType = document?.contentType?.toLowerCase() || "";
    if (!contentType.includes("text") && !contentType.includes("html")) {
      logger.info("Skip running in document content type: ", contentType);
      return;
    }

    const href = document?.location?.href || "";

    // 4. 若为油猴脚本环境，建立向后兼容的 GM 特权接口垫片
    if (isUserscript) {
      if (!globalThis.GM) {
        globalThis.GM = {
          xmlHttpRequest: globalThis.GM_xmlhttpRequest,
          registerMenuCommand: globalThis.GM_registerMenuCommand,
          unregisterMenuCommand: globalThis.GM_unregisterMenuCommand,
          setValue: globalThis.GM_setValue,
          getValue: globalThis.GM_getValue,
          deleteValue: globalThis.GM_deleteValue,
          info: globalThis.GM_info,
        };
      }

      // 如果当前是设置面板 URL，跳转去执行设置面板专用代理
      if (
        href.includes(process.env.REACT_APP_OPTIONSPAGE_DEV) ||
        href.includes(process.env.REACT_APP_OPTIONSPAGE)
      ) {
        runSettingPage();
        return;
      }
    }

    // 5. 网页黑名单校验，命中时彻底不启动翻译
    if (isInBlacklist(href, setting.blacklist)) {
      return;
    }

    // 5.1. iframe 白名单校验：如果是 iframe，但不在白名单中，则提前退出
    if (isIframe && !isInWhitelist(href, setting.iframeWhitelist)) {
      return;
    }

    // 6. 细粒度划词/输入框/鼠标悬停组件的专属黑名单拦截，若命中则单独禁用该交互组件
    if (isInBlacklist(href, setting.tranboxSetting?.blacklist)) {
      setting.tranboxSetting.transOpen = false;
    }

    if (isInBlacklist(href, setting.inputRule?.blacklist)) {
      setting.inputRule.transOpen = false;
    }

    if (isInBlacklist(href, setting.mouseHoverSetting?.blacklist)) {
      setting.mouseHoverSetting.useMouseHover = false;
    }

    // 7. 匹配当前网页专用的规则 (三级规则合并：个人 > 订阅 > 内置全局)
    const rule = await matchRule(href, setting);
    const favWords = await getFavWords(rule);
    const fabConfig = await getFabWithDefault();

    // 8. 创建翻译调度器管理器并启动
    const translatorManager = new TranslatorManager({
      setting,
      rule,
      fabConfig,
      favWords,
      isIframe,
      isUserscript,
    });
    translatorManager.start();

    // 9. 若当前页面是嵌套的 iframe，不进行视频字幕翻译，避免多个 iframe 里重复跑字幕服务造成冲突
    if (isIframe) {
      return;
    }

    // 10. 启动视频字幕翻译子模块 (仅在顶级 frame 下运行)
    runSubtitle({ href, setting, rule, isUserscript });

    // 11. 在油猴环境下，每次进入顶级页面时尝试触发一次订阅规则的自动同步检查 (每日一次)
    if (isUserscript) {
      trySyncAllSubRules(setting);
    }
  } catch (err) {
    console.error("[KISS-Translator]", err);
    showErr(err.message); // 向前台页面绘制报错 Banner，便于用户感知与排查问题
  }
}
