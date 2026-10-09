import { isInBlacklist } from "./blacklist";

/** Resolve the page preference without including temporary shortcut visibility. */
export function isFabHiddenOnPage(fabConfig, href) {
  const isHide = Boolean(fabConfig?.isHide);
  return isInBlacklist(href, fabConfig?.hideExceptionList) ? !isHide : isHide;
}
