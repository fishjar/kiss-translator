/**
 * @file trustedTypes.js
 * @description Trusted Types (可信类型) 辅助模块，用于兼容现代浏览器高强度 CSP 限制下的 HTML 注入和动态脚本执行，防范 XSS 攻击。
 */

import { logger } from "./log";
import DOMPurify from "dompurify";

// JSDoc 类型的 Trusted Types 辅助工具类
export const trustedTypesHelper = (() => {
  const POLICY_NAME = "kiss-translator-policy";
  let policy = null;

  // 只有在浏览器支持 Trusted Types (如 Chromium 83+) 且处于安全上下文中时才创建 Policy
  if (globalThis.trustedTypes && globalThis.trustedTypes.createPolicy) {
    try {
      policy = globalThis.trustedTypes.createPolicy(POLICY_NAME, {
        // 使用 DOMPurify 清洗注入的 HTML，保证译文容器中没有恶意代码
        createHTML: (string) => DOMPurify.sanitize(string),

        // REVIEW: createScript 和 createScriptURL 目前只是原样返回，仅能绕过 CSP 检测，但无法拦截恶意的恶意脚本字符串注入。
        // 如果插件以后会接收外部不受信源的脚本，建议在这里进行正则或者白名单过滤。
        createScript: (string) => string,
        createScriptURL: (string) => string,
      });
    } catch (err) {
      // 避免在某些重复执行的生命周期中抛出 Policy 命名重复错误
      if (err.message.includes("already exists")) {
        policy = globalThis.trustedTypes.policies.get(POLICY_NAME);
      } else {
        logger.info("cont create Trusted Types", err);
      }
    }
  }

  return {
    /**
     * 创建符合可信类型的 HTML，若不支持则原样返回
     * @param {string} htmlString
     */
    createHTML: (htmlString) => {
      return policy ? policy.createHTML(htmlString) : htmlString;
    },
    /**
     * 创建符合可信类型的 Script 脚本，若不支持则原样返回
     * @param {string} scriptString
     */
    createScript: (scriptString) => {
      return policy ? policy.createScript(scriptString) : scriptString;
    },
    /**
     * 创建符合可信类型的 ScriptURL 脚本地址，若不支持则原样返回
     * @param {string} urlString
     */
    createScriptURL: (urlString) => {
      return policy ? policy.createScriptURL(urlString) : urlString;
    },
    /**
     * 判断当前 Trusted Types 策略是否生效
     * @returns {boolean}
     */
    isEnabled: () => policy !== null,
  };
})();
