import { browser } from "./browser";

/**
 * 获取当前用户正在浏览且聚焦的活跃标签页 (Tab) 信息。
 * @returns {Promise<Object|undefined>} 活跃的标签页对象
 */
export const getCurTab = async () => {
  const [tab] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
};

/**
 * 获取当前活跃标签页的 ID。
 * @returns {Promise<number|undefined>} 标签页 ID
 */
export const getCurTabId = async () => {
  const tab = await getCurTab();
  return tab?.id;
};

/**
 * 向扩展后台 Service Worker (Background) 发送单向或双向消息。
 * REVIEW: 该方法依赖 `browser?.runtime` API，只能在浏览器扩展环境（Content Script, Popup, Options 等）下工作。
 * 在油猴 Userscript 环境中不可使用（油猴需使用特定 GM 接口或 CustomEvent 传递信息）。
 * @param {string} action 指令动作名称
 * @param {Object} args 指令参数数据
 * @returns {Promise<*>} 后台响应的数据
 */
export const sendBgMsg = (action, args) =>
  browser?.runtime.sendMessage({ action, args });

/**
 * Send a message to a specific tab, or the active tab when no target is supplied.
 * @param {string} action Message action.
 * @param {Object} args Message arguments.
 * @param {Object} options Browser message options, such as frameId.
 * @param {number} targetTabId The tab whose state initiated this operation.
 * @param {string} expectedDocumentToken Restrict execution to this document.
 * @param {string} responseDocumentToken Select the responding document only.
 * @returns {Promise<*>} Content-script response.
 */
export const sendTabMsg = async (
  action,
  args,
  options,
  targetTabId,
  expectedDocumentToken,
  responseDocumentToken
) => {
  const tabId = targetTabId ?? (await getCurTabId());
  if (tabId == null) return;

  // 向指定 ID 的标签页发送消息，并捕获常见的由于注入未就绪产生的错误
  const message = { action, args };
  if (expectedDocumentToken)
    message.expectedDocumentToken = expectedDocumentToken;
  if (responseDocumentToken)
    message.responseDocumentToken = responseDocumentToken;
  const sendPromise = options
    ? browser.tabs.sendMessage(tabId, message, options)
    : browser.tabs.sendMessage(tabId, message);
  return sendPromise.catch((err) => {
    // REVIEW: 屏蔽两种常见的无害通信错误：
    // 1. "Could not establish connection" (多发于前台 content script 尚未加载完毕或无响应)
    // 2. "Receiving end does not exist" (常见于用户在不支持注入扩展的浏览器内置特权页面如 chrome:// 上触发了消息)
    // 此处静默返回，避免未就绪的通信异常打断业务逻辑调用链或污染扩展错误页。
    if (
      err?.message?.includes("Could not establish connection") ||
      err?.message?.includes("Receiving end does not exist")
    ) {
      return;
    } else {
      throw err;
    }
  });
};

/**
 * Send a query or frame-local command to a tab's top frame.
 * Commands intended for every frame should continue to use sendTabMsg.
 *
 * @param {string} action Message action.
 * @param {Object} args Message arguments.
 * @param {number} targetTabId Explicit target, or the active tab when omitted.
 * @returns {Promise<*>} Top-frame response.
 */
export const sendTopFrameMsg = (
  action,
  args,
  targetTabId,
  expectedDocumentToken
) =>
  sendTabMsg(action, args, { frameId: 0 }, targetTabId, expectedDocumentToken);
