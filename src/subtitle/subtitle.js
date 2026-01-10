import { YouTubeInitializer } from "./YouTubeCaptionProvider.js";
import { isMatch } from "../libs/utils.js";
import { DEFAULT_API_SETTING } from "../config/api.js";
import { DEFAULT_SUBTITLE_SETTING } from "../config/setting.js";
import { logger } from "../libs/log.js";
import { injectJs, INJECTOR } from "../injectors/index.js";

const providers = [
  { pattern: "https://www.youtube.com", start: YouTubeInitializer },
];

export function runSubtitle({ href, setting }) {
  try {
    const subtitleSetting = setting.subtitleSetting || DEFAULT_SUBTITLE_SETTING;
    if (!subtitleSetting.enabled) {
      return;
    }

    const provider = providers.find((item) => isMatch(href, item.pattern));
    if (provider) {
      const id = "kiss-translator-inject-subtitle-js";
      injectJs(INJECTOR.subtitle, id);

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
