import { logger } from "../libs/log.js";
import { apiSubtitle, apiSummarizeContext } from "../apis/index.js";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager.js";
import { YouTubeSubtitleList } from "./YouTubeSubtitleList.js";
import {
  MSG_XHR_DATA_YOUTUBE,
  APP_NAME,
  OPT_LANGS_TO_CODE,
  OPT_TRANS_MICROSOFT,
  OPT_LANGS_SPEC_DEFAULT,
  API_SPE_TYPES,
} from "../config";
import { sleep, downloadBlobFile } from "../libs/utils.js";
import { createLogoSVG } from "../libs/svg.js";
import { randomBetween } from "../libs/utils.js";
import { newI18n } from "../config";
import DomManager from "../libs/domManager.js";
import { Menus } from "./Menus.js";
import { buildBilingualVtt } from "./vtt.js";
import { getDocInfo } from "../libs/docInfo.js";
import { intelligentSentenceBreak } from "./sentenceBreaker.js";
import { isSubtitleModeEnabled } from "./modes.js";
import { clearMsgHistory } from "../apis/history.js";

const VIDEO_SELECT = "#container video";
const CONTORLS_SELECT = ".ytp-right-controls";
const YT_CAPTION_SELECT = "#ytp-caption-window-container";
const YT_AD_SELECT = ".video-ads";
const YT_SUBTITLE_BTN_SELECT = "button.ytp-subtitles-button";

class YouTubeCaptionProvider {
  #setting = {};

  #subtitles = [];
  #events = [];
  #flatEvents = [];
  #progressedNum = 0;
  #fromLang = "auto";
  #docInfo = {};
  #fullDescription = "";

  #processingId = null;
  #processingVersion = 0;
  #activeTrackKey = null;

  #managerInstance = null;
  #toggleButton = null;
  #isMenuShow = false;
  #notificationEl = null;
  #notificationTimeout = null;
  #i18n = () => "";
  #menuManager = null; // 菜单管理器实例
  #ytSubtitleStateObserver = null;

  // 新增：字幕列表管理器实例
  #subtitleListManager = null;

  constructor(setting = {}) {
    this.#setting = { ...setting, showOrigin: false };
    this.#i18n = newI18n(setting.uiLang || "zh");
  }

