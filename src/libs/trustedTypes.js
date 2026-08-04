/**
 * @file trustedTypes.js
 * @description Trusted Types (可信类型) 辅助模块，用于兼容现代浏览器高强度 CSP 限制下的 HTML 注入和动态脚本执行，防范 XSS 攻击。
 */

import DOMPurify from "dompurify";

// JSDoc 类型的 Trusted Types 辅助工具类
export const trustedTypesHelper = (() => {
  const POLICY_NAME = "kiss-translator-policy";
  let policy = null;
  let policyUnavailable = false;

  const createPolicy = () => {
    if (policy || policyUnavailable) {
      return policy;
    }

    if (!globalThis.trustedTypes || !globalThis.trustedTypes.createPolicy) {
      policyUnavailable = true;
      return null;
    }

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
      if (err?.message?.includes("already exists")) {
        policy = globalThis.trustedTypes.policies?.get(POLICY_NAME) || null;
      }

      if (!policy) {
        policyUnavailable = true;
      }
    }

    return policy;
  };

  return {
    /**
     * 创建符合可信类型的 HTML，若不支持则返回清洗后的普通字符串
     * @param {string} htmlString
     */
    createHTML: (htmlString) => {
      const trustedPolicy = createPolicy();
      return trustedPolicy
        ? trustedPolicy.createHTML(htmlString)
        : DOMPurify.sanitize(htmlString);
    },
    /**
     * 创建符合可信类型的 Script 脚本，若不支持则原样返回
     * @param {string} scriptString
     */
    createScript: (scriptString) => {
      const trustedPolicy = createPolicy();
      return trustedPolicy
        ? trustedPolicy.createScript(scriptString)
        : scriptString;
    },
    /**
     * 创建符合可信类型的 ScriptURL 脚本地址，若不支持则原样返回
     * @param {string} urlString
     */
    createScriptURL: (urlString) => {
      const trustedPolicy = createPolicy();
      return trustedPolicy
        ? trustedPolicy.createScriptURL(urlString)
        : urlString;
    },
    /**
     * 判断当前 Trusted Types 策略是否生效
     * @returns {boolean}
     */
    isEnabled: () => policy !== null,
  };
})();
