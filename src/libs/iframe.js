/**
 * 判定当前脚本是否运行在 Iframe 嵌套子页面中。
 */
export const isIframe = window.self !== window.top;

/**
 * 从当前页面向所有页面内的 iframe 子元素广播 HTML5 postMessage 消息。
 * REVIEW: 安全警告！
 * postMessage 的 targetOrigin 参数使用了通配符星号 "*"，这意味着如果子 iframe
 * 重定向至非受信任的第三方域，发送的数据可能会被泄露。建议在有安全合规要求的场景中，
 * 将 "*" 替换为具体的受信任域名。
 * @param {string} action 指令动作名称
 * @param {Object} args 指令参数
 */
export const sendIframeMsg = (action, args) => {
  document.querySelectorAll("iframe").forEach((iframe) => {
    iframe.contentWindow.postMessage({ action, args }, "*");
  });
};

/**
 * 从当前 iframe 子页面向父 window 窗口发送 postMessage 消息。
 * REVIEW: 同上，此处 targetOrigin 为 "*"，存在信息越权截获风险。
 * @param {string} action 指令动作名称
 * @param {Object} args 指令参数
 */
export const sendParentMsg = (action, args) => {
  window.parent.postMessage({ action, args }, "*");
};