  get #videoId() {
    const docUrl = new URL(document.location.href);
    return docUrl.searchParams.get("v");
  }

  get #videoEl() {
    return document.querySelector(VIDEO_SELECT);
  }

  set #progressed(num) {
    this.#progressedNum = num;
    this.#updateMenuProps(); // 更新菜单 props
  }

  get #progressed() {
    return this.#progressedNum;
  }

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
      this.#flatEvents = [];
      this.#progressed = 0;
      this.#fromLang = "auto";
      this.#docInfo = {};
      this.#fullDescription = "";
      this.#processingId = null;
      this.#processingVersion += 1;
      this.#activeTrackKey = null;
      this.#updateMenuProps(); // 更新菜单 props
    });

    this.#waitForElement(CONTORLS_SELECT, (ytControls) => {
      const ytSubtitleBtn = ytControls.querySelector(YT_SUBTITLE_BTN_SELECT);
      if (ytSubtitleBtn) {
        this.#observeYtSubtitleState(ytSubtitleBtn);
      }

      this.#injectToggleButton(ytControls);
    });

    this.#waitForElement(YT_AD_SELECT, (adContainer) => {
      this.#moAds(adContainer);
    });
  }

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

  #syncYtSubtitleState(ytSubtitleBtn) {
    if (ytSubtitleBtn.getAttribute("aria-pressed") === "true") {
      this.#startManager();
    } else {
      this.#destroyManager();
    }
  }

  #isYtSubtitleEnabled() {
    const ytSubtitleBtn = document.querySelector(YT_SUBTITLE_BTN_SELECT);
    return (
      !ytSubtitleBtn || ytSubtitleBtn.getAttribute("aria-pressed") === "true"
    );
  }

  #moAds(adContainer) {
    const adLayoutSelector = ".ytp-ad-player-overlay-layout";
    const skipBtnSelector =
      ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern";
    const observer = new MutationObserver((mutations) => {
      const { skipAd = false } = this.#setting;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const videoEl = this.#videoEl;
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.matches(adLayoutSelector)) {
              logger.debug("Youtube Provider: AD start playing!", node);
              // todo: 顺带把广告快速跳过
              if (videoEl && skipAd) {
                videoEl.playbackRate = 16;
                videoEl.currentTime = videoEl.duration;
              }
              if (this.#managerInstance) {
                this.#managerInstance.setIsAdPlaying(true);
              }
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
                this.#hideYtCaption();
              }
              if (videoEl && skipAd) {
                videoEl.playbackRate = 1;
              }
              if (this.#managerInstance) {
                this.#managerInstance.setIsAdPlaying(false);
              }
            }
          });
        }
      }
    });

    observer.observe(adContainer, {
      childList: true,
      subtree: true,
    });
  }

  #waitForElement(selector, callback) {
    const element = document.querySelector(selector);
    if (element) {
      callback(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const targetNode = document.querySelector(selector);
      if (targetNode) {
        obs.disconnect();
        callback(targetNode);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  updateSetting({ name, value }) {
    if (this.#setting[name] === value) return;

    logger.debug("Youtube Provider: update setting", name, value);
    this.#setting[name] = value;

    this.#updateMenuProps(); // 更新菜单 props

    if (name === "isBilingual" || name === "blurTranslation") {
      this.#managerInstance?.updateSetting({ [name]: value });
    } else if (name === "segSlug") {
      this.#reProcessEvents();
    } else if (name === "showOrigin") {
      this.#toggleShowOrigin();
    } else if (name === "aiContextSlug") {
      this.#reProcessEventsWithContext();
    } else if (name === "showLoadNotification" && value === false) {
      this.#hideNotification();
    } else if (name === "hideSubtitleButton") {
      if (value === true) {
        this.#removeToggleButton();
      } else {
        this.#injectToggleButton(document.querySelector(CONTORLS_SELECT));
      }
    }
  }

  #toggleShowOrigin() {
    if (this.#setting.showOrigin) {
      this.#destroyManager();
    } else {
      this.#startManager();
    }
  }

  downloadSubtitle() {
    if (!this.#subtitles.length || this.#progressed !== 100) {
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
   * 获取菜单组件的 props
   * @private
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
   * 更新菜单组件的 props
   * @private
   */
  #updateMenuProps() {
    if (this.#menuManager && this.#isMenuShow) {
      this.#menuManager.updateProps(this.#getMenuProps());
    }
  }

  #injectToggleButton(ytControls) {
    if (
      this.#setting.hideSubtitleButton === true ||
      !ytControls ||
      ytControls.querySelector(".kiss-subtitle-button")
    ) {
      return;
    }

    const kissControls = document.createElement("div");
    kissControls.className = "notranslate kiss-subtitle-controls";
    Object.assign(kissControls.style, {
      height: "100%",
      position: "relative",
    });

    const toggleButton = document.createElement("button");
    toggleButton.className = "ytp-button kiss-subtitle-button";
    toggleButton.title = APP_NAME;

    toggleButton.appendChild(createLogoSVG());
    kissControls.appendChild(toggleButton);

    // 使用新的 DomManager 替代 ShadowDomManager
    this.#menuManager = new DomManager({
      id: "kiss-subtitle-menus",
      className: "notranslate",
      reactComponent: Menus,
      rootElement: kissControls,
      props: this.#getMenuProps(), // 获取菜单 props
    });

    toggleButton.onclick = () => {
      if (!this.#isMenuShow) {
        this.#isMenuShow = true;
        this.#toggleButton?.replaceChildren(
          createLogoSVG({ isSelected: true })
        );
        this.#menuManager.show();
        this.#updateMenuProps(); // 显示时更新 props
      } else {
        this.#isMenuShow = false;
        this.#toggleButton?.replaceChildren(createLogoSVG());
        this.#menuManager.hide();
      }
    };
    this.#toggleButton = toggleButton;

    ytControls?.prepend(kissControls);
  }

  #removeToggleButton() {
    this.#isMenuShow = false;
    this.#menuManager?.destroy();
    this.#menuManager = null;
    const kissControls =
      this.#toggleButton?.closest(".kiss-subtitle-controls") ||
      document.querySelector(".kiss-subtitle-controls");
    kissControls?.remove();
    this.#toggleButton = null;
  }

  #isSameLang(lang1, lang2) {
    if (!lang1 || !lang2) return false;
    return lang1.slice(0, 2) === lang2.slice(0, 2);
  }

  #isChatCaptionTrack(track) {
    if (!track) return false;
    const name = track.name?.simpleText || track.name?.runs?.[0]?.text || "";
    return /chat/i.test(name);
  }

  #buildTrackKey(potUrl) {
    const p = potUrl.searchParams;
    return [
      p.get("v") || "",
      p.get("lang") || "",
      p.get("kind") || "",
      p.get("name") || "",
      p.get("tlang") || "",
    ].join("|");
  }

  #isStaleProcessing(version) {
    return version !== this.#processingVersion;
  }

  // todo: 优化逻辑
  #findCaptionTrack(captionTracks, lang, kind) {
    logger.debug("Youtube Provider: find caption track", {
      captionTracks,
      lang,
      kind,
    });

    if (!captionTracks?.length) {
      return null;
    }

    // 优先匹配用户选择的字幕轨（语言+kind完全一致）
    // 手动字幕没有 kind 字段，统一转成 null，避免 undefined !== null 导致无法匹配
    let captionTrack = captionTracks.find(
      (item) =>
        item.languageCode === lang && (item.kind || null) === (kind || null)
    );
    if (!captionTrack) {
      captionTrack = captionTracks.find((item) => item.languageCode === lang);
    }
    if (!captionTrack) {
      const asrTrack = captionTracks.find((item) => item.kind === "asr");
      if (asrTrack) {
        captionTrack = captionTracks.find(
          (item) =>
            item.kind !== "asr" &&
            this.#isSameLang(item.languageCode, asrTrack.languageCode)
        );
        if (!captionTrack) {
          captionTrack = asrTrack;
        }
      }
    }

    if (!captionTrack) {
      captionTrack = captionTracks.pop();
    }

    // Chat/弹幕字幕轨道自动降级为正常字幕轨道
    if (captionTrack && this.#isChatCaptionTrack(captionTrack)) {
      logger.debug(
        "Youtube Provider: detected chat subtitle track, switching to normal subtitle"
      );

      const nonChatSameLang = captionTracks.find(
        (item) =>
          this.#isSameLang(item.languageCode, lang) &&
          !this.#isChatCaptionTrack(item)
      );

      if (nonChatSameLang) {
        logger.debug(
          "Youtube Provider: switched to same-language non-chat track"
        );
        captionTrack = nonChatSameLang;
      } else {
        const anyNonChat = captionTracks.find(
          (item) => !this.#isChatCaptionTrack(item)
        );
        if (anyNonChat) {
          logger.debug("Youtube Provider: switched to fallback non-chat track");
          captionTrack = anyNonChat;
        }
      }
    }

    return captionTrack;
  }

  async #getCaptionTracks(videoId) {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const html = await fetch(url).then((r) => r.text());
      const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
      if (!match) return {};
      const data = JSON.parse(match[1]);
      return {
        captionTracks:
          data.captions?.playerCaptionsTracklistRenderer?.captionTracks,
        fullDescription: data.videoDetails?.shortDescription || "",
      };
    } catch (err) {
      logger.info("Youtube Provider: get captionTracks", err);
      return {};
    }
  }

  async #getSubtitleEvents(capUrl, potUrl, responseText) {
    if (
      !potUrl.searchParams.get("tlang") &&
      potUrl.searchParams.get("kind") === capUrl.searchParams.get("kind") &&
      this.#isSameLang(
        potUrl.searchParams.get("lang"),
        capUrl.searchParams.get("lang")
      )
    ) {
      try {
        const json = JSON.parse(responseText);
        return json?.events;
      } catch (err) {
        logger.info("Youtube Provider: parse responseText", err);
        return null;
      }
    }

    try {
      potUrl.searchParams.delete("tlang");
      potUrl.searchParams.delete("name");
      potUrl.searchParams.set("lang", capUrl.searchParams.get("lang"));
      potUrl.searchParams.set("fmt", "json3");
      if (capUrl.searchParams.get("kind")) {
        potUrl.searchParams.set("kind", capUrl.searchParams.get("kind"));
      } else {
        potUrl.searchParams.delete("kind");
      }

      const res = await fetch(potUrl.href);
      if (res?.ok) {
        const json = await res.json();
        return json?.events;
      }
      logger.info(`Youtube Provider: Failed to fetch subtitles: ${res.status}`);
      return null;
    } catch (error) {
      logger.info("Youtube Provider: fetching subtitles error", error);
      return null;
    }
  }

  #getChunkContext(chunks, chunkIndex, side, maxEvents = 3, maxChars = 240) {
    const NON_SPEECH_RE = /^\[.+\]$/i;
    const adj =
      side === "prev" ? chunks[chunkIndex - 1] : chunks[chunkIndex + 1];
    if (!adj?.length) return "";
    const picked =
      side === "prev" ? adj.slice(-maxEvents) : adj.slice(0, maxEvents);
    return picked
      .map((e) => String(e?.text ?? "").trim())
      .filter((t) => t && !NON_SPEECH_RE.test(t))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);
  }

  async #aiSegment({
    videoId,
    fromLang,
    toLang,
    chunkEvents,
    segApiSetting,
    prevContext = "",
    nextContext = "",
  }) {
    const NON_SPEECH_RE = /^\[.+\]$/i;
    const speechEvents = [];
    const nonSpeechEvents = [];

    for (const item of chunkEvents) {
      if (!item.text) continue;
      if (NON_SPEECH_RE.test(item.text.trim())) {
        nonSpeechEvents.push(item);
      } else {
        speechEvents.push(item);
      }
    }

    const toStandaloneSub = (e) => ({
      start: e.start,
      end: e.end,
      text: e.text,
      translation: e.text,
    });

    if (!speechEvents.length) return nonSpeechEvents.map(toStandaloneSub);

    try {
      const chunkSign = `${speechEvents[0].start} --> ${speechEvents[speechEvents.length - 1].end}`;
      logger.debug("Youtube Provider: aiSegment events", {
        videoId,
        chunkSign,
        fromLang,
        toLang,
        speechEvents,
      });
      const subtitles = await apiSubtitle({
        videoId,
        chunkSign,
        fromLang,
        toLang,
        events: speechEvents,
        apiSetting: segApiSetting,
        docInfo: this.#docInfo,
        prevContext,
        nextContext,
      });
      logger.debug("Youtube Provider: aiSegment subtitles", subtitles);
      if (Array.isArray(subtitles) && subtitles.length) {
        // 断句服务和翻译服务不同时，清除断句的翻译，由翻译服务重新翻译
        let result = subtitles;
        if (segApiSetting.apiSlug !== this.#setting.apiSlug) {
          result = subtitles.map((sub) => ({ ...sub, translation: "" }));
        }

        // 截断重试：检测 AI 是否覆盖了全部 speechEvents
        const maxEi = Math.max(...result.map((s) => s._ei ?? -1));
        if (maxEi >= 0 && maxEi < speechEvents.length - 1) {
          const tailEvents = speechEvents.slice(maxEi + 1);
          // 仅当尾部不超过原始的 50% 时重试（否则视为整体失败）
          if (tailEvents.length <= speechEvents.length * 0.5) {
            try {
              const tailSign = `${tailEvents[0].start} --> ${tailEvents[tailEvents.length - 1].end}`;
              const lastResultText = result[result.length - 1]?.text || "";
              const tailSubs = await apiSubtitle({
                videoId,
                chunkSign: tailSign,
                fromLang,
                toLang,
                events: tailEvents,
                apiSetting: segApiSetting,
                docInfo: this.#docInfo,
                prevContext: [prevContext, lastResultText]
                  .filter(Boolean)
                  .join(" "),
                nextContext,
              });
              if (tailSubs?.length) {
                result = [...result, ...tailSubs];
              } else {
                result = [
                  ...result,
                  ...this.#formatSubtitles(tailEvents, fromLang),
                ];
              }
            } catch {
              result = [
                ...result,
                ...this.#formatSubtitles(tailEvents, fromLang),
              ];
            }
          }
        }

        // 仅保留落在语音字幕间隙中的非语音条目，丢弃与语音重叠的
        const gapCues = nonSpeechEvents
          .filter(
            (ns) =>
              !result.some((sub) => ns.start < sub.end && ns.end > sub.start)
          )
          .map(toStandaloneSub);

        return [...result, ...gapCues].sort((a, b) => a.start - b.start);
      }
    } catch (err) {
      logger.info("Youtube Provider: ai segmentation", err);
    }

    return nonSpeechEvents.map(toStandaloneSub);
  }

  #getFromLang(lang) {
    if (lang === "zh") {
      return "zh-CN";
    }

    return (
      OPT_LANGS_SPEC_DEFAULT.get(lang) ||
      OPT_LANGS_SPEC_DEFAULT.get(lang.slice(0, 2)) ||
      OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang) ||
      OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang.slice(0, 2)) ||
      "auto"
    );
  }

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
    const trackKey = this.#buildTrackKey(potUrl);
    const fromLang = this.#getFromLang(lang);

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

    if (this.#flatEvents.length) {
      this.#destroyManager();
      clearMsgHistory(this.#setting.apiSlug);
      this.#subtitles = [];
      this.#events = [];
      this.#flatEvents = [];
      this.#progressed = 0;
      this.#activeTrackKey = null;
    }

    try {
      this.#showNotification(this.#i18n("starting_to_process_subtitle"));

      const { toLang } = this.#setting;
      const { captionTracks, fullDescription } =
        await this.#getCaptionTracks(videoId);
      if (this.#isStaleProcessing(processingVersion)) return;

      this.#fullDescription = fullDescription || "";
      const captionTrack = this.#findCaptionTrack(
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
      const events = await this.#getSubtitleEvents(
        capUrl,
        potUrl,
        responseText
      );
      if (this.#isStaleProcessing(processingVersion)) return;

      if (!events?.length) {
        logger.debug("Youtube Provider: events not got:", videoId);
        return;
      }

      logger.debug(
        `Youtube Provider: lang: ${lang}, fromLang: ${fromLang}, toLang: ${toLang}`
      );
      if (this.#isSameLang(fromLang, toLang)) {
        logger.debug("Youtube Provider: skip same lang", fromLang, toLang);
        this.#showNotification(this.#i18n("subtitle_same_lang"));
        return;
      }

      const subtitleEvents = this.#normalizeTimedTextEvents(events);
      const flatEvents = this.#genFlatEvents(subtitleEvents);
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
      });
    } catch (error) {
      logger.warn("Youtube Provider: handle subtitle", error);
      this.#showNotification(this.#i18n("subtitle_load_failed"));
    } finally {
      if (
        !this.#isStaleProcessing(processingVersion) &&
        this.#processingId === trackKey
      ) {
        this.#processingId = null;
      }
    }
  }

  async #processEvents({ videoId, flatEvents, fromLang, processingVersion }) {
    try {
      const [subtitles, progressed] = await this.#eventsToSubtitles({
        videoId,
        events: this.#events,
        flatEvents,
        fromLang,
        processingVersion,
      });
      if (this.#isStaleProcessing(processingVersion)) return;

      if (!subtitles?.length) {
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

      this.#subtitles = subtitles;
      this.#progressed = progressed;

      this.#startManager();
    } catch (error) {
      logger.info("Youtube Provider: process events", error);
      this.#showNotification(this.#i18n("subtitle_load_failed"));
    }
  }

  #reProcessEvents() {
    this.#progressed = 0;
    this.#subtitles = [];

    const videoId = this.#videoId;
    const flatEvents = this.#flatEvents;
    const fromLang = this.#fromLang;
    if (!videoId || !flatEvents.length) {
      return;
    }

    this.#showNotification(this.#i18n("starting_reprocess_events"));

    const processingVersion = (this.#processingVersion += 1);
    this.#destroyManager();
    clearMsgHistory(this.#setting.apiSlug);

    this.#processEvents({ videoId, flatEvents, fromLang, processingVersion });
  }

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

    // 捕获快照，防止切换视频时旧结果污染新docInfo
    const videoId = this.#videoId;
    const docInfo = this.#docInfo;

    try {
      this.#showNotification(this.#i18n("ai_context_analyzing"));

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

  async #reProcessEventsWithContext() {
    this.#progressed = 0;
    this.#subtitles = [];

    const videoId = this.#videoId;
    const flatEvents = this.#flatEvents;
    if (!videoId || !flatEvents.length) return;

    const processingVersion = (this.#processingVersion += 1);
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
    });
  }

  async #eventsToSubtitles({
    videoId,
    events,
    flatEvents,
    fromLang,
    processingVersion,
  }) {
    const { segSlug, transApis, chunkLength, toLang } = this.#setting;

    const segApiSetting = transApis?.find((api) => api.apiSlug === segSlug);
    const useAiSegmentation = segSlug && segSlug !== "-" && segApiSetting;

    // 断句策略仅由用户配置的 segSlug 决定；kind 只负责定位用户实际选择的字幕轨道。
    if (useAiSegmentation) {
      if (this.#isStaleProcessing(processingVersion)) return [[], 0];
      logger.info("Youtube Provider: Starting AI segmentation...");
      this.#showNotification(this.#i18n("ai_processing_pls_wait"));

      const eventChunks = this.#splitEventsIntoChunks(flatEvents, chunkLength);

      if (eventChunks.length === 0) {
        logger.info("Youtube Provider: AI no chunks, falling back to built-in");
        return [this.#builtinSegment(events, flatEvents, fromLang), 100];
      }

      const firstChunkEvents = eventChunks[0];
      const firstBatchSubtitles = await this.#aiSegment({
        videoId,
        chunkEvents: firstChunkEvents,
        fromLang,
        toLang,
        segApiSetting,
        prevContext: "",
        nextContext: this.#getChunkContext(eventChunks, 0, "next"),
      });
      if (this.#isStaleProcessing(processingVersion)) return [[], 0];

      if (!firstBatchSubtitles?.length) {
        logger.info("Youtube Provider: AI failed, falling back to built-in");
        return [this.#builtinSegment(events, flatEvents, fromLang), 100];
      }

      logger.info("Youtube Provider: Sentence break mode: AI");
      if (eventChunks.length > 1) {
        this.#processRemainingChunksAsync({
          chunks: eventChunks,
          startIndex: 1,
          videoId,
          fromLang,
          toLang,
          segApiSetting,
          processingVersion,
        });

        const processed = Math.floor(100 / eventChunks.length);
        return [firstBatchSubtitles, processed];
      }
      return [firstBatchSubtitles, 100];
    }

    return [this.#builtinSegment(events, flatEvents, fromLang), 100];
  }

  #builtinSegment(events, flatEvents, fromLang) {
    const { useAlgorithmBreaker } = this.#setting;

    if (useAlgorithmBreaker === "statistical") {
      logger.info("Youtube Provider: Sentence break mode: STATISTICAL");
      const result = this.#algorithmicSegment(events, fromLang);
      if (result?.length) return result;
      logger.info("Youtube Provider: Statistical segmentation returned empty");
      return [];
    }

    logger.info("Youtube Provider: Sentence break mode: RULE");
    return this.#formatSubtitles(flatEvents, fromLang);
  }

  #algorithmicSegment(events, fromLang) {
    try {
      const algorithmicSubtitles = intelligentSentenceBreak({ events });
      return algorithmicSubtitles.map((sub) => ({
        text: sub.text,
        start: sub.start,
        end: sub.end,
        translation: "",
      }));
    } catch (error) {
      logger.info("Youtube Provider: Error in algorithmic segmentation", error);
      return null;
    }
  }

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
      this.#showNotification(this.#i18n("waitting_for_subtitle"));
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
      },
    });

    // 监听字幕更新事件，将翻译后的字幕传递给字幕列表
    const showList = isSubtitleModeEnabled(
      this.#setting.showList,
      this.#setting.enhanceMode
    );

    if (showList && !this.#subtitleListManager) {
      // 初始化字幕列表管理器
      this.#subtitleListManager = new YouTubeSubtitleList(videoEl);
      this.#subtitleListManager.initialize(this.#subtitles);

      // 监听字幕更新事件，在字幕翻译完成后增量更新字幕列表
      this.#managerInstance.onSubtitleUpdate = (subtitleUpdate) => {
        this.#subtitleListManager.updateSingleSubtitle(subtitleUpdate);
      };

      // 启动字幕列表自动滚动
      this.#subtitleListManager.turnOnAutoSub();
    }

    this.#managerInstance.start();

    this.#showNotification(this.#i18n("subtitle_load_succeed"));

    this.#hideYtCaption();
  }

  #destroyManager() {
    this.#showYtCaption();

    if (!this.#managerInstance) {
      return;
    }

    logger.info("Youtube Provider: Destroying manager...");

    this.#managerInstance.onSubtitleUpdate = null;
    this.#managerInstance.destroy();
    this.#managerInstance = null;

    // 销毁字幕列表
    if (this.#subtitleListManager) {
      this.#subtitleListManager.destroy();
      this.#subtitleListManager = null;
    }
  }

  #hideYtCaption() {
    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.top = "-10000px");
  }

  #showYtCaption() {
    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.top = "0");
  }

  #formatSubtitles(flatEvents, lang) {
    if (!flatEvents?.length) return [];

    const noSpaceLanguages = [
      "zh", // 中文
      "ja", // 日文
      "ko", // 韩文（现代用空格，但结构上仍可连写）
      "th", // 泰文
      "lo", // 老挝文
      "km", // 高棉文
      "my", // 缅文
    ];

    if (noSpaceLanguages.some((l) => lang?.startsWith(l))) {
      const subtitles = [];

      if (this.#isQualityPoor(flatEvents, 5, 0.5)) {
        return flatEvents;
      }

      let currentLine = null;
      const MAX_LENGTH = 30;

      for (const segment of flatEvents) {
        if (segment.text) {
          if (!currentLine) {
            currentLine = {
              text: segment.text,
              start: segment.start,
              end: segment.end,
            };
          } else {
            currentLine.text += segment.text;
            currentLine.end = segment.end;
          }

          if (currentLine.text.length >= MAX_LENGTH) {
            subtitles.push(currentLine);
            currentLine = null;
          }
        } else {
          if (currentLine) {
            subtitles.push(currentLine);
            currentLine = null;
          }
        }
      }

      if (currentLine) {
        subtitles.push(currentLine);
      }

      return subtitles;
    }

    let subtitles = this.#processSubtitles({ flatEvents });

    const longSentenceThreshold = this.#setting.longSentenceThreshold ?? 120;
    const result = [];
    for (const sub of subtitles) {
      if (sub.text.length > longSentenceThreshold) {
        const subEvents = flatEvents.filter(
          (e) => e.start >= sub.start && e.start < sub.end
        );
        if (subEvents.length > 1) {
          logger.debug(
            "Youtube Provider: re-processing long sentence with pause",
            {
              length: sub.text.length,
              text: sub.text.slice(0, 50) + "...",
            }
          );
          const reProcessed = this.#processSubtitles({
            flatEvents: subEvents,
            usePause: true,
          });
          result.push(...reProcessed);
        } else {
          result.push(sub);
        }
      } else {
        result.push(sub);
      }
    }
    subtitles = result;

    return subtitles;
  }

  #isQualityPoor(lines, lengthThreshold = 200, percentageThreshold = 0.1) {
    if (lines.length === 0) return false;
    const longLinesCount = lines.filter(
      (line) => line.text.length > lengthThreshold
    ).length;
    logger.debug("Youtube Provider: quality check", {
      longLinesCount,
      totalLines: lines.length,
      percentage: longLinesCount / lines.length,
    });
    return longLinesCount / lines.length > percentageThreshold;
  }

  #processSubtitles({
    flatEvents,
    usePause = false,
    timeout = 1000,
    maxWords = 15,
    maxDurationMs = 10000,
  } = {}) {
    const groupedPauseWords = {
      1: new Set([
        "actually",
        "also",
        "although",
        "and",
        "anyway",
        "as",
        "basically",
        "because",
        "but",
        "eventually",
        "frankly",
        "honestly",
        "hopefully",
        "however",
        "if",
        "instead",
        "it's",
        "just",
        "let's",
        "like",
        "literally",
        "maybe",
        "meanwhile",
        "nevertheless",
        "nonetheless",
        "now",
        "okay",
        "or",
        "otherwise",
        "perhaps",
        "personally",
        "probably",
        "right",
        "since",
        "so",
        "suddenly",
        "that's",
        "then",
        "there's",
        "therefore",
        "though",
        "thus",
        "unless",
        "until",
        "well",
        "while",
      ]),
      2: new Set([
        "after all",
        "at first",
        "at least",
        "even if",
        "even though",
        "for example",
        "for instance",
        "i believe",
        "i guess",
        "i mean",
        "i suppose",
        "i think",
        "in fact",
        "in the end",
        "of course",
        "then again",
        "to be fair",
        "you know",
        "you see",
      ]),
      3: new Set([
        "as a result",
        "by the way",
        "in other words",
        "in that case",
        "in this case",
        "to be clear",
        "to be honest",
      ]),
    };

    const sentences = [];
    let currentBuffer = [];
    let bufferWordCount = 0;

    const flushBuffer = () => {
      if (currentBuffer.length > 0) {
        sentences.push({
          text: currentBuffer
            .map((s) => s.text)
            .join(" ")
            .trim(),
          start: currentBuffer[0].start,
          end: currentBuffer[currentBuffer.length - 1].end,
        });
      }
      currentBuffer = [];
      bufferWordCount = 0;
    };

    flatEvents.forEach((segment) => {
      if (!segment.text) return;

      const lastSegment = currentBuffer[currentBuffer.length - 1];

      if (lastSegment) {
        const isEndOfSentence = /[.?!…\])]$/.test(lastSegment.text);
        const isPauseOfSentence = /[,]$/.test(lastSegment.text);
        const isTimeout = segment.start - lastSegment.end > timeout;
        const isDurationExceeded =
          segment.start - currentBuffer[0].start >= maxDurationMs;
        const isWordLimitExceeded =
          (usePause || isPauseOfSentence) && bufferWordCount >= maxWords;

        const startsWithSign = /^[[(♪]/.test(segment.text);
        const startsWithPauseWord =
          usePause &&
          groupedPauseWords["1"].has(
            segment.text.toLowerCase().split(" ")[0]
          ) &&
          currentBuffer.length > 1;

        if (
          isEndOfSentence ||
          isTimeout ||
          isDurationExceeded ||
          isWordLimitExceeded ||
          startsWithSign ||
          startsWithPauseWord
        ) {
          flushBuffer();
        }
      }

      currentBuffer.push(segment);
      bufferWordCount += segment.text.split(/\s+/).length;
    });

    flushBuffer();

    return sentences;
  }

  #cleanTimedText(utf8 = "") {
    return (
      String(utf8)
        .replace(/<[^>]+>/g, "")
        // 当前异常 timedtext 中实际污染字幕的是 U+200B 零宽空格。
        // 这里只移除 U+200B，避免误删 U+200C/U+200D 等对部分语言文字成形有意义的字符。
        .replace(/\u200B/g, "")
        .trim()
        .replace(/\s+/g, " ")
    );
  }

  #normalizeTimedTextEvents(events = []) {
    const normalizedEvents = [];
    let lastVisibleEventKey = "";

    events.forEach((event) => {
      const { segs = [], tStartMs = 0, dDurationMs = 0 } = event || {};

      // YouTube 会用 aAppend + "\n" 标记原始字幕断行；统计断句模式会读取这个信号，
      // 因此这类控制事件必须原样保留，不能被“空文本清理”误删。
      if (event?.aAppend === 1 && segs.length === 1 && segs[0]?.utf8 === "\n") {
        normalizedEvents.push(event);
        lastVisibleEventKey = "";
        return;
      }

      const normalizedSegs = segs.map((seg) => ({
        ...seg,
        utf8: this.#cleanTimedText(seg?.utf8),
      }));
      const visibleSegs = normalizedSegs.filter((seg) => seg.utf8);

      // 清洗后没有可见文本的 seg 仍可能携带 tOffsetMs 断点。
      // 这些断点会被 #genFlatEvents 用来截断前一个可见片段，直接丢弃会让字幕粘连。
      // 因此这里只清理文本内容，不改变原始 seg 的时间结构。
      if (!visibleSegs.length) {
        normalizedEvents.push({
          ...event,
          segs: normalizedSegs,
        });
        lastVisibleEventKey = "";
        return;
      }

      const visibleText = visibleSegs
        .map((seg) => seg.utf8)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const eventKey = `${tStartMs}|${dDurationMs}|${visibleText}`;

      // 部分 json3 timedtext 会把同一字幕用两套 pPenId 样式连续输出两遍。
      // 去重键只使用时间和可见文本，避免样式层差异污染字幕内容。
      if (eventKey === lastVisibleEventKey) return;

      normalizedEvents.push({
        ...event,
        segs: normalizedSegs,
      });
      lastVisibleEventKey = eventKey;
    });

    return normalizedEvents;
  }

  #genFlatEvents(events = []) {
    const segments = [];
    let buffer = null;

    events.forEach(({ segs = [], tStartMs = 0, dDurationMs = 0 }) => {
      segs.forEach(({ utf8 = "", tOffsetMs = 0 }, j) => {
        const text = this.#cleanTimedText(utf8);
        const start = tStartMs + tOffsetMs;

        if (!text) {
          if (buffer) {
            if (!buffer.end || buffer.end > start) {
              buffer.end = start;
            }
            if (buffer.end > buffer.start) {
              segments.push(buffer);
            }
            buffer = null;
          }
          return;
        }

        if (buffer) {
          if (!buffer.end || buffer.end > start) {
            buffer.end = start;
          }
          if (buffer.end > buffer.start) {
            segments.push(buffer);
          }
          buffer = null;
        }

        buffer = {
          text,
          start,
        };

        if (j === segs.length - 1) {
          buffer.end = tStartMs + dDurationMs;
        }
      });
    });

    if (buffer) {
      if (buffer.end > buffer.start) {
        segments.push(buffer);
      }
    }

    return segments.filter(
      (s) => s && typeof s.start === "number" && s.end > s.start
    );
  }

  #splitEventsIntoChunks(flatEvents, chunkLength = 1000) {
    if (!flatEvents || flatEvents.length === 0) {
      return [];
    }

    const eventChunks = [];
    let currentChunk = [];
    let currentChunkTextLength = 0;
    const MAX_CHUNK_LENGTH = chunkLength + 500;
    const PAUSE_THRESHOLD_MS = 1000;

    for (let i = 0; i < flatEvents.length; i++) {
      const event = flatEvents[i];
      currentChunk.push(event);
      currentChunkTextLength += event.text.length;

      const isLastEvent = i === flatEvents.length - 1;
      if (isLastEvent) {
        continue;
      }

      let shouldSplit = false;

      if (currentChunkTextLength >= MAX_CHUNK_LENGTH) {
        shouldSplit = true;
      } else if (currentChunkTextLength >= chunkLength) {
        const isEndOfSentence = /[.?!…\])]$/.test(event.text);
        const nextEvent = flatEvents[i + 1];
        const pauseDuration = nextEvent.start - event.end;
        if (isEndOfSentence || pauseDuration > PAUSE_THRESHOLD_MS) {
          shouldSplit = true;
        }
      }

      if (shouldSplit) {
        eventChunks.push(currentChunk);
        currentChunk = [];
        currentChunkTextLength = 0;
      }
    }

    if (currentChunk.length > 0) {
      eventChunks.push(currentChunk);
    }

    return eventChunks;
  }

  /**
   * 异步批次处理视频后续的所有字幕分块并增量渲染到界面上
   * // REVIEW: 视频切换时后台异步 API 请求浪费风险。
   * //    在异步 for 循环中遍历后续的分块，当视频中途被用户切换或退出时，虽然有 `#isStaleProcessing` 拦截，
   * //    但由于该拦截只发生在异步 await 请求返回之后进行检查抛弃，
   * //    这就导致已经发出的 AI 翻译网络请求依然会被后台的 TaskPool 处理并执行完毕。
   * //    如果在前一个视频处理期间用户频繁切换了几个新视频，可能会导致大量被废弃的“前视频字幕翻译请求”依然常驻后台，
   * //    造成高额的大模型 API 额度（Token）消耗与浏览器跨域带宽浪费。
   * //    推荐为每次异步请求引入 `AbortController` 并在视频重定向销毁时执行 `.abort()`。
   * @private
   */
  async #processRemainingChunksAsync({
    chunks,
    startIndex = 0,
    videoId,
    fromLang,
    toLang,
    segApiSetting,
    processingVersion,
  }) {
    logger.info(
      `Youtube Provider: Starting async from chunk ${startIndex + 1}/${chunks.length}.`
    );

    for (let i = startIndex; i < chunks.length; i++) {
      // 检查本批次是否已经因为用户切换了字幕轨道或视频而过期，若是则立即退出
      if (this.#isStaleProcessing(processingVersion)) {
        logger.info("Youtube Provider: Skip stale chunk processing.");
        break;
      }

      const chunkEvents = chunks[i];
      const chunkNum = i + 1;
      logger.debug(
        `Youtube Provider: Processing subtitle chunk ${chunkNum}/${chunks.length}: ${chunkEvents[0]?.start} --> ${chunkEvents[chunkEvents.length - 1]?.start}`
      );

      let subtitlesForThisChunk = [];

      try {
        // 请求大模型 AI 对当前分块进行智能断句及辅助翻译
        const aiSubtitles = await this.#aiSegment({
          videoId,
          chunkEvents,
          fromLang,
          toLang,
          segApiSetting,
          prevContext: this.#getChunkContext(chunks, i, "prev"),
          nextContext: this.#getChunkContext(chunks, i, "next"),
        });
        if (this.#isStaleProcessing(processingVersion)) break;

        if (aiSubtitles?.length > 0) {
          subtitlesForThisChunk = aiSubtitles;
        } else {
          // AI 模式返回空时，降级采用内置普通规则断句
          logger.debug(
            `Youtube Provider: AI segmentation for chunk ${chunkNum} returned no data.`
          );
          subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
        }
      } catch (chunkError) {
        // 出错时降级
        subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
      }

      // 双重检查防竞态：确认视频 ID 是否在此期间发生了改变
      if (
        videoId !== this.#videoId ||
        this.#isStaleProcessing(processingVersion)
      ) {
        logger.info(
          "Youtube Provider: videoId changed or track replaced!",
          videoId,
          this.#videoId
        );
        break;
      }

      if (subtitlesForThisChunk.length > 0) {
        const progressed = Math.floor((chunkNum * 100) / chunks.length);
        this.#subtitles.push(...subtitlesForThisChunk);
        // 按时间轴起始点进行重新排序以确保不错序
        this.#subtitles.sort((a, b) => a.start - b.start);
        this.#progressed = progressed;

        logger.debug(
          `Youtube Provider: Appending ${subtitlesForThisChunk.length} subtitles from chunk ${chunkNum} (${this.#progressed}%).`
        );

        if (this.#managerInstance) {
          this.#managerInstance.appendSubtitles(subtitlesForThisChunk);
        }

        // 增量追加新字条目到侧边字幕列表渲染器中
        if (this.#subtitleListManager) {
          this.#subtitleListManager.setBilingualSubtitles(this.#subtitles);
        }
      } else {
        logger.debug(`Youtube Provider: Chunk ${chunkNum} no subtitles.`);
      }

      // 引入轻微延时抖动以防请求触发高频流控
      await sleep(randomBetween(500, 1000));
    }

    logger.info("Youtube Provider: All subtitle chunks processed.");
  }

  #createNotificationElement() {
    const notificationEl = document.createElement("div");
    notificationEl.className = "kiss-notification";
    Object.assign(notificationEl.style, {
      position: "absolute",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0, 0, 0, 0.5)",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "8px",
      zIndex: "2147483647",
      opacity: "0",
      transition: "opacity 0.3s ease-in-out",
      pointerEvents: "none",
      fontSize: "16px",
      lineHeight: "1.4",
      width: "auto",
      maxWidth: "min(360px, calc(100% - 32px))",
      textAlign: "left",
      boxSizing: "border-box",
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    });

    const videoEl = this.#videoEl;
    const videoContainer = videoEl?.parentElement?.parentElement;
    if (videoContainer) {
      videoContainer.appendChild(notificationEl);
      this.#notificationEl = notificationEl;
    }
  }

  #hideNotification() {
    clearTimeout(this.#notificationTimeout);
    if (this.#notificationEl) {
      this.#notificationEl.style.opacity = "0";
    }
  }

  #showNotification(message, duration = 2000) {
    if (this.#setting.showLoadNotification === false) {
      this.#hideNotification();
      return;
    }

    if (!this.#notificationEl) this.#createNotificationElement();
    if (!this.#notificationEl) return;

    this.#notificationEl.textContent = message;
    this.#notificationEl.style.opacity = "1";
    clearTimeout(this.#notificationTimeout);
    this.#notificationTimeout = setTimeout(() => {
      this.#hideNotification();
    }, duration);
  }
}

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
