/**
 * @file originRules.js
 * @description 构造需要改写 Origin 请求头的域名列表。
 *
 * PaddleOCR 官方异步 API 的网关会直接拒绝带跨域 Origin 的浏览器请求
 * （403，空响应），因此该域名必须始终通过 DNR 将 Origin 伪装成目标源。
 * 即使旧版本用户保存的 orilist 中没有它，也要在后台规则中强制补上。
 */

import { PADDLEOCR_ORIGIN } from "../config/apiConstants";

/**
 * 归一化 Origin 改写列表，并保证 PaddleOCR 域名始终存在。
 * @param {Array<string>|string} [orilist] 用户配置的域名列表，支持逗号/换行分隔
 * @returns {Array<string>} 去重后的域名列表
 */
export function normalizeOriginRewriteList(orilist) {
  let list = orilist;
  if (typeof list === "string")
    list = list
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter(Boolean);
  if (!Array.isArray(list)) list = [];
  return Array.from(
    new Set([
      ...list.map((url) => String(url).trim()).filter(Boolean),
      PADDLEOCR_ORIGIN,
    ])
  );
}
