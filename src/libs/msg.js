import { browser } from "./browser";

/**
 * 发送消息给background
 * @param {*} action
 * @param {*} args
 * @returns
 */
export const sendBgMsg = (action, args) =>
  browser.runtime.sendMessage({ action, args });

/**
 * 发送消息给当前页面
 * @param {*} action
 * @param {*} args
 * @returns
 */
export const sendTabMsg = async (action, args) => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return browser.tabs.sendMessage(tabs[0].id, { action, args });
};
