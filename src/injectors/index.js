import { browser } from "../libs/browser";
import { isExt } from "../libs/client";
import { injectExternalJs, injectInlineJs } from "../libs/injector";
import { shadowRootInjector } from "./shadowroot";
import { XMLHttpRequestInjector } from "./xmlhttp";

// 注入脚本名称映射常数
export const INJECTOR = {
  subtitle: "injector-subtitle.js", // 字幕劫持注入器名称
  shadowroot: "injector-shadowroot.js", // Shadow DOM 挂载监听器名称
};

// 注入器脚本实现映射表
const injectorMap = {
  [INJECTOR.subtitle]: XMLHttpRequestInjector,
  [INJECTOR.shadowroot]: shadowRootInjector,
};

/**
 * 在目标页面环境中注入 JS 脚本
 * 如果在浏览器扩展模式下，通过获取扩展包内的真实外部 JS 文件的 URL 进行注入（符合高级 CSP 限制）；
 * 如果在油猴脚本或独立脚本运行模式下，则将函数转化为自执行字符串（IIFE）直接作为 Inline 脚本代码块插入 DOM 中运行。
 * @param {string} name - 脚本名称
 * @param {string} [id] - 插入标签的 DOM ID 标识
 */
export function injectJs(name, id = "kiss-translator-inject-js") {
  const injector = injectorMap[name];
  if (!injector) return;

  if (isExt) {
    // 扩展环境：获取打包后的脚本 URL 载入
    const src = browser.runtime.getURL(name);
    injectExternalJs(src, id);
  } else {
    // 非扩展环境（如油猴）：将函数序列化为自执行 IIFE 字符串进行内联写入
    injectInlineJs(`(${injector})()`, id);
  }
}
