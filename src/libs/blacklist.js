import { isMatch } from "./utils";
import { DEFAULT_BLACKLIST } from "../config";

/**
 * 检查是否在黑名单中
 * @param {*} href
 * @param {*} param1
 * @returns
 */
export const isInBlacklist = (
  href,
  { blacklist = DEFAULT_BLACKLIST.join(",\n") }
) => blacklist.split(",").some((url) => isMatch(href, url.trim()));
