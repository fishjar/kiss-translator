/**
 * @file browser.js
 * @description 浏览器环境桥接模块，用于引入 WebExtension Polyfill 垫片，并提供当前执行环境上下文 (Background, Options, Content Script) 的判定工具。
 */

// import { CLIENT_EXTS, CLIENT_USERSCRIPT, CLIENT_WEB } from "../config";

/**
 * 尝试安全加载 webextension-polyfill
 * @returns {object|undefined} 浏览器插件 API polyfill 实例，非插件环境则返回 undefined
 */
function _browser() {
  try {
    return require("webextension-polyfill");
  } catch (err) {
    // 非扩展环境下运行时忽略报错 (如开发打包、Web 预览)
    // kissLog("browser", err);
  }
}

// 统一的浏览器扩展 API 导出对象
export const browser = _browser();

/**
 * 获取当前脚本在浏览器扩展中的具体执行环境上下文
 * @returns {string} 返回 "background" | "content" | "options" | "popup" | "undefined"
 *
 * REVIEW:
 * 在此处的 `getContext` 中，目前完全依赖 `globalThis.__KISS_CONTEXT__` 全局变量来进行判断。
 * 如果该变量在某些入口点 (如 Options, Popup React 根节点) 忘记预先挂载，则默认会返回 "undefined"，
 * 导致 isOptions() 或 isBg() 的行为产生非预期判定。
 * 建议保留以前被注释掉的 fallback 判定逻辑（例如校验 window.location 协议及 path ），以提升容错率。
 */
export const getContext = () => {
  const context = globalThis.__KISS_CONTEXT__;
  if (context) return context;

  // if (typeof window === "undefined" || typeof document === "undefined") {
  //   return "background";
  // }

  // const extensionOrigin = browser.runtime.getURL("");
  // if (!window.location.href.startsWith(extensionOrigin)) {
  //   return "content";
  // }

  // const pathname = window.location.pathname;
  // if (pathname.includes("popup")) return "popup";
  // if (pathname.includes("options")) return "options";
  // if (pathname.includes("sidepanel")) return "sidepanel";
  // if (pathname.includes("background")) return "background";

  return "undefined";
};

// 辅助环境判定变量
export const isBg = () => getContext() === "background";
export const isOptions = () => getContext() === "options";

// 判断当前浏览器内核中是否支持原生内置 AI (LanguageDetector 和 Translator，目前主要是 Chrome Dev 138+)
export const isBuiltinAIAvailable =
  "LanguageDetector" in globalThis && "Translator" in globalThis;
