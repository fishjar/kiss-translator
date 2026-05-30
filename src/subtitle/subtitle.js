import { YouTubeInitializer } from "./YouTubeCaptionProvider.js";
import { isMatch } from "../libs/utils.js";
import { DEFAULT_API_SETTING } from "../config/api.js";
import { DEFAULT_SUBTITLE_SETTING } from "../config/setting.js";
import { logger } from "../libs/log.js";
import { injectJs, INJECTOR } from "../injectors/index.js";

// 各视频平台对应的字幕初始化拦截器配置
const providers = [
  { pattern: "https://www.youtube.com", start: YouTubeInitializer },
];

/**
 * 运行双语字幕翻译服务的主入口
 * 根据当前网页的 href 判断是否匹配支持的视频源，并在匹配成功时注入拦截脚本（如 timedtext 拦截器）启动字幕服务。
 * @param {object} params
 * @param {string} params.href - 当前网页链接
 * @param {object} params.setting - 全局用户配置选项
 */
export function runSubtitle({ href, setting }) {
  try {
    const subtitleSetting = setting.subtitleSetting || DEFAULT_SUBTITLE_SETTING;
    // 如果没有启用视频双语字幕功能，直接返回
    if (!subtitleSetting.enabled) {
      return;
    }

    // 查找匹配的视频字幕提供商
    const provider = providers.find((item) => isMatch(href, item.pattern));
    if (provider) {
      // 注入对应的底层 XHR 拦截注入脚本文件，在页面环境建立 timedtext 劫持
      const id = "kiss-translator-inject-subtitle-js";
      injectJs(INJECTOR.subtitle, id);

      const apiSetting =
        setting.transApis.find(
          (api) => api.apiSlug === subtitleSetting.apiSlug
        ) || DEFAULT_API_SETTING;

      // 启动特定平台的字幕翻译渲染引擎
      provider.start({
        ...subtitleSetting,
        apiSetting,
        transApis: setting.transApis,
        uiLang: setting.uiLang,
      });
    }
  } catch (err) {
    logger.error("start subtitle provider", err);
  }
}
