import { YouTubeInitializer } from "./YouTubeCaptionProvider.js";
import { browser } from "../libs/browser.js";
import { isMatch } from "../libs/utils.js";
import { DEFAULT_API_SETTING } from "../config/api.js";
import { DEFAULT_SUBTITLE_SETTING } from "../config/setting.js";
import { injectExternalJs } from "../libs/injector.js";
import { logger } from "../libs/log.js";

const providers = [
  { pattern: "https://www.youtube.com/watch", start: YouTubeInitializer },
];

export function runSubtitle({ href, setting, rule }) {
  try {
    const provider = providers.find((item) => isMatch(href, item.pattern));
    if (provider) {
      const id = "kiss-translator-injector";
      const src = browser.runtime.getURL("injector.js");
      injectExternalJs(src, id);

      const apiSetting =
        setting.transApis.find((api) => api.apiSlug === rule.apiSlug) ||
        DEFAULT_API_SETTING;
      provider.start({
        ...(setting.subtitleSetting || DEFAULT_SUBTITLE_SETTING),
        apiSetting,
      });
    }
  } catch (err) {
    logger.error("start subtitle provider", err);
  }
}
