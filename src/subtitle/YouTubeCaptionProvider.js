import { logger } from "../libs/log.js";
import { apiSubtitle, apiSummarizeContext } from "../apis/index.js";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager.js";
import { YouTubeSubtitleList } from "./YouTubeSubtitleList.js";
import { API_SPE_TYPES } from "../config";
import { downloadBlobFile } from "../libs/utils.js";
import { newI18n } from "../config";
import { buildBilingualVtt } from "./vtt.js";
import { getDocInfo } from "../libs/docInfo.js";
import { isSubtitleModeEnabled } from "./modes.js";
import { clearMsgHistory } from "../apis/history.js";
import {
  captionCacheRequest,
  captionSegmentationSignature,
  captionTranslationSignature,
  captionCueKey,
} from "./captionCache";
import { isSameLang } from "./youtubeCaptionTracks.js";
import { YoutubeAsrController, youtubeAsrSupported } from "./asr/controller";
import {
  activeYoutubePlayer,
  youtubeVideoId,
  captionTrackId,
  selectCaptionTrack,
  captionUrl,
  parseTimedText,
} from "./youtubeCaptionSource";
import {
  YouTubeCaptionBridgeClient,
  YouTubeCaptionAcquirer,
} from "./youtubeAcquisition";
import { eventsToSubtitles } from "./youtubeAiSegmentation.js";
import {
  builtinSegment,
  formatSubtitles,
  getFromLang,
  prepareTimedTextEvents,
} from "./youtubeSubtitleProcessing.js";
import {
  CONTROLS_SELECTOR,
  YT_AD_SELECTOR,
  YT_SUBTITLE_BUTTON_SELECTOR,
  YouTubePlayerUi,
} from "./youtubePlayerUi.js";

/**
 * YouTube 字幕翻译与双语渲染入口。
 * 负责页面生命周期、字幕轨处理调度、异步竞态保护，并把结果交给播放器渲染器。
 */
export class YouTubeCaptionProvider {
  // 扩展配置选项对象
  #setting = {};
  #captionCacheContext = null;
  #captionCacheGeneration = null;
  #captionFinalCues = new Map();
  #captionCacheTimer = null;
  #captionContextPromise = null;
  #bridge;
  #acquirer;
  #asr;
  #asrState = { phase: "off" };
  #asrDisabled = false;
  #asrWanted = false;
  #nativeCaptionSnapshot = null;
  #captionCooldownUntil = 0;
  #seekCleanup;
  #acquisitionState = { phase: "idle" };
  #translationError = false;
  #ccBlocked = false;
  #boundPlayer = null;
  #boundCc = null;
  #lastCc = null;
  #observedVideoId = null;
  #observedCacheMode = null;
  #watchTimer;
  #snapshotPending = false;
  #disposed = false;
  #domObserver;
  #checkScheduled = false;
  #cleanups = [];
  #adObserver;
  #acquisitionVersion = 0;
  #ccIntentAt = 0;
  #ccIntentCleanup;
  #navigating = false;
  #waitingForContent = false;
  // 每次进入新视频时恢复的持久化自动翻译偏好
  #defaultAutoTranslate = true;
  // 当前页面是否由字幕快捷菜单显式覆盖了翻译服务
  #hasRuntimeApiOverride = false;

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
  #asrPanelClosed = false;
  #asrTabSuggested = false;

