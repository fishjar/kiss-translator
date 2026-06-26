import { logger } from "../libs/log.js";
import { apiSubtitle, apiSummarizeContext } from "../apis/index.js";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager.js";
import { YouTubeSubtitleList } from "./YouTubeSubtitleList.js";
import { MSG_XHR_DATA_YOUTUBE, API_SPE_TYPES } from "../config";
import { downloadBlobFile } from "../libs/utils.js";
import { newI18n } from "../config";
import { buildBilingualVtt } from "./vtt.js";
import { getDocInfo } from "../libs/docInfo.js";
import { isSubtitleModeEnabled } from "./modes.js";
import { clearMsgHistory } from "../apis/history.js";
import {
  buildTrackKey,
  findCaptionTrack,
  getCaptionTracks,
  getSubtitleEvents,
  isSameLang,
} from "./youtubeCaptionTracks.js";
import { eventsToSubtitles } from "./youtubeAiSegmentation.js";
import {
  builtinSegment,
  formatSubtitles,
  genFlatEvents,
  getFromLang,
  normalizeTimedTextEvents,
} from "./youtubeSubtitleProcessing.js";
import {
  CONTROLS_SELECTOR,
  VIDEO_SELECTOR,
  YT_AD_SELECTOR,
  YT_SUBTITLE_BUTTON_SELECTOR,
  YouTubePlayerUi,
  waitForElement,
} from "./youtubePlayerUi.js";

/**
 * YouTube 字幕翻译与双语渲染入口。
 * 负责页面生命周期、字幕轨处理调度、异步竞态保护，并把结果交给播放器渲染器。
 */
class YouTubeCaptionProvider {
  // 扩展配置选项对象
  #setting = {};

  // 最终处理合并、翻译好的双语字幕数组（包含开始/结束时间、原文、翻译）
  #subtitles = [];
  // YouTube 返回的原生字幕事件流数据，直接保存以备重处理/降级使用
  #events = [];
  #rawSubtitleEvents = [];
  // 展平并排好序的细粒度单词级别字幕流
  #flatEvents = [];
  // 翻译处理进度百分比 (0-100)
  #progressedNum = 0;
  // 视频原字幕的源语言编码，默认 auto
  #fromLang = "auto";
  // 网页上下文及大模型提炼的大纲信息，辅助提高翻译专有名词与句式准确率
  #docInfo = {};
  // 原生视频的完整 shortDescription 描述文本
  #fullDescription = "";

  // 当前正在处理的字幕轨唯一标识 Key
  #processingId = null;
  // 递增的版本号，用于避免前一视频异步翻译返回污染当前新视频的竞态条件
  #processingVersion = 0;
  // 当前已成功激活并运行的字幕轨唯一标识 Key
  #activeTrackKey = null;
  // AI 断句后续 chunk 的按需调度器；为 null 表示当前使用内置断句或尚未生成后续 chunk。
  #aiChunkScheduler = null;
  // 当前字幕断句/分块处理的取消控制器，用于视频或字幕轨切换时中止旧流式请求
  #subtitleAbortController = null;

  // 控制双语字幕渲染、显示和位置计算的管理器实例
  #managerInstance = null;
  // 国际化文案翻译辅助函数
  #i18n = () => "";
  // YouTube 播放器按钮、菜单、通知等 DOM 操作管理器
  #playerUi = null;
  // YouTube 底部控制条原生字幕激活状态的 DOM 监听器
  #ytSubtitleStateObserver = null;

  // 挂载在视频右侧/下方的双语字幕列表面板管理器实例
  #subtitleListManager = null;

