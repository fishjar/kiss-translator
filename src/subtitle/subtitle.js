import { YouTubeInitializer } from "./YouTubeCaptionProvider.js";
import { isMatch } from "../libs/utils.js";
import { DEFAULT_API_SETTING } from "../config/api.js";
import { DEFAULT_SUBTITLE_SETTING } from "../config/setting.js";
import { logger } from "../libs/log.js";
import { injectJs, INJECTOR } from "../injectors/index.js";

// 各视频平台对应的字幕初始化拦截器配置
// 目前仅配置了 YouTube 的匹配规则 (pattern) 及其对应的初始化引导器 (YouTubeInitializer)
const providers = [
  { pattern: "https://www.youtube.com", start: YouTubeInitializer },
];

/**
 * 运行双语字幕翻译服务的主入口。
 * 该函数根据当前网页的 href URL，匹配已注册的视频服务提供商列表。
 * 如果匹配成功，则执行底层的 XHR 拦截脚本注入（用于劫持平台字幕数据请求，如 YouTube 的 timedtext 接口），
 * 接着获取用户的字幕/翻译配置，并初始化启动对应平台的字幕翻译渲染引擎。
 *
 * @param {object} params - 引导参数对象
 * @param {string} params.href - 当前浏览器网页的完整链接 (document.location.href)
 * @param {object} params.setting - 全局用户配置选项，包括 subtitleSetting 和 transApis
 */
export function runSubtitle({ href, setting }) {
  try {
    // 获取字幕配置，若无则使用默认字幕配置
    const subtitleSetting = setting.subtitleSetting || DEFAULT_SUBTITLE_SETTING;

    // 如果用户在设置中关闭了视频双语字幕翻译功能，则不执行任何后续操作，直接返回
    if (!subtitleSetting.enabled) {
      return;
    }

    // 根据当前网页 URL (href) 查找是否有匹配的字幕服务提供商（例如匹配 YouTube 网址）
    const provider = providers.find((item) => isMatch(href, item.pattern));
    if (provider) {
      // 1. 注入底层的劫持脚本 (INJECTOR.subtitle)
      // 该操作会在原生页面环境中动态注入一段 JS 脚本，用以劫持底层的 XHR (XMLHttpRequest) 请求。
      // 这对于拦截 YouTube 的 timedtext 异步字幕请求并将其回传给当前扩展至关重要。
      const id = "kiss-translator-inject-subtitle-js";
      injectJs(INJECTOR.subtitle, id);

      // 2. 获取当前字幕翻译所关联的翻译 API 配置 (apiSetting)
      const transApis = setting.transApis || [];
      const apiSetting =
        transApis.find((api) => api.apiSlug === subtitleSetting.apiSlug) ||
        DEFAULT_API_SETTING;

      // 3. 启动特定平台的字幕翻译与渲染引擎 (如 YouTubeCaptionProvider)
      // 将整理好的字幕配置、翻译 API 配置、所有已启用的 API 列表以及 UI 界面语言传递给对应的 provider
      provider.start({
        ...subtitleSetting,
        apiSetting,
        transApis,
        prompts: setting.prompts,
        uiLang: setting.uiLang,
      });
    }
  } catch (err) {
    logger.error("start subtitle provider failed", err);
  }
}
