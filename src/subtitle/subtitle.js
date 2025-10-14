import { YouTubeInitializer } from "./YouTubeCaptionProvider.js";
import { browser } from "../libs/browser.js";
import { isMatch } from "../libs/utils.js";
import { DEFAULT_API_SETTING } from "../config/api.js";
import { DEFAULT_SUBTITLE_SETTING } from "../config/setting.js";
import { injectExternalJs } from "../libs/injector.js";
import { logger } from "../libs/log.js";

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
      if (isUserscript) {
        GM.addElement("script", {
          src: "https://github.com/fishjar/kiss-translator/blob/gh-pages/injector.js",
          // src: "http://127.0.0.1:8000/injector.js",
          type: "text/javascript",
        }).onload = function () {
          console.log(
            "Script successfully injected and loaded via GM_addElement."
          );
        };
      } else {
        const id = "kiss-translator-injector";
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
