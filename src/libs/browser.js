// import { CLIENT_EXTS, CLIENT_USERSCRIPT, CLIENT_WEB } from "../config";

/**
 * 浏览器兼容插件，另可用于判断是插件模式还是网页模式，方便开发
 * @returns
 */
function _browser() {
  try {
    return require("webextension-polyfill");
  } catch (err) {
    // kissLog("browser", err);
  }
}

export const browser = _browser();

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

export const isBg = () => getContext() === "background";
export const isOptions = () => getContext() === "options";

export const isBuiltinAIAvailable =
  "LanguageDetector" in globalThis && "Translator" in globalThis;
