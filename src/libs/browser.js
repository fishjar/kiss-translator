// import { CLIENT_EXTS, CLIENT_USERSCRIPT, CLIENT_WEB } from "../config";

/**
 * 浏览器兼容插件，另可用于判断是插件模式还是网页模式，方便开发
 * @returns
 */
function _browser() {
  try {
    return require("webextension-polyfill");
  } catch (err) {
    // console.log("[browser]", err.message);
  }
}

export const browser = _browser();
// export const client = process.env.REACT_APP_CLIENT;
// export const isExt = CLIENT_EXTS.includes(client);
// export const isGm = client === CLIENT_USERSCRIPT;
// export const isWeb = client === CLIENT_WEB;

/**
 * 本地语言识别
 * @param {*} q
 * @returns
 */
export const detectLang = async (q) => {
  try {
    const res = await browser?.i18n?.detectLanguage(q);
    return res?.languages?.[0]?.language;
  } catch (err) {
    console.log("[detect lang]", err);
  }
};
