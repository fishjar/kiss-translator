/**
 * @file blacklist.js
 * @description 黑名单检测模块。根据用户配置的黑名单网址列表，判定当前网页是否处于禁用整页翻译或划词翻译的范围内。
 */

import { isMatch } from "./utils";

/**
 * 检查当前网页 URL 是否处于配置的黑名单列表中
 * @param {string} href 当前页面的完整 URL (如 location.href)
 * @param {string} [blacklist=""] 逗号或换行分隔的黑名单网址/匹配模式列表
 * @returns {boolean} 如果处于黑名单中，返回 true；否则返回 false
 *
 * REVIEW:
 * 当 `blacklist` 中包含连续的逗号或空行时，会切分出空字符串。
 * 虽然 `isMatch` 内部对空字符做了拦截并返回 `false`，但这些无效空字符串依然会参与 `some` 迭代，产生无谓的开销。
 * 建议在 `split` 后加入 `.map(u => u.trim()).filter(Boolean)` 来清洗数组，以提高防御性编码质量与性能。
 */
export const isInBlacklist = (href, blacklist = "") =>
  blacklist.split(/\n|,/).some((url) => isMatch(href, url.trim()));
