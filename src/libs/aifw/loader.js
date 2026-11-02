/**
 * @file loader.js
 * @description 运行期加载随包分发的 aifw-js 产物（aifw-js/aifw-js.js）。
 *
 * 产物由构建脚本生成到 src/vendor/aifw-js，再在打包时复制到 build/<target>/aifw-js；
 * 所以运行期仍按扩展/站点根目录 URL 加载，不进入 webpack bundle。油猴脚本环境没有
 * 随包资源，直接不可用。
 */

import { isGm } from "../client";
import { AIFW_MODULE_PATH } from "./constants";

/** 模块在当前环境不可用（而非加载失败）的错误码。 */
export const AIFW_MODULE_UNAVAILABLE = "AIFW_UNAVAILABLE";

let modulePromise = null;

/**
 * 解析 aifw-js 入口模块的 URL。
 * @returns {string|null} 可动态 import 的绝对 URL；当前环境不支持时返回 null。
 */
export function resolveAifwModuleUrl() {
  // 油猴脚本没有随脚本分发的静态资源根目录，无法加载该产物。
  if (isGm) return null;

  const runtime = globalThis.chrome?.runtime;
  if (runtime && typeof runtime.getURL === "function") {
    try {
      return runtime.getURL(AIFW_MODULE_PATH);
    } catch {
      // 扩展 API 在个别受限页面不可用，按不支持处理。
      return null;
    }
  }

  if (typeof document !== "undefined" && document.baseURI) {
    try {
      return new URL(AIFW_MODULE_PATH, document.baseURI).href;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * 加载 aifw-js 模块（单例）。失败后清空缓存，允许后续重试。
 * @returns {Promise<object>} aifw-js 模块命名空间。
 */
export function loadAifwModule() {
  if (modulePromise) return modulePromise;

  const url = resolveAifwModuleUrl();
  if (!url) {
    const err = new Error("aifw-js is not available in this environment");
    err.code = AIFW_MODULE_UNAVAILABLE;
    return Promise.reject(err);
  }

  // webpackIgnore 阻止 CRA 尝试打包运行期才存在的产物。
  modulePromise = import(/* webpackIgnore: true */ url).catch((err) => {
    modulePromise = null;
    throw err;
  });
  return modulePromise;
}
