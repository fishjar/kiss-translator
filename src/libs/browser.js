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

const browser = _browser();

export default browser;