  /**
   * 创建 YouTube 字幕处理器实例，并初始化用户配置、国际化和播放器 UI 管理器。
   *
   * @param {object} [setting={}] 字幕模块运行配置。
   */
  constructor(setting = {}) {
    this.#setting = { ...setting, showOrigin: false };
    this.#i18n = newI18n(setting.uiLang || "zh");
    this.#playerUi = new YouTubePlayerUi({
      getSetting: () => this.#setting,
      getMenuProps: () => this.#getMenuProps(),
      getVideoEl: () => this.#videoEl,
    });
  }

  /**
   * 当前 YouTube 播放页 URL 中的视频 ID。
   *
   * @returns {string|null} URL 查询参数 v 的值；非视频页返回 null。
   */
  get #videoId() {
    const docUrl = new URL(document.location.href);
    return docUrl.searchParams.get("v");
  }

  /**
   * 当前页面中 YouTube 原生 video 播放器节点。
   *
   * @returns {HTMLVideoElement|null} 匹配到的播放器 DOM 节点。
   */
  get #videoEl() {
    return document.querySelector(VIDEO_SELECTOR);
  }

  /**
   * 更新字幕处理进度，并同步刷新已展开的菜单状态。
   *
   * @param {number} num 新的处理进度百分比。
   */
  set #progressed(num) {
    this.#progressedNum = num;
    this.#playerUi.updateMenuProps();
  }

  /**
   * 当前字幕处理进度百分比。
   *
   * @returns {number} 处理进度，取值通常为 0-100。
   */
  get #progressed() {
    return this.#progressedNum;
  }

  /**
   * 初始化 YouTube 页面监听器和字幕按钮注入流程。
   * 只注册事件与 DOM 观察器，真正的字幕处理由拦截到 timedtext 请求后触发。
   *
   * @public
   * @returns {void}
   */
  initialize() {
    window.addEventListener("message", (event) => {
      if (event.data?.type === MSG_XHR_DATA_YOUTUBE) {
        const { url, response } = event.data;
        if (url && response) {
          this.#handleInterceptedRequest(url, response);
        }
      }
    });

    window.addEventListener("yt-navigate-finish", () => {
      logger.debug("Youtube Provider: yt-navigate-finish", this.#videoId);

      this.#destroyManager();
      clearMsgHistory(this.#setting.apiSlug);

      this.#subtitles = [];
      this.#events = [];
      this.#rawSubtitleEvents = [];
      this.#flatEvents = [];
      this.#progressed = 0;
      this.#fromLang = "auto";
      this.#docInfo = {};
      this.#fullDescription = "";
      this.#processingId = null;
      this.#processingVersion += 1;
      this.#activeTrackKey = null;
      this.#aiChunkScheduler = null;
      this.#subtitleAbortController?.abort();
      this.#subtitleAbortController = null;
      this.#playerUi.updateMenuProps();
    });

    waitForElement(CONTROLS_SELECTOR, (ytControls) => {
      const ytSubtitleBtn = ytControls.querySelector(
        YT_SUBTITLE_BUTTON_SELECTOR
      );
      if (ytSubtitleBtn) {
        this.#observeYtSubtitleState(ytSubtitleBtn);
      }

      this.#playerUi.injectToggleButton(ytControls);
    });

    waitForElement(YT_AD_SELECTOR, (adContainer) => {
      this.#moAds(adContainer);
    });
  }

  /**
   * 建立对 YouTube 原生字幕按钮状态的 MutationObserver 观察器。
   *
   * @private
   * @param {HTMLButtonElement} ytSubtitleBtn YouTube 原生控制栏中的字幕切换按钮 DOM。
   * @returns {void}
   */
  #observeYtSubtitleState(ytSubtitleBtn) {
    this.#ytSubtitleStateObserver?.disconnect();
    this.#ytSubtitleStateObserver = new MutationObserver(() => {
      this.#syncYtSubtitleState(ytSubtitleBtn);
    });
    this.#ytSubtitleStateObserver.observe(ytSubtitleBtn, {
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });
    this.#syncYtSubtitleState(ytSubtitleBtn);
  }

  /**
   * 同步本插件的双语字幕状态至原生的字幕开关属性。
   *
   * @private
   * @param {HTMLButtonElement} ytSubtitleBtn YouTube 原生字幕按钮 DOM。
   * @returns {void}
   */
  #syncYtSubtitleState(ytSubtitleBtn) {
    if (ytSubtitleBtn.getAttribute("aria-pressed") === "true") {
      this.#startManager();
    } else {
      this.#destroyManager();
    }
  }

  /**
   * 检测当前 YouTube 视频上原生字幕按钮是否处于开启状态。
   *
   * @private
   * @returns {boolean} 开启返回 true，未开启或找不到按钮返回 false。
   */
  #isYtSubtitleEnabled() {
    const ytSubtitleBtn = document.querySelector(YT_SUBTITLE_BUTTON_SELECTOR);
    return (
      !ytSubtitleBtn || ytSubtitleBtn.getAttribute("aria-pressed") === "true"
    );
  }

  /**
   * 监听 YouTube 广告 DOM 状态，并在广告开始/结束时同步字幕渲染器状态。
   *
   * @private
   * @param {HTMLElement} adContainer YouTube 广告容器 DOM 节点。
   * @returns {void}
   */
  #moAds(adContainer) {
    const adLayoutSelector = ".ytp-ad-player-overlay-layout";
    const skipBtnSelector =
      ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern";
    const observer = new MutationObserver((mutations) => {
      const { skipAd = false } = this.#setting;
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;

        const videoEl = this.#videoEl;
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          if (node.matches(adLayoutSelector)) {
            logger.debug("Youtube Provider: AD start playing!", node);
            if (videoEl && skipAd) {
              // REVIEW: 沿用原有直接 16 倍速并跳到广告末尾的行为，可能触发 YouTube 风控。
              // REVIEW: 广告结束时仍会重置到 1 倍速，可能覆盖用户自定义倍速；后续应单独修复。
              videoEl.playbackRate = 16;
              videoEl.currentTime = videoEl.duration;
            }
            this.#managerInstance?.setIsAdPlaying(true);
          } else if (node.matches(skipBtnSelector) && skipAd) {
            logger.debug("Youtube Provider: AD skip button!", node);
            node.click();
          }

          if (skipAd) {
            const skipBtn = node?.querySelector(skipBtnSelector);
            if (skipBtn) {
              logger.debug("Youtube Provider: AD skip button!!", skipBtn);
              skipBtn.click();
            }
          }
        });

        mutation.removedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          if (node.matches(adLayoutSelector)) {
            logger.debug("Youtube Provider: Ad ends!");
            if (!this.#setting.showOrigin) {
              this.#playerUi.hideYtCaption();
            }
            if (videoEl && skipAd) {
              videoEl.playbackRate = 1;
            }
            this.#managerInstance?.setIsAdPlaying(false);
          }
        });
      }
    });

    observer.observe(adContainer, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * 外部 UI 设置变更响应总入口。
   *
   * @public
   * @param {object} param0 参数对象。
   * @param {string} param0.name 设置项属性键名。
   * @param {*} param0.value 设置项的新值。
   * @returns {void}
   */
  updateSetting({ name, value }) {
    if (this.#setting[name] === value) return;

    logger.debug("Youtube Provider: update setting", name, value);
    this.#setting[name] = value;

    this.#playerUi.updateMenuProps();

    if (
      name === "isBilingual" ||
      name === "blurTranslation" ||
      name === "displayOrder"
    ) {
      this.#managerInstance?.updateSetting({ [name]: value });
    } else if (name === "segSlug" || name === "forceSubtitleRetranslate") {
      this.#reProcessEvents();
    } else if (name === "showOrigin") {
      this.#toggleShowOrigin();
    } else if (name === "aiContextSlug") {
      this.#reProcessEventsWithContext();
    } else if (name === "showLoadNotification" && value === false) {
      this.#playerUi.hideNotification();
    } else if (name === "hideSubtitleButton") {
      if (value === true) {
        this.#playerUi.removeToggleButton();
      } else {
        this.#playerUi.injectToggleButton(
          document.querySelector(CONTROLS_SELECTOR)
        );
      }
    }
  }

  /**
   * 根据“显示原版字幕”的切换配置，执行字幕渲染管理器的挂载与销毁。
   *
   * @private
   * @returns {void}
   */
  #toggleShowOrigin() {
    if (this.#setting.showOrigin) {
      this.#destroyManager();
    } else {
      this.#startManager();
    }
  }

  /**
   * 将当前翻译组装完毕的双语字幕打包为 VTT 格式文件，并唤起浏览器下载。
   *
   * @public
   * @returns {void}
   */
  downloadSubtitle() {
    if (!this.#subtitles.length) {
      logger.debug("Youtube Provider: The subtitle is not yet ready.");
      return;
    }

    try {
      const vtt = buildBilingualVtt(this.#subtitles);
      downloadBlobFile(
        vtt,
        `kiss-subtitles-${this.#videoId}_${Date.now()}.vtt`
      );
    } catch (error) {
      logger.info("Youtube Provider: download subtitles:", error);
    }
  }

  /**
   * 获取字幕菜单 React 组件的 props。
   *
   * @private
   * @returns {object} 传给字幕菜单 React 组件的 props。
   */
  #getMenuProps() {
    const {
      transApis,
      segSlug,
      skipAd,
      isBilingual,
      blurTranslation,
      showOrigin,
      aiContextSlug,
    } = this.#setting;
    return {
      i18n: this.#i18n,
      updateSetting: this.updateSetting.bind(this),
      downloadSubtitle: this.downloadSubtitle.bind(this),
      transApis,
      progressed: this.#progressedNum,
      formData: {
        segSlug,
        skipAd,
        isBilingual,
        blurTranslation,
        showOrigin,
        aiContextSlug,
      },
    };
  }

  /**
   * 检查异步处理版本是否已经过期。
   *
   * @private
   * @param {number} version 异步任务创建时捕获的版本号。
   * @returns {boolean} 当前实例版本已变化时返回 true。
   */
  #isStaleProcessing(version) {
    return version !== this.#processingVersion;
  }

  /**
   * 处理页面注入脚本拦截到的 YouTube timedtext 请求。
   * 该方法会校验视频与字幕轨、拉取原始字幕事件，并启动后续断句翻译流程。
   *
   * @private
   * @param {string} url 被拦截到的 timedtext 请求 URL。
   * @param {string} responseText 被拦截请求的响应文本。
   * @returns {Promise<void>}
   */
  async #handleInterceptedRequest(url, responseText) {
    const videoId = this.#videoId;
    if (!videoId) {
      logger.debug("Youtube Provider: videoId not found.");
      return;
    }

    const potUrl = new URL(url);
    if (videoId !== potUrl.searchParams.get("v")) {
      logger.debug("Youtube Provider: skip other timedtext:", videoId);
      return;
    }

    const lang = potUrl.searchParams.get("lang");
    if (!lang) {
      logger.debug("Youtube Provider: timedtext lang not found:", url);
      return;
    }

    const interceptedKind = potUrl.searchParams.get("kind") || null;
    const trackKey = buildTrackKey(potUrl);
    const fromLang = getFromLang(lang);

    if (this.#flatEvents.length && trackKey === this.#activeTrackKey) {
      logger.debug("Youtube Provider: track was processed:", trackKey);
      return;
    }

    if (this.#processingId === trackKey) {
      logger.debug("Youtube Provider: track is processing:", trackKey);
      return;
    }

    const processingVersion = (this.#processingVersion += 1);
    this.#processingId = trackKey;
    this.#subtitleAbortController?.abort();
    this.#subtitleAbortController = new AbortController();
    this.#aiChunkScheduler = null;

    if (this.#flatEvents.length) {
      this.#destroyManager();
      clearMsgHistory(this.#setting.apiSlug);
      this.#subtitles = [];
      this.#events = [];
      this.#rawSubtitleEvents = [];
      this.#flatEvents = [];
      this.#progressed = 0;
      this.#activeTrackKey = null;
      this.#aiChunkScheduler = null;
    }

    try {
      this.#playerUi.showNotification(
        this.#i18n("starting_to_process_subtitle")
      );

      const { toLang } = this.#setting;
      const { captionTracks, fullDescription } =
        await getCaptionTracks(videoId);
      if (this.#isStaleProcessing(processingVersion)) return;

      this.#fullDescription = fullDescription || "";
      const captionTrack = findCaptionTrack(
        captionTracks,
        lang,
        interceptedKind
      );
      if (!captionTrack) {
        logger.debug("Youtube Provider: CaptionTrack not found:", videoId);
        return;
      }
      if (!captionTrack.baseUrl.startsWith("https")) {
        captionTrack.baseUrl = window.location.origin + captionTrack.baseUrl;
      }
      const capUrl = new URL(captionTrack.baseUrl);
      const events = await getSubtitleEvents(capUrl, potUrl, responseText);
      if (this.#isStaleProcessing(processingVersion)) return;

      if (!events?.length) {
        logger.debug("Youtube Provider: events not got:", videoId);
        return;
      }
      this.#rawSubtitleEvents = events;

      logger.debug(
        `Youtube Provider: lang: ${lang}, fromLang: ${fromLang}, toLang: ${toLang}`
      );
      if (isSameLang(fromLang, toLang)) {
        logger.debug("Youtube Provider: skip same lang", fromLang, toLang);
        this.#playerUi.showNotification(this.#i18n("subtitle_same_lang"));
        return;
      }

      const subtitleEvents = normalizeTimedTextEvents(events);
      const flatEvents = genFlatEvents(subtitleEvents);
      if (!flatEvents?.length) {
        logger.debug("Youtube Provider: flatEvents not got:", videoId);
        return;
      }
      if (this.#isStaleProcessing(processingVersion)) return;

      this.#events = subtitleEvents;
      this.#flatEvents = flatEvents;
      this.#fromLang = fromLang;
      this.#activeTrackKey = trackKey;
      this.#docInfo = getDocInfo();
      await this.#enrichDocInfoWithAI(flatEvents, processingVersion);
      if (this.#isStaleProcessing(processingVersion)) return;

      this.#processEvents({
        videoId,
        flatEvents,
        fromLang,
        processingVersion,
        signal: this.#subtitleAbortController.signal,
      });
    } catch (error) {
      logger.warn("Youtube Provider: handle subtitle", error);
      this.#playerUi.showNotification(this.#i18n("subtitle_load_failed"));
    } finally {
      if (
        !this.#isStaleProcessing(processingVersion) &&
        this.#processingId === trackKey
      ) {
        this.#processingId = null;
      }
    }
  }

  /**
   * 核心断句分句渲染调度器。
   * 负责将展平后的 flatEvents 传递给断句流程，并启动 BilingualSubtitleManager 实例。
   *
   * @private
   * @param {object} param0 参数对象。
   * @param {string} param0.videoId 当前视频 ID。
   * @param {Array<object>} param0.flatEvents 展平清洗后的单词节点流。
   * @param {string} param0.fromLang 字幕源语言代码。
   * @param {number} param0.processingVersion 当前异步任务的版本号快照。
   * @returns {Promise<void>}
   */
  async #processEvents({
    videoId,
    flatEvents,
    fromLang,
    processingVersion,
    signal,
  }) {
    try {
      const [subtitles, progressed, aiChunkScheduler] = await eventsToSubtitles(
        {
          videoId,
          events: this.#events,
          flatEvents,
          fromLang,
          setting: this.#setting,
          processingVersion,
          isStaleProcessing: (version) => this.#isStaleProcessing(version),
          showNotification: (message, duration) =>
            this.#playerUi.showNotification(message, duration),
          i18n: this.#i18n,
          apiSubtitle,
          docInfo: this.#docInfo,
          builtinSegment,
          formatSubtitles: (events, lang) =>
            formatSubtitles(events, lang, {
              longSentenceThreshold: this.#setting.longSentenceThreshold,
            }),
          onAppendSubtitles: ({ subtitles, progressed }) => {
            this.#appendProcessedSubtitles(subtitles, progressed);
          },
          getCurrentVideoId: () => this.#videoId,
          signal,
        }
      );
      if (this.#isStaleProcessing(processingVersion)) return;
      this.#aiChunkScheduler = aiChunkScheduler || null;
      if (this.#aiChunkScheduler && this.#videoEl) {
        // 首块完整返回后立即按当前播放点补一次调度，避免暂停或低频 timeupdate 时后续 chunk 不启动。
        this.#scheduleAiChunks(
          this.#videoEl.currentTime * 1000,
          this.#setting.preTrans ?? 90
        );
      }

      if (!subtitles?.length && !this.#subtitles.length) {
        logger.debug(
          "Youtube Provider: events to subtitles got empty",
          videoId
        );
        return;
      }

      if (videoId !== this.#videoId) {
        logger.debug(
          "Youtube Provider: videoId changed!",
          videoId,
          this.#videoId
        );
        return;
      }

      const managedSubtitles = this.#upsertProcessedSubtitles(
        subtitles,
        progressed
      );
      this.#startManager();
      this.#managerInstance?.repairChunkTranslations(managedSubtitles);
    } catch (error) {
      if (error?.name === "AbortError") return;
      logger.info("Youtube Provider: process events", error);
      this.#playerUi.showNotification(this.#i18n("subtitle_load_failed"));
    }
  }

  /**
   * 按时间轴合并已经处理出的字幕句子，并同步进度。
   *
   * @private
   * @param {Array<object>} subtitles 新返回的字幕条目。
   * @param {number} progressed 后台处理进度百分比。
   * @returns {Array<object>} 本次新增的字幕条目。
   */
  #upsertProcessedSubtitles(subtitles, progressed) {
    if (!subtitles?.length) {
      this.#progressed = progressed;
      return [];
    }

    const existed = new Map(
      this.#subtitles.map((sub, index) => [`${sub.start}:${sub.end}`, index])
    );
    const changed = [];

    for (const subtitle of subtitles) {
      const key = `${subtitle.start}:${subtitle.end}`;
      const index = existed.get(key);
      if (index !== undefined) {
        // 完整 chunk 回来时用最终结果覆盖同一时间轴句子，保留数组引用给 manager/list 使用。
        this.#subtitles[index] = { ...this.#subtitles[index], ...subtitle };
        changed.push(this.#subtitles[index]);
      } else {
        existed.set(key, this.#subtitles.length);
        this.#subtitles.push(subtitle);
        changed.push(subtitle);
      }
    }

    this.#subtitles.sort((a, b) => a.start - b.start);
    this.#progressed = progressed;
    return changed;
  }

  /**
   * 合并后台 AI 分块返回的字幕，并同步增量渲染到播放器与字幕列表。
   *
   * @private
   * @param {Array<object>} subtitles 当前分块生成的字幕条目。
   * @param {number} progressed 后台处理进度百分比。
   * @returns {void}
   */
  #appendProcessedSubtitles(subtitles, progressed) {
    const managedSubtitles = this.#upsertProcessedSubtitles(
      subtitles,
      progressed
    );

    if (!this.#managerInstance && this.#subtitles.length) {
      // 首个流式句子到达时立即启动字幕管理器，不再等待整个 AI chunk 返回。
      this.#startManager();
    }

    this.#managerInstance?.appendSubtitles(managedSubtitles);
    this.#subtitleListManager?.setBilingualSubtitles(
      this.#subtitles,
      this.#progressed
    );
    this.#managerInstance?.repairChunkTranslations(managedSubtitles);
  }

  /**
   * 当用户更改了断句设置时，触发对现有字幕的重新处理与渲染。
   *
   * @private
   * @returns {void}
   */
  #reProcessEvents() {
    this.#progressed = 0;
    this.#subtitles = [];

    const videoId = this.#videoId;
    const flatEvents = this.#flatEvents;
    const fromLang = this.#fromLang;
    if (!videoId || !flatEvents.length) {
      return;
    }

    this.#playerUi.showNotification(this.#i18n("starting_reprocess_events"));

    const processingVersion = (this.#processingVersion += 1);
    this.#subtitleAbortController?.abort();
    this.#subtitleAbortController = new AbortController();
    this.#aiChunkScheduler = null;
    this.#destroyManager();
    clearMsgHistory(this.#setting.apiSlug);

    this.#processEvents({
      videoId,
      flatEvents,
      fromLang,
      processingVersion,
      signal: this.#subtitleAbortController.signal,
    });
  }

  /**
   * 异步调用 AI 总结 API，提取视频的专有名词、主要大意及语境背景。
   * 提取的信息会保存在 docInfo.summary 中，为之后的翻译步骤提供上下文提示。
   *
   * @private
   * @param {Array<object>} flatEvents 展平后的原始字幕单词节点流。
   * @param {number} processingVersion 当前异步生命周期版本号。
   * @returns {Promise<void>}
   */
  async #enrichDocInfoWithAI(flatEvents, processingVersion) {
    const { aiContextSlug, transApis } = this.#setting;

    if (!aiContextSlug || aiContextSlug === "-") return;
    if (this.#isStaleProcessing(processingVersion)) return;

    const contextApiSetting = transApis?.find(
      (api) => api.apiSlug === aiContextSlug
    );
    if (!contextApiSetting) return;
    if (!API_SPE_TYPES.ai.has(contextApiSetting.apiType)) return;

    const transcript = flatEvents
      .map((e) => e.text)
      .filter(Boolean)
      .join(" ")
      .slice(0, 8000);

    if (transcript.length < 200) return;

    const videoId = this.#videoId;
    const docInfo = this.#docInfo;

    try {
      this.#playerUi.showNotification(this.#i18n("ai_context_analyzing"));

      const summary = await apiSummarizeContext({
        videoId,
        title: docInfo.title,
        description: this.#fullDescription || docInfo.description,
        transcript,
        apiSetting: contextApiSetting,
      });

      if (
        summary &&
        videoId === this.#videoId &&
        !this.#isStaleProcessing(processingVersion)
      ) {
        docInfo.summary = summary;
      }
    } catch (err) {
      logger.info("Youtube Provider: AI context enrichment failed", err);
    }
  }

  /**
   * 当用户更改了 AI 上下文引擎配置时，清空当前大纲记忆，并带上新上下文重新处理字幕事件。
   *
   * @private
   * @returns {Promise<void>}
   */
  async #reProcessEventsWithContext() {
    this.#progressed = 0;
    this.#subtitles = [];

    const videoId = this.#videoId;
    const flatEvents = this.#flatEvents;
    if (!videoId || !flatEvents.length) return;

    const processingVersion = (this.#processingVersion += 1);
    this.#subtitleAbortController?.abort();
    this.#subtitleAbortController = new AbortController();
    this.#aiChunkScheduler = null;
    this.#destroyManager();
    clearMsgHistory(this.#setting.apiSlug);
    this.#docInfo = getDocInfo();
    await this.#enrichDocInfoWithAI(flatEvents, processingVersion);
    if (this.#isStaleProcessing(processingVersion)) return;
    this.#processEvents({
      videoId,
      flatEvents,
      fromLang: this.#fromLang,
      processingVersion,
      signal: this.#subtitleAbortController.signal,
    });
  }

  /**
   * 将播放器播放窗口转发给 AI chunk 懒调度器。
   *
   * @private
   * @param {number} currentTimeMs 播放器当前时间，单位毫秒。
   * @param {number} preTrans 复用字幕“提前翻译时长”的前瞻秒数。
   * @returns {void}
   */
  #scheduleAiChunks(currentTimeMs, preTrans) {
    this.#aiChunkScheduler?.scheduleUntil(currentTimeMs, preTrans);
  }

  /**
   * 实例化双语字幕渲染管理器，并在页面和侧边栏初始化显示。
   *
   * @private
   * @returns {void}
   */
  #startManager() {
    if (!this.#isYtSubtitleEnabled()) {
      return;
    }

    if (this.#managerInstance) {
      return;
    }

    if (this.#setting.showOrigin) {
      return;
    }

    if (!this.#subtitles.length) {
      this.#playerUi.showNotification(this.#i18n("waitting_for_subtitle"));
      return;
    }

    const videoEl = this.#videoEl;
    if (!videoEl) {
      logger.warn("Youtube Provider: No video element found");
      return;
    }

    logger.info("Youtube Provider: Starting manager...");

    this.#managerInstance = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: this.#subtitles,
      setting: {
        ...this.#setting,
        fromLang: this.#fromLang,
        docInfo: this.#docInfo,
        // 由渲染管理器按 timeupdate/seeked 上报播放窗口，provider 再决定是否触发后续 AI chunk。
        onSubtitleTimeWindow: ({ currentTimeMs, preTrans }) =>
          this.#scheduleAiChunks(currentTimeMs, preTrans),
      },
    });

    const showList = isSubtitleModeEnabled(
      this.#setting.showList,
      this.#setting.enhanceMode
    );

    if (showList && !this.#subtitleListManager) {
      this.#subtitleListManager = new YouTubeSubtitleList(videoEl, this.#i18n, {
        enableHoverLookup: isSubtitleModeEnabled(
          this.#setting.hoverLookupMode,
          this.#setting.enhanceMode
        ),
      });
      this.#subtitleListManager.initialize(
        this.#subtitles,
        this.#rawSubtitleEvents,
        this.#progressed
      );

      this.#managerInstance.onSubtitleUpdate = (subtitleUpdate) => {
        this.#subtitleListManager.updateSingleSubtitle(subtitleUpdate);
      };

      this.#subtitleListManager.turnOnAutoSub();
    }

    this.#managerInstance.start();
    this.#playerUi.showNotification(this.#i18n("subtitle_load_succeed"));
    this.#playerUi.hideYtCaption();
  }

  /**
   * 销毁双语字幕管理器以及字幕侧边栏，恢复网页原生字幕展示状态。
   *
   * @private
   * @returns {void}
   */
  #destroyManager() {
    this.#playerUi.showYtCaption();

    if (!this.#managerInstance) {
      return;
    }

    logger.info("Youtube Provider: Destroying manager...");

    this.#managerInstance.onSubtitleUpdate = null;
    this.#managerInstance.destroy();
    this.#managerInstance = null;

    if (this.#subtitleListManager) {
      this.#subtitleListManager.destroy();
      this.#subtitleListManager = null;
    }
  }
}

/**
 * YouTube 字幕模块的单例初始化入口。
 * 多次调用只会创建一个 provider，避免重复注册页面监听器和重复注入控制按钮。
 *
 * @param {object} setting 字幕模块运行配置。
 * @returns {Promise<void>}
 */
export const YouTubeInitializer = (() => {
  let initialized = false;

  return async (setting) => {
    if (initialized) {
      return;
    }
    initialized = true;

    logger.info("Bilingual Subtitle Extension: Initializing...");
    const provider = new YouTubeCaptionProvider(setting);
    provider.initialize();
  };
})();