  /**
   * 创建 YouTube 字幕处理器实例，并初始化用户配置、国际化和播放器 UI 管理器。
   *
   * @param {object} [setting={}] 字幕模块运行配置。
   */
  constructor(setting = {}) {
    this.#defaultAutoTranslate = setting.autoTranslate ?? true;
    this.#setting = {
      ...setting,
      autoTranslate: this.#defaultAutoTranslate,
      onSubtitlePositionChange: (positionRatio) => {
        this.#setting.positionRatio = positionRatio;
        setting.onSubtitlePositionChange?.(positionRatio);
      },
    };
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
    return youtubeVideoId();
  }

  /**
   * 当前页面中 YouTube 原生 video 播放器节点。
   *
   * @returns {HTMLVideoElement|null} 匹配到的播放器 DOM 节点。
   */
  get #videoEl() {
    return activeYoutubePlayer()?.querySelector("video") || null;
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
    if (
      youtubeAsrSupported &&
      this.#setting.asrApiSlug &&
      this.#setting.asrApiSlug !== "-"
    )
      this.#asr = new YoutubeAsrController({
        getSetting: () => this.#setting,
        getVideo: () => ({
          videoId: this.#videoId,
          element: this.#videoEl,
          cacheMode: window.location.pathname.startsWith("/shorts/")
            ? "session"
            : "persistent",
        }),
        onTasks: (update) => this.#subtitleListManager?.updateAsrTasks(update),
        onState: (state) => {
          const previousTarget = this.#asrState.translationLanguage;
          this.#asrState = state;
          if (
            state.translationLanguage &&
            state.translationLanguage !== previousTarget
          )
            this.#managerInstance?.updateSetting?.({
              toLang: state.translationLanguage,
            });
          this.#playerUi.updateAsrFeedback(state, this.#i18n);
          this.#playerUi.updateMenuProps();
          this.#subtitleListManager?.updateAsrState({
            ...state,
            active: !!this.#asr?.active,
            available: !!this.#asr?.service(),
          });
        },
        onSubtitles: (cues, state) => {
          if (!this.#asr?.active || this.#disposed) return;
          this.#subtitles.splice(0, this.#subtitles.length, ...cues);
          this.#progressed = Math.floor(state.recognition?.percent || 0);
          if (!cues.length) {
            this.#destroyManager();
            this.#playerUi.hideYtCaption();
            this.#subtitleListManager?.setBilingualSubtitles(
              [],
              this.#progressed
            );
            return;
          }
          this.#fromLang = getFromLang(
            this.#asrState.effectiveLanguage ||
              this.#asrState.sourceLanguage ||
              "auto"
          );
          this.#startManager();
          this.#managerInstance?.appendSubtitles(cues);
          this.#subtitleListManager?.setBilingualSubtitles(
            this.#subtitles,
            this.#progressed
          );
        },
      });
    this.#bridge = new YouTubeCaptionBridgeClient((capture) => {
      if (
        this.#disposed ||
        this.#navigating ||
        !this.#setting.autoTranslate ||
        this.#ccBlocked ||
        capture.videoId !== this.#videoId ||
        this.#acquisitionState.phase !== "error" ||
        this.#acquirer.inFlight ||
        this.#acquisitionState.cooldownUntil > Date.now()
      )
        return;
      const url = captionUrl(capture.url, this.#videoId);
      if (!url || url.searchParams.has("tlang")) return;
      try {
        // Only a new usable source body can recover a finished attempt.
        // URL-only Resource Timing notifications must not start request loops.
        parseTimedText(capture.response);
      } catch {
        return;
      }
      void this.#acquire();
    });
    this.#acquirer = new YouTubeCaptionAcquirer(this.#bridge, (patch) => {
      this.#acquisitionState = { ...this.#acquisitionState, ...patch };
      this.#captionCooldownUntil = Math.max(
        this.#captionCooldownUntil,
        patch.cooldownUntil || 0
      );
      this.#playerUi.updateCaptionFeedback(this.#acquisitionState, this.#i18n);
      this.#subtitleListManager?.updateCaptionState?.(this.#acquisitionState);
      this.#playerUi.updateMenuProps();
    });
    const check = () => this.#checkPlayer();
    const resume = () => {
      this.#navigating = false;
      check();
    };
    const leave = () => {
      this.#navigating = true;
      this.#resetVideo();
    };
    const captionShortcut = (event) => {
      if (
        event.key?.toLowerCase() === "c" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.target?.closest?.("input, textarea, [contenteditable=true]")
      )
        this.#ccIntentAt = Date.now();
    };
    const pagehide = (event) => {
      if (!event.persisted) this.destroy();
      else leave();
    };
    for (const [name, handler] of [
      ["yt-navigate-start", leave],
      ["yt-navigate-finish", resume],
      ["popstate", resume],
      ["pagehide", pagehide],
      ["pageshow", resume],
      ["keydown", captionShortcut],
    ]) {
      window.addEventListener(name, handler);
      this.#cleanups.push(() => window.removeEventListener(name, handler));
    }
    this.#domObserver = new MutationObserver(() => {
      if (this.#checkScheduled) return;
      this.#checkScheduled = true;
      queueMicrotask(() => {
        this.#checkScheduled = false;
        if (!this.#disposed) check();
      });
    });
    this.#domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["is-active", "active"],
    });
    this.#watchTimer = setInterval(check, 1000);
    check();
  }

  #resetVideo({ clearBridge = true } = {}) {
    this.#persistCaptionCache(true);
    clearTimeout(this.#captionCacheTimer);
    this.#captionCacheTimer = null;
    this.#captionFinalCues.clear();
    this.#captionContextPromise = null;
    this.#captionCacheContext = null;
    this.#captionCacheGeneration = null;
    this.#nativeCaptionSnapshot = null;
    void this.#asr?.stop();
    this.#asrDisabled = false;
    this.#asrWanted = false;
    this.#asrPanelClosed = false;
    this.#asrTabSuggested = false;
    this.#captionCooldownUntil = 0;
    this.#seekCleanup?.();
    this.#acquisitionVersion++;
    this.#acquirer?.cancel();
    this.#subtitleAbortController?.abort();
    this.#processingVersion++;
    this.#destroyManager({ destroyList: true });
    this.#playerUi.removeToggleButton();
    this.#ytSubtitleStateObserver?.disconnect();
    this.#ccIntentCleanup?.();
    this.#adObserver?.disconnect();
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
    this.#activeTrackKey = null;
    this.#aiChunkScheduler = null;
    this.#boundPlayer = null;
    this.#boundCc = null;
    this.#lastCc = null;
    this.#observedVideoId = null;
    this.#ccBlocked = false;
    this.#waitingForContent = false;
    this.#translationError = false;
    this.#acquisitionState = { phase: "idle" };
    this.#setting.autoTranslate = this.#defaultAutoTranslate;
    if (clearBridge) this.#bridge?.clear();
  }

  #checkPlayer() {
    if (this.#disposed || this.#navigating) return;
    const videoId = this.#videoId;
    const player = activeYoutubePlayer();
    const cacheMode = window.location.pathname.startsWith("/shorts/")
      ? "session"
      : "persistent";
    if (
      videoId !== this.#observedVideoId ||
      cacheMode !== this.#observedCacheMode
    ) {
      this.#resetVideo({ clearBridge: this.#observedVideoId !== null });
      this.#observedVideoId = videoId;
      this.#observedCacheMode = cacheMode;
    }
    if (!videoId || !player) return;
    if (player !== this.#boundPlayer) {
      this.#seekCleanup?.();
      this.#acquirer.cancel();
      this.#acquisitionVersion++;
      this.#subtitleAbortController?.abort();
      this.#processingVersion++;
      this.#destroyManager();
      this.#subtitleListManager?.destroy();
      this.#subtitleListManager = null;
      this.#asrPanelClosed = false;
      this.#playerUi.removeToggleButton();
      this.#adObserver?.disconnect();
      this.#boundPlayer = player;
      const video = this.#videoEl;
      const seeking = () => this.#asr?.beginSeek();
      const seeked = () => this.#asr?.seek();
      video?.addEventListener("seeking", seeking);
      video?.addEventListener("seeked", seeked);
      this.#seekCleanup = () => {
        video?.removeEventListener("seeking", seeking);
        video?.removeEventListener("seeked", seeked);
      };
      this.#boundCc = null;
      this.#lastCc = null;
      this.#acquisitionState = { phase: "idle" };
      const ads = player.querySelector(YT_AD_SELECTOR);
      if (ads) this.#moAds(ads);
    }
    const controls =
      player.querySelector(CONTROLS_SELECTOR) ||
      (window.location.pathname.startsWith("/shorts/") ? player : null);
    this.#playerUi.injectToggleButton(controls);
    const cc = player.querySelector(YT_SUBTITLE_BUTTON_SELECTOR);
    if (cc !== this.#boundCc) {
      this.#boundCc = cc;
      this.#lastCc = cc?.getAttribute("aria-pressed") === "true";
      if (cc) this.#observeYtSubtitleState(cc);
    }
    if (youtubeAsrSupported && this.#setting.autoTranslate && !this.#ccBlocked)
      this.#ensureSubtitleList();
    if (this.#asr?.active) {
      void this.#asr.tick();
      this.#startManager();
      return;
    }
    if (
      this.#setting.autoTranslate &&
      !this.#ccBlocked &&
      this.#acquisitionState.phase === "idle"
    )
      void this.#acquire();
    if (
      !this.#setting.autoTranslate ||
      this.#ccBlocked ||
      this.#snapshotPending
    )
      return;
    this.#snapshotPending = true;
    const epoch = this.#acquisitionVersion;
    this.#bridge
      .request("snapshot", videoId, { lightweight: true })
      .then((snapshot) => {
        if (
          this.#disposed ||
          epoch !== this.#acquisitionVersion ||
          snapshot.videoId !== this.#videoId
        )
          return;
        if (snapshot.isAd) {
          this.#waitingForContent = true;
          return;
        }
        if (this.#waitingForContent) {
          this.#waitingForContent = false;
          if (
            ["error", "loading", "waiting", "waiting_playback"].includes(
              this.#acquisitionState.phase
            )
          ) {
            // Give content its own budget even when the ad ends near the deadline.
            this.#acquirer.cancel();
            void this.#acquire();
          }
        }
        const track = selectCaptionTrack(snapshot);
        const expected =
          this.#activeTrackKey ||
          (this.#acquisitionState.track &&
            captionTrackId(this.#acquisitionState.track));
        if (track && expected && captionTrackId(track) !== expected) {
          this.#acquirer.cancel();
          this.#acquisitionVersion++;
          this.#subtitleAbortController?.abort();
          this.#processingVersion++;
          this.#destroyManager();
          this.#subtitles = [];
          this.#flatEvents = [];
          this.#events = [];
          this.#activeTrackKey = null;
          this.#rawSubtitleEvents = [];
          this.#translationError = false;
          this.#progressed = 0;
          void this.#acquire();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.#snapshotPending = false;
      });
  }

  #suggestAsrTab() {
    if (!youtubeAsrSupported || this.#asrTabSuggested || this.#asrDisabled)
      return;
    this.#ensureSubtitleList(true);
    if (!this.#subtitleListManager) return;
    this.#asrTabSuggested = true;
    this.#subtitleListManager.selectAsrTab();
  }

  #startAsr() {
    if (!this.#asr || !this.#setting.autoTranslate) return;
    if (this.#asr.active) return;
    if (this.#subtitles.length && this.#flatEvents.length) {
      this.#nativeCaptionSnapshot = {
        videoId: this.#videoId,
        subtitles: this.#subtitles.map((cue) =>
          cue.isTranslating ? { ...cue, isTranslating: false } : { ...cue }
        ),
        events: this.#events,
        rawEvents: this.#rawSubtitleEvents,
        flatEvents: this.#flatEvents,
        fromLang: this.#fromLang,
        progressed: this.#progressed,
        trackKey: this.#activeTrackKey,
        acquisition: this.#acquisitionState,
        translationError: this.#translationError,
      };
    }
    this.#asrWanted = true;
    this.#playerUi.resetTaskFeedback();
    this.#acquisitionVersion++;
    this.#acquirer?.cancel();
    this.#processingVersion++;
    this.#subtitleAbortController?.abort();
    this.#aiChunkScheduler = null;
    this.#processingId = null;
    this.#activeTrackKey = null;
    this.#ccBlocked = false;
    this.#destroyManager();
    this.#subtitles = [];
    this.#events = [];
    this.#flatEvents = [];
    this.#rawSubtitleEvents = [];
    this.#acquisitionState = { phase: "off" };
    this.#asrPanelClosed = false;
    if (this.#subtitleListManager && !this.#subtitleListManager.asrActions) {
      this.#subtitleListManager.destroy();
      this.#subtitleListManager = null;
    }
    this.#progressed = 0;
    this.#ensureSubtitleList(true);
    this.#subtitleListManager?.setBilingualSubtitles([], 0);
    this.#playerUi.hideYtCaption();
    this.#subtitleListManager?.selectAsrTab();
    this.#asr.start();
  }

  #restoreNativeCaptions() {
    const snapshot = this.#nativeCaptionSnapshot;
    if (!snapshot || snapshot.videoId !== this.#videoId) return false;
    this.#subtitles = snapshot.subtitles.map((cue) => ({ ...cue }));
    this.#events = snapshot.events;
    this.#rawSubtitleEvents = snapshot.rawEvents;
    this.#flatEvents = snapshot.flatEvents;
    this.#fromLang = snapshot.fromLang;
    this.#progressed = snapshot.progressed;
    this.#activeTrackKey = snapshot.trackKey;
    this.#acquisitionState = snapshot.acquisition;
    this.#translationError = snapshot.translationError;
    this.#processingId = null;
    const processingVersion = (this.#processingVersion += 1);
    this.#subtitleAbortController?.abort();
    this.#subtitleAbortController = new AbortController();
    this.#captionContextPromise = null;
    this.#startManager();
    this.#subtitleListManager?.setBilingualSubtitles(
      this.#subtitles,
      this.#progressed
    );
    this.#subtitleListManager?.updateRawSubtitleEvents?.(
      this.#rawSubtitleEvents
    );
    this.#playerUi.updateCaptionFeedback(this.#acquisitionState, this.#i18n);
    this.#subtitleListManager?.updateCaptionState?.(this.#acquisitionState);
    this.#playerUi.updateMenuProps();
    if (snapshot.progressed < 100) {
      void this.#processEvents({
        videoId: snapshot.videoId,
        flatEvents: this.#flatEvents,
        fromLang: this.#fromLang,
        processingVersion,
        signal: this.#subtitleAbortController.signal,
      });
    }
    return true;
  }

  #asrActions() {
    return {
      start: () => {
        this.#asrDisabled = false;
        this.#startAsr();
      },
      stop: () => {
        this.#asrDisabled = true;
        this.#asrWanted = false;
        void this.#asr.stop();
        this.#destroyManager();
        this.#subtitles = [];
        this.#progressed = 0;
        if (!this.#restoreNativeCaptions()) {
          this.#processingId = null;
          this.#activeTrackKey = null;
          this.#subtitleListManager?.setBilingualSubtitles([], 0);
          this.#acquisitionState = { phase: "idle" };
          void this.#acquire();
        }
      },
      retryIncomplete: () => this.#asr.retryIncomplete(),
      retryRecognition: (taskId) => this.#asr.retryRecognition(taskId),
      setLanguage: (language) => this.#asr.setLanguage(language),
      setTranslationLanguage: (language) =>
        this.#asr.setTranslationLanguage(language),
      pause: () => this.#asr.pause(),
      resume: () => this.#asr.resume(),
      retryTranslation: (taskId) => this.#asr.retryTranslation(taskId),
      retrySave: () => {
        void this.#asr.session?.retrySave().catch(() => {});
      },
      reRecognize: () => this.#asr.deleteCache(true),
      deleteCache: () => {
        this.#asrDisabled = true;
        this.#asrWanted = false;
        this.#destroyManager();
        this.#subtitles = [];
        this.#progressed = 0;
        this.#subtitleListManager?.setBilingualSubtitles([], 0);
        return this.#asr.deleteCache();
      },
      deleteAudio: () => {
        this.#asrDisabled = true;
        this.#asrWanted = false;
        return this.#asr.deleteAudio();
      },
      exportSegment: (segment) => this.#asr.exportSegment(segment),
      prepareSegmentAudio: (segment) => this.#asr.prepareSegmentAudio(segment),
      setPlaybackError: (segment, code) =>
        this.#asr.setPlaybackError(segment, code),
      getVideo: () => this.#videoEl,
      exportSentence: (cue) => this.#asr.exportSentence(cue),
      exportFull: () => this.#asr.exportFull(),
      cancelExport: () => this.#asr.session?.cancelFullExport(),
    };
  }

  async #acquire({ enableCc = false, refresh = false } = {}) {
    if (!this.#videoId || !this.#setting.autoTranslate || this.#disposed)
      return;
    if (this.#acquirer.inFlight) return;
    if (this.#captionCooldownUntil > Date.now()) {
      this.#acquisitionState = {
        phase: "cooldown",
        cooldownUntil: this.#captionCooldownUntil,
      };
      this.#playerUi.updateCaptionFeedback(this.#acquisitionState, this.#i18n);
      this.#subtitleListManager?.updateCaptionState?.(this.#acquisitionState);
      return;
    }
    this.#playerUi.resetTaskFeedback();
    this.#ccBlocked = false;
    if (enableCc) {
      this.#boundPlayer?.querySelector(YT_SUBTITLE_BUTTON_SELECTOR)?.click();
    }
    const version = ++this.#acquisitionVersion;
    const videoId = this.#videoId;
    this.#acquisitionState = { phase: "loading" };
    try {
      let snapshot, cacheEntry;
      if (
        !window.location.pathname.startsWith("/shorts/") &&
        (this.#setting.captionCacheLimit ?? 100) > 0
      ) {
        const cached = await captionCacheRequest("lookup", { videoId }).catch(
          () => null
        );
        if (
          this.#disposed ||
          version !== this.#acquisitionVersion ||
          videoId !== this.#videoId ||
          !this.#setting.autoTranslate ||
          this.#ccBlocked
        )
          return;
        this.#captionCacheGeneration = cached?.generation ?? null;
        if (!refresh) cacheEntry = cached?.entry;
        if (!refresh && cached?.entry) {
          snapshot = await this.#bridge
            .request("snapshot", videoId, { lightweight: true })
            .catch(() => null);
          if (
            this.#disposed ||
            version !== this.#acquisitionVersion ||
            videoId !== this.#videoId ||
            !this.#setting.autoTranslate ||
            this.#ccBlocked
          )
            return;
          const track = snapshot && selectCaptionTrack(snapshot);
          if (
            snapshot?.ready &&
            !snapshot.isAd &&
            track &&
            captionTrackId(track) === cached.entry.trackKey
          ) {
            this.#acquisitionState = { phase: "ready", track, source: "cache" };
            this.#playerUi.updateCaptionFeedback(
              this.#acquisitionState,
              this.#i18n
            );
            this.#subtitleListManager?.updateCaptionState?.(
              this.#acquisitionState
            );
            await this.#handleAcquiredCaption(
              { ...cached.entry, track, videoId },
              cached.entry.bilingual
            );
            return;
          }
        }
      }
      const result = await this.#acquirer.acquire(this.#videoId, cacheEntry);
      if (
        this.#disposed ||
        version !== this.#acquisitionVersion ||
        result.videoId !== this.#videoId ||
        !this.#setting.autoTranslate ||
        this.#ccBlocked
      )
        return;
      this.#acquisitionState = {
        phase: "ready",
        track: result.track,
        source: result.source,
      };
      this.#playerUi.updateCaptionFeedback(this.#acquisitionState, this.#i18n);
      this.#subtitleListManager?.updateCaptionState?.(this.#acquisitionState);
      this.#playerUi.updateMenuProps();
      await this.#handleAcquiredCaption(
        result,
        result.source === "cache" ? result.bilingual : undefined
      );
    } catch (error) {
      if (version !== this.#acquisitionVersion || error.name === "AbortError")
        return;
      if (
        error.code === "NO_SUBTITLES" &&
        youtubeAsrSupported &&
        !this.#asrDisabled
      ) {
        this.#suggestAsrTab();
      }
      this.#acquisitionState = {
        ...this.#acquisitionState,
        phase: error.code === "NO_SUBTITLES" ? "empty" : "error",
        code: error.code || "NETWORK",
        cooldownUntil:
          error.cooldownUntil || this.#acquisitionState.cooldownUntil || 0,
      };
      this.#playerUi.updateMenuProps();
      this.#captionCooldownUntil = Math.max(
        this.#captionCooldownUntil,
        this.#acquisitionState.cooldownUntil || 0
      );
      this.#playerUi.updateCaptionFeedback(this.#acquisitionState, this.#i18n);
      this.#subtitleListManager?.updateCaptionState?.(this.#acquisitionState);
    }
  }

  destroy() {
    if (this.#disposed) return;
    this.#persistCaptionCache(true);
    this.#disposed = true;
    this.#resetVideo();
    clearInterval(this.#watchTimer);
    this.#domObserver?.disconnect();
    this.#cleanups.splice(0).forEach((cleanup) => cleanup());
    this.#bridge?.dispose();
    void this.#asr?.dispose();
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
    this.#ccIntentCleanup?.();
    const intent = () => {
      this.#ccIntentAt = Date.now();
    };
    ytSubtitleBtn.addEventListener("pointerdown", intent);
    ytSubtitleBtn.addEventListener("keydown", intent);
    this.#ccIntentCleanup = () => {
      ytSubtitleBtn.removeEventListener("pointerdown", intent);
      ytSubtitleBtn.removeEventListener("keydown", intent);
    };
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
    if (this.#asr?.active) {
      this.#lastCc = ytSubtitleBtn.getAttribute("aria-pressed") === "true";
      return;
    }
    const on = ytSubtitleBtn.getAttribute("aria-pressed") === "true";
    const wasOn = this.#lastCc;
    this.#lastCc = on;
    if (on) {
      if (this.#ccBlocked || wasOn === false) {
        this.#ccBlocked = false;
        this.#acquisitionState = { phase: "idle" };
        void this.#acquire();
      } else this.#startManager();
    } else if (
      wasOn === true &&
      this.#ccIntentAt &&
      Date.now() - this.#ccIntentAt < 1500
    ) {
      this.#ccBlocked = true;
      this.#playerUi.resetTaskFeedback();
      this.#acquisitionVersion++;
      this.#acquirer?.cancel();
      this.#bridge?.clear();
      this.#processingVersion++;
      this.#subtitleAbortController?.abort();
      this.#aiChunkScheduler = null;
      this.#destroyManager();
      this.#acquisitionState = {
        ...this.#acquisitionState,
        phase: "cc_off",
        code: null,
        cooldownUntil: this.#captionCooldownUntil,
      };
    }
    this.#ccIntentAt = 0;
    this.#playerUi.updateMenuProps();
  }

  /**
   * 检测当前 YouTube 视频上原生字幕按钮是否处于开启状态。
   *
   * @private
   * @returns {boolean} 开启返回 true，未开启或找不到按钮返回 false。
   */
  #isYtSubtitleEnabled() {
    const ytSubtitleBtn = this.#boundPlayer?.querySelector(
      YT_SUBTITLE_BUTTON_SELECTOR
    );
    return (
      !this.#ccBlocked &&
      (!ytSubtitleBtn ||
        ytSubtitleBtn.getAttribute("aria-pressed") === "true" ||
        this.#acquisitionState.phase === "ready")
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
            logger
              .child("subtitle")
              .debug("Youtube Provider: AD start playing!", node);
            if (videoEl && skipAd) {
              // REVIEW: 沿用原有直接 16 倍速并跳到广告末尾的行为，可能触发 YouTube 风控。
              // REVIEW: 广告结束时仍会重置到 1 倍速，可能覆盖用户自定义倍速；后续应单独修复。
              videoEl.playbackRate = 16;
              videoEl.currentTime = videoEl.duration;
            }
            this.#managerInstance?.setIsAdPlaying(true);
          } else if (node.matches(skipBtnSelector) && skipAd) {
            logger
              .child("subtitle")
              .debug("Youtube Provider: AD skip button!", node);
            node.click();
          }

          if (skipAd) {
            const skipBtn = node?.querySelector(skipBtnSelector);
            if (skipBtn) {
              logger
                .child("subtitle")
                .debug("Youtube Provider: AD skip button!!", skipBtn);
              skipBtn.click();
            }
          }
        });

        mutation.removedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          if (node.matches(adLayoutSelector)) {
            logger.child("subtitle").debug("Youtube Provider: Ad ends!");
            if (this.#setting.autoTranslate) {
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

    this.#adObserver?.disconnect();
    this.#adObserver = observer;
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
    if (
      [
        "apiSlug",
        "toLang",
        "segSlug",
        "forceSubtitleRetranslate",
        "aiContextSlug",
      ].includes(name)
    )
      this.#nativeCaptionSnapshot = null;

    if (name === "apiSlug") {
      const apiSetting = this.#setting.transApis?.find(
        (api) => api.apiSlug === value && !api.isDisabled
      );
      if (!apiSetting) return;

      const previousApiSlug = this.#setting.apiSlug;
      logger
        .child("subtitle")
        .debug("Youtube Provider: update setting", name, value);
      this.#setting.apiSlug = value;
      this.#setting.apiSetting = apiSetting;
      this.#hasRuntimeApiOverride = true;
      this.#playerUi.updateMenuProps();

      if (this.#asr?.active) {
        void this.#asr.restart();
        return;
      }

      this.#reProcessEvents({ previousApiSlug });
      return;
    }

    logger
      .child("subtitle")
      .debug("Youtube Provider: update setting", name, value);
    this.#setting[name] = value;

    this.#playerUi.updateMenuProps();

    if (
      this.#asr?.active &&
      ["segSlug", "forceSubtitleRetranslate", "aiContextSlug"].includes(name)
    ) {
      void this.#asr.restart();
      return;
    }

    if (
      name === "isBilingual" ||
      name === "blurTranslation" ||
      name === "displayOrder"
    ) {
      this.#managerInstance?.updateSetting({ [name]: value });
    } else if (name === "segSlug" || name === "forceSubtitleRetranslate") {
      this.#reProcessEvents();
    } else if (name === "autoTranslate") {
      this.#toggleTranslation();
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
   * 根据当前视频翻译开关启动或停止字幕翻译。
   *
   * @private
   * @returns {void}
   */
  #toggleTranslation() {
    if (!this.#setting.autoTranslate) {
      this.#asrWanted = this.#asrWanted || !!this.#asr?.active;
      void this.#asr?.stop();
      this.#playerUi.resetTaskFeedback();
      this.#acquisitionVersion++;
      this.#acquirer?.cancel();
      this.#bridge?.clear();
      this.#acquisitionState = { ...this.#acquisitionState, phase: "off" };
      if (this.#flatEvents.length) {
        this.#processingVersion += 1;
        this.#subtitleAbortController?.abort();
        this.#subtitleAbortController = null;
        this.#aiChunkScheduler = null;
        this.#processingId = null;
        this.#subtitles = [];
        this.#progressed = 0;
        clearMsgHistory(this.#setting.apiSlug);
      }
      this.#destroyManager();
    } else {
      this.#ccBlocked = false;
      this.#acquisitionState = {
        phase: "idle",
        cooldownUntil: this.#captionCooldownUntil,
      };
      this.#processingId = null;
      if (this.#asrWanted && !this.#asrDisabled) this.#startAsr();
      else void this.#acquire();
    }
    this.#playerUi.updateMenuProps();
  }

  /**
   * 使用已经获取并标准化的字幕缓存启动翻译流程。
   *
   * @private
   * @returns {Promise<void>}
   */
  async #translateCachedEvents() {
    const videoId = this.#videoId;
    if (!this.#setting.autoTranslate || !videoId || !this.#flatEvents.length) {
      return;
    }

    const processingVersion = (this.#processingVersion += 1);
    this.#subtitleAbortController?.abort();
    this.#subtitleAbortController = new AbortController();
    this.#aiChunkScheduler = null;
    this.#subtitles = [];
    this.#progressed = 0;
    this.#destroyManager();
    clearMsgHistory(this.#setting.apiSlug);
    this.#docInfo = getDocInfo();

    await this.#enrichDocInfoWithAI(this.#flatEvents, processingVersion);
    if (this.#isStaleProcessing(processingVersion)) return;

    this.#processEvents({
      videoId,
      flatEvents: this.#flatEvents,
      fromLang: this.#fromLang,
      processingVersion,
      signal: this.#subtitleAbortController.signal,
    });
  }

  /**
   * 将当前翻译组装完毕的双语字幕打包为 VTT 格式文件，并唤起浏览器下载。
   *
   * @public
   * @returns {void}
   */
  downloadSubtitle() {
    if (!this.#subtitles.length) {
      logger
        .child("subtitle")
        .debug("Youtube Provider: The subtitle is not yet ready.");
      return;
    }

    try {
      const vtt = buildBilingualVtt(this.#subtitles);
      downloadBlobFile(
        vtt,
        `kiss-subtitles-${this.#videoId}_${Date.now()}.vtt`
      );
    } catch (error) {
      logger
        .child("subtitle")
        .info("Youtube Provider: download subtitles:", error);
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
      apiSlug,
      segSlug,
      skipAd,
      isBilingual,
      blurTranslation,
      autoTranslate,
      aiContextSlug,
    } = this.#setting;
    return {
      i18n: this.#i18n,
      asr: youtubeAsrSupported
        ? {
            ...this.#asrState,
            available: !!this.#asr?.service(),
            active: !!this.#asr?.active,
          }
        : null,
      asrActions: youtubeAsrSupported && this.#asr ? this.#asrActions() : null,
      updateSetting: this.updateSetting.bind(this),
      downloadSubtitle: this.downloadSubtitle.bind(this),
      acquisition: this.#setting.autoTranslate
        ? { ...this.#acquisitionState }
        : { phase: "off" },
      translationError: this.#translationError,
      retryAcquisition: () =>
        this.#acquire({ enableCc: this.#ccBlocked, refresh: true }),
      retryTranslation: () => {
        this.#translationError = false;
        if (this.#managerInstance && this.#subtitles.length)
          this.#managerInstance.retryFailedTranslations?.();
        else this.#reProcessEvents();
        this.#playerUi.updateMenuProps();
      },
      canDownload: this.#subtitles.length > 0,
      transApis,
      progressed: this.#progressedNum,
      formData: {
        apiSlug,
        segSlug,
        skipAd,
        isBilingual,
        blurTranslation,
        autoTranslate,
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
  async #handleAcquiredCaption(
    { videoId, track, events, fullDescription },
    cachedBilingual
  ) {
    if (videoId !== this.#videoId) return;
    const trackKey = captionTrackId(track);
    const fromLang = getFromLang(track.languageCode);
    if (
      this.#flatEvents.length &&
      trackKey === this.#activeTrackKey &&
      this.#managerInstance
    ) {
      logger
        .child("subtitle")
        .debug("Youtube Provider: track was processed:", trackKey);
      return;
    }

    if (this.#processingId === trackKey) {
      logger
        .child("subtitle")
        .debug("Youtube Provider: track is processing:", trackKey);
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
      const { toLang } = this.#setting;
      this.#fullDescription = fullDescription || "";
      this.#rawSubtitleEvents = events;
      this.#subtitleListManager?.updateRawSubtitleEvents?.(events);

      logger
        .child("subtitle")
        .debug(
          "Youtube Provider: subtitle language:",
          fromLang,
          "target:",
          toLang
        );
      if (
        isSameLang(fromLang, toLang, this.#setting.translateVariants ?? true)
      ) {
        logger
          .child("subtitle")
          .debug("Youtube Provider: skip same lang", fromLang, toLang);
        this.#playerUi.showNotification(this.#i18n("subtitle_same_lang"));
        return;
      }

      const { events: subtitleEvents, flatEvents } = prepareTimedTextEvents(
        events,
        fromLang
      );
      if (!flatEvents?.length) {
        logger
          .child("subtitle")
          .debug("Youtube Provider: flatEvents not got:", videoId);
        return;
      }
      if (this.#isStaleProcessing(processingVersion)) return;

      this.#events = subtitleEvents;
      this.#flatEvents = flatEvents;
      this.#fromLang = fromLang;
      this.#activeTrackKey = trackKey;
      this.#docInfo = getDocInfo();
      if (!this.#setting.autoTranslate) {
        this.#playerUi.updateMenuProps();
        return;
      }
      const [segmentationSignature, translationSignature] = await Promise.all([
        captionSegmentationSignature(this.#setting),
        captionTranslationSignature(this.#setting),
      ]).catch(() => [null, null]);
      if (this.#isStaleProcessing(processingVersion)) return;
      this.#captionFinalCues.clear();
      this.#captionContextPromise = null;
      this.#captionCacheContext = {
        videoId,
        track,
        events,
        fullDescription,
        segmentationSignature,
        translationSignature,
        complete: false,
        generation: this.#captionCacheGeneration,
      };
      if (
        segmentationSignature &&
        cachedBilingual?.segmentationSignature === segmentationSignature
      ) {
        const sameTranslation =
          cachedBilingual.translationSignature === translationSignature;
        for (const cue of cachedBilingual.cues || []) {
          const restored = {
            ...cue,
            translation: sameTranslation ? cue.translation : "",
          };
          this.#captionFinalCues.set(captionCueKey(cue), restored);
        }
        this.#captionCacheContext.complete = cachedBilingual.complete === true;
        this.#appendProcessedSubtitles(
          [...this.#captionFinalCues.values()],
          cachedBilingual.complete ? 100 : 0
        );
        if (cachedBilingual.complete) {
          this.#persistCaptionCache();
          return;
        }
      }
      this.#persistCaptionCache(true);
      await this.#ensureCaptionContext(processingVersion);
      if (this.#isStaleProcessing(processingVersion)) return;

      await this.#processEvents({
        videoId,
        flatEvents,
        fromLang,
        processingVersion,
        signal: this.#subtitleAbortController.signal,
      });
    } catch (error) {
      this.#translationError = true;
      this.#playerUi.updateMenuProps();
      logger
        .child("subtitle")
        .warn("Youtube Provider: subtitle processing failed");
      this.#playerUi.notifyOnce(
        "translation-error",
        this.#i18n("subtitle_load_failed"),
        true
      );
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
   * @param {AbortSignal} param0.signal 当前字幕处理生命周期的取消信号。
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
      if (this.#captionCacheContext) {
        const [segmentationSignature, translationSignature] = await Promise.all(
          [
            captionSegmentationSignature(this.#setting),
            captionTranslationSignature(this.#setting),
          ]
        ).catch(() => [null, null]);
        if (this.#isStaleProcessing(processingVersion)) return;
        const context = this.#captionCacheContext;
        if (context.segmentationSignature !== segmentationSignature) {
          this.#captionFinalCues.clear();
          context.complete = false;
        } else if (context.translationSignature !== translationSignature) {
          for (const cue of this.#captionFinalCues.values())
            cue.translation = "";
        }
        this.#captionCacheContext = {
          ...context,
          segmentationSignature,
          translationSignature,
        };
        if (context.complete) {
          this.#appendProcessedSubtitles(
            [...this.#captionFinalCues.values()],
            100
          );
          this.#persistCaptionCache();
          return;
        }
      }
      const processingSetting = this.#hasRuntimeApiOverride
        ? { ...this.#setting, forceSubtitleRetranslate: true }
        : this.#setting;
      const [subtitles, progressed, aiChunkScheduler] = await eventsToSubtitles(
        {
          videoId,
          events: this.#events,
          flatEvents,
          fromLang,
          setting: processingSetting,
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
            if (!this.#isStaleProcessing(processingVersion))
              this.#appendProcessedSubtitles(subtitles, progressed);
          },
          onChunkComplete: (chunk) => {
            if (!this.#isStaleProcessing(processingVersion))
              this.#recordCaptionChunk(chunk);
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
        logger
          .child("subtitle")
          .debug("Youtube Provider: events to subtitles got empty", videoId);
        return;
      }

      if (videoId !== this.#videoId) {
        logger
          .child("subtitle")
          .debug("Youtube Provider: videoId changed!", videoId, this.#videoId);
        return;
      }

      this.#appendProcessedSubtitles(subtitles, progressed);
      if (!aiChunkScheduler)
        this.#recordCaptionChunk({
          subtitles,
          progressed,
          start: 0,
          end: Infinity,
        });
    } catch (error) {
      if (error?.name === "AbortError") return;
      this.#translationError = true;
      this.#playerUi.updateMenuProps();
      logger
        .child("subtitle")
        .warn("Youtube Provider: subtitle processing failed");
      this.#playerUi.notifyOnce(
        "translation-error",
        this.#i18n("subtitle_load_failed"),
        true
      );
    }
  }

  #ensureCaptionContext(processingVersion) {
    if (this.#docInfo.summary) return Promise.resolve();
    if (!this.#captionContextPromise) {
      this.#captionContextPromise = this.#enrichDocInfoWithAI(
        this.#flatEvents,
        processingVersion
      );
    }
    return this.#captionContextPromise;
  }

  // Only finalized source chunks and successful translations enter this map.
  #recordCaptionChunk({ subtitles, progressed, start, end }) {
    if (!this.#captionCacheContext) return;
    const previous = new Map(this.#captionFinalCues);
    const rendered = new Map(
      this.#subtitles.map((cue) => [captionCueKey(cue), cue])
    );
    for (const [key, cue] of this.#captionFinalCues) {
      if (cue.start < end && cue.end > start)
        this.#captionFinalCues.delete(key);
    }
    for (const cue of subtitles || []) {
      const key = captionCueKey(cue);
      const current = rendered.get(key);
      const translation =
        previous.get(key)?.translation ||
        current?._finalTranslation ||
        (!cue._isDraftTranslation ? cue.translation : "") ||
        "";
      this.#captionFinalCues.set(key, {
        start: cue.start,
        end: cue.end,
        text: cue.text,
        translation,
      });
    }
    // Remove superseded structure, retaining identical cues with in-flight translations.
    const finalKeys = new Set((subtitles || []).map(captionCueKey));
    for (let i = this.#subtitles.length - 1; i >= 0; i--) {
      if (
        this.#subtitles[i].start < end &&
        this.#subtitles[i].end > start &&
        !finalKeys.has(captionCueKey(this.#subtitles[i]))
      )
        this.#subtitles.splice(i, 1);
    }
    this.#captionCacheContext.complete = progressed === 100;
    this.#appendProcessedSubtitles(
      (subtitles || []).map((cue) => ({
        ...cue,
        translation:
          this.#captionFinalCues.get(captionCueKey(cue))?.translation ||
          cue.translation ||
          "",
      })),
      progressed
    );
    this.#persistCaptionCache();
  }

  #persistCaptionCache(immediate = false) {
    if (window.location.pathname.startsWith("/shorts/")) return;
    const context = this.#captionCacheContext;
    if (
      !context ||
      context.videoId !== this.#videoId ||
      context.generation === null ||
      !context.segmentationSignature ||
      !context.translationSignature ||
      this.#disposed ||
      (this.#setting.captionCacheLimit ?? 100) === 0
    )
      return;
    const write = () => {
      this.#captionCacheTimer = null;
      if (window.location.pathname.startsWith("/shorts/")) return;
      const latest = this.#captionCacheContext;
      if (
        !latest ||
        latest.videoId !== this.#videoId ||
        this.#disposed ||
        (this.#setting.captionCacheLimit ?? 100) === 0
      )
        return;
      const {
        generation,
        segmentationSignature,
        translationSignature,
        complete,
        ...entry
      } = latest;
      if (this.#captionFinalCues.size)
        entry.bilingual = {
          segmentationSignature,
          translationSignature,
          complete,
          toLang: this.#setting.toLang,
          cues: [...this.#captionFinalCues.values()].sort(
            (a, b) => a.start - b.start
          ),
        };
      void captionCacheRequest("put", { entry, generation }).catch(() => {});
    };
    if (immediate) {
      clearTimeout(this.#captionCacheTimer);
      write();
    } else if (!this.#captionCacheTimer)
      this.#captionCacheTimer = setTimeout(write, 1000);
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
        // Keep the same cue object while its translation request is in flight.
        if (this.#subtitles[index].text === subtitle.text)
          Object.assign(this.#subtitles[index], subtitle);
        else this.#subtitles[index] = subtitle;
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
    if (!this.#asr?.active)
      subtitles = subtitles?.map((cue) => {
        const translation = this.#captionFinalCues.get(
          captionCueKey(cue)
        )?.translation;
        return translation
          ? { ...cue, translation, _isDraftTranslation: false }
          : cue;
      });
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
   * 当用户更改了断句设置或主动切换翻译服务时，重新处理并渲染现有字幕。
   *
   * @private
   * @param {object} [options] 重处理选项。
   * @param {string|null} [options.previousApiSlug=null] 切换前的翻译服务标识。
   * @returns {void}
   */
  #reProcessEvents({ previousApiSlug = null } = {}) {
    if (!this.#setting.autoTranslate) return;

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
    if (previousApiSlug && previousApiSlug !== this.#setting.apiSlug) {
      clearMsgHistory(previousApiSlug);
    }
    clearMsgHistory(this.#setting.apiSlug);

    this.#captionContextPromise = null;
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
      logger
        .child("subtitle")
        .warn("Youtube Provider: AI context enrichment failed", err);
    }
  }

  /**
   * 当用户更改了 AI 上下文引擎配置时，清空当前大纲记忆，并带上新上下文重新处理字幕事件。
   *
   * @private
   * @returns {Promise<void>}
   */
  async #reProcessEventsWithContext() {
    if (!this.#setting.autoTranslate) return;

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
    this.#captionContextPromise = null;
    await this.#ensureCaptionContext(processingVersion);
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
    if (
      !this.#asr?.active &&
      (this.#ccBlocked || !this.#isYtSubtitleEnabled())
    ) {
      return;
    }

    if (this.#managerInstance) {
      return;
    }

    if (!this.#setting.autoTranslate) {
      return;
    }

    if (!this.#subtitles.length) return;

    const videoEl = this.#videoEl;
    if (!videoEl) {
      logger
        .child("subtitle")
        .debug("Youtube Provider: No video element found");
      return;
    }

    logger.child("subtitle").debug("Youtube Provider: Starting manager...");

    const processingVersion = this.#processingVersion;
    this.#managerInstance = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: this.#subtitles,
      setting: {
        ...this.#setting,
        managedTranslations: !!this.#asr?.active,
        ...(this.#asr?.active && {
          toLang: this.#asrState.translationLanguage || this.#setting.toLang,
        }),
        fromLang: this.#fromLang,
        docInfo: this.#docInfo,
        beforeTranslate: () => this.#ensureCaptionContext(processingVersion),
        onTranslationComplete: (cue) => {
          if (this.#asr?.active || this.#isStaleProcessing(processingVersion))
            return;
          const key = captionCueKey(cue);
          if (!this.#captionFinalCues.has(key)) return;
          this.#captionFinalCues.set(key, cue);
          this.#persistCaptionCache();
        },
        // 由渲染管理器按 timeupdate/seeked 上报播放窗口，provider 再决定是否触发后续 AI chunk。
        onTranslationError: () => {
          this.#translationError = true;
          this.#playerUi.updateMenuProps();
        },
        onSubtitleTimeWindow: ({ currentTimeMs, preTrans }) =>
          this.#scheduleAiChunks(currentTimeMs, preTrans),
      },
    });

    this.#ensureSubtitleList();
    if (this.#subtitleListManager)
      this.#managerInstance.onSubtitleUpdate = (update) =>
        this.#subtitleListManager?.updateSingleSubtitle(update);

    this.#managerInstance.start();

    this.#playerUi.hideYtCaption();
  }

  #ensureSubtitleList(forceAsr = false) {
    const videoEl = this.#videoEl;
    if (
      !videoEl ||
      this.#subtitleListManager ||
      this.#asrPanelClosed ||
      !this.#setting.autoTranslate
    )
      return;
    if (
      !forceAsr &&
      !this.#asr?.active &&
      !isSubtitleModeEnabled(this.#setting.showList, this.#setting.enhanceMode)
    )
      return;
    this.#subtitleListManager = new YouTubeSubtitleList(videoEl, this.#i18n, {
      asrActions: youtubeAsrSupported ? this.#asrActions() : null,
      retryCaptions: () =>
        this.#acquire({ enableCc: this.#ccBlocked, refresh: true }),
      onClose: () => {
        this.#asrPanelClosed = true;
        this.#subtitleListManager = null;
      },
      enableHoverLookup: isSubtitleModeEnabled(
        this.#setting.hoverLookupMode,
        this.#setting.enhanceMode
      ),
      autoFavWord: this.#setting.autoFavWord === true,
      hoverLookupCloseDelay: this.#setting.hoverLookupCloseDelay,
      getSummaryConfig: () => ({
        summaryApiSlug: this.#setting.summaryApiSlug,
        summaryPromptSlug: this.#setting.summaryPromptSlug,
        to: this.#setting.toLang || this.#setting.to || "zh-CN",
        transApis: this.#setting.transApis || [],
        prompts: this.#setting.prompts || [],
      }),
      getVideoMetadata: () => ({
        videoId: this.#videoId,
        title: this.#docInfo?.title || document.title,
        description: this.#fullDescription || this.#docInfo?.description || "",
        transcript:
          this.#flatEvents
            ?.map((e) => e.text)
            .filter(Boolean)
            .join(" ") ||
          this.#subtitles
            ?.map((s) => s.text)
            .filter(Boolean)
            .join(" "),
      }),
    });
    this.#subtitleListManager.updateAsrState({
      ...this.#asrState,
      active: !!this.#asr?.active,
      available: !!this.#asr?.service(),
    });
    this.#subtitleListManager.initialize(
      this.#subtitles,
      this.#rawSubtitleEvents,
      this.#progressed
    );
    if (forceAsr || this.#asr?.active) {
      this.#subtitleListManager.updateAsrTasks({
        reset: true,
        tasks: this.#asr?.tasks?.snapshot() || [],
      });
    }

    this.#subtitleListManager.updateCaptionState?.(this.#acquisitionState);
    this.#subtitleListManager.turnOnAutoSub();
  }

  /**
   * 销毁双语字幕管理器以及字幕侧边栏，恢复网页原生字幕展示状态。
   *
   * @private
   * @returns {void}
   */
  #destroyManager({ destroyList = false } = {}) {
    this.#playerUi.showYtCaption();

    if (this.#managerInstance) {
      this.#managerInstance.onSubtitleUpdate = null;
      this.#managerInstance.destroy();
      this.#managerInstance = null;
    }

    if (
      this.#subtitleListManager &&
      (destroyList ||
        !this.#setting.autoTranslate ||
        this.#ccBlocked ||
        !this.#subtitleListManager.asrActions)
    ) {
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

    logger
      .child("subtitle")
      .debug("Bilingual Subtitle Extension: Initializing...");
    const provider = new YouTubeCaptionProvider(setting);
    provider.initialize();
  };
})();
