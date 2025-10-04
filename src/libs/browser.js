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

export const isBg = () => globalThis?.ContextType === "BACKGROUND";

export const isBuiltinAIAvailable =
  "LanguageDetector" in globalThis && "Translator" in globalThis;
