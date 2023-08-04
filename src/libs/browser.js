/**
 * 浏览器兼容插件，另可用于判断是插件模式还是网页模式，方便开发
 * @returns
 */
function _browser() {
  try {
    return require("webextension-polyfill");
  } catch (err) {
    console.log("[browser]", err.message);
  }
}

export const browser = _browser();
export const client = process.env.REACT_APP_CLIENT;
