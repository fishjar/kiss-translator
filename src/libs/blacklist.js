import { isMatch } from "./utils";

/**
 * 检查是否在黑名单中
 * @param {*} href
 * @param {*} param1
 * @returns
 */
export const isInBlacklist = (href, { blacklist }) =>
  blacklist.split(/\n|,/).some((url) => isMatch(href, url.trim()));
