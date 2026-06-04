import { trustedTypesHelper } from "./trustedTypes";

// 向宿主页面注入行内 JavaScript 脚本。
// 结合 Trusted Types 机制处理代码，兼容高安全 CSP (Content Security Policy) 要求的网站。
export const injectInlineJs = (code, id = "kiss-translator-inline-js") => {
  // 避免重复注入相同 ID 的脚本
  if (document.getElementById(id)) {
    return;
  }

  const el = document.createElement("script");
  el.setAttribute("data-source", "kiss-inject injectInlineJs");
  el.type = "text/javascript";
  el.id = id;
  // 通过 Trusted Types 策略生成受信任的 Script
  el.textContent = trustedTypesHelper.createScript(code);
  (document.head || document.documentElement).appendChild(el);
};

// 注入行内 JavaScript 脚本（免 Trusted Types 版）。
// REVIEW: 此函数直接对 textContent 赋值了未做 Trusted Types 包装的原始 code 字符串。
// 在严格启用了 CSP (Trusted Types 限制) 的网站（例如 GitHub/Google）中，该方法会抛出安全异常并导致注入失败。
// 建议非必要时统一使用 injectInlineJs。
export const injectInlineJsBg = (code, id = "kiss-translator-inline-js") => {
  if (document.getElementById(id)) {
    return;
  }

  const el = document.createElement("script");
  el.setAttribute("data-source", "kiss-inject injectInlineJsBg");
  el.type = "text/javascript";
  el.id = id;
  el.textContent = code;
  // 兼容 DOM 尚未加载完全的情况，若 document.head 不存在，则注入到 documentElement <html> 中
  (document.head || document.documentElement).appendChild(el);
};

// 向页面注入外部引用的 JavaScript 脚本文件。
export const injectExternalJs = (src, id = "kiss-translator-external-js") => {
  if (document.getElementById(id)) {
    return;
  }

  const el = document.createElement("script");
  el.setAttribute("data-source", "kiss-inject injectExternalJs");
  el.type = "text/javascript";
  el.id = id;
  // 通过 Trusted Types 转换外部 script 链接，防止被严格 CSP 拦截
  el.src = trustedTypesHelper.createScriptURL(src);
  (document.head || document.documentElement).appendChild(el);
};

// 向页面注入行内 CSS 样式。
export const injectInternalCss = (styles) => {
  const el = document.createElement("style");
  el.setAttribute("data-source", "kiss-inject injectInternalCss");
  el.textContent = styles;
  document.head?.appendChild(el);
};

// 向页面注入外部 CSS 样式文件链接。
export const injectExternalCss = (href) => {
  const el = document.createElement("link");
  el.setAttribute("data-source", "kiss-inject injectExternalCss");
  el.setAttribute("rel", "stylesheet");
  el.setAttribute("type", "text/css");
  el.setAttribute("href", href);
  document.head?.appendChild(el);
};
