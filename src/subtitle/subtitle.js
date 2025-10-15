import { YouTubeInitializer } from "./YouTubeCaptionProvider.js";
import { browser } from "../libs/browser.js";
import { isMatch } from "../libs/utils.js";
import { DEFAULT_API_SETTING } from "../config/api.js";
import { DEFAULT_SUBTITLE_SETTING } from "../config/setting.js";
import { injectExternalJs } from "../libs/injector.js";
import { logger } from "../libs/log.js";
import { XMLHttpRequestInjector } from "./XMLHttpRequestInjector.js";
import { injectInlineJs } from "../libs/injector.js";

const providers = [
  { pattern: "https://www.youtube.com", start: YouTubeInitializer },
];

export function runSubtitle({ href, setting, isUserscript }) {
  try {
    const subtitleSetting = setting.subtitleSetting || DEFAULT_SUBTITLE_SETTING;
    if (!subtitleSetting.enabled) {
      return;
    }

    const provider = providers.find((item) => isMatch(href, item.pattern));
    if (provider) {
      const id = "kiss-translator-xmlHttp-injector";
      if (isUserscript) {
        injectInlineJs(`(${XMLHttpRequestInjector})()`, id);
      } else {
        const src = browser.runtime.getURL("injector.js");
        injectExternalJs(src, id);
      }

      const apiSetting =
        setting.transApis.find(
          (api) => api.apiSlug === subtitleSetting.apiSlug
        ) || DEFAULT_API_SETTING;
      const segApiSetting = setting.transApis.find(
        (api) => api.apiSlug === subtitleSetting.segSlug
      );
      provider.start({
        ...subtitleSetting,
        apiSetting,
        segApiSetting,
        uiLang: setting.uiLang,
      });
    }
  } catch (err) {
    logger.error("start subtitle provider", err);
  }
}
