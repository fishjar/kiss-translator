import { logger } from "../libs/log.js";
import { apiSubtitle, apiTranslate } from "../apis/index.js";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager.js";
import {
  MSG_XHR_DATA_YOUTUBE,
  APP_NAME,
  OPT_LANGS_TO_CODE,
  OPT_TRANS_MICROSOFT,
} from "../config";
import { sleep } from "../libs/utils.js";
import { createLogoSVG } from "../libs/svg.js";
import { randomBetween } from "../libs/utils.js";
import { newI18n } from "../config";

const VIDEO_SELECT = "#container video";
const CONTORLS_SELECT = ".ytp-right-controls";
const YT_CAPTION_SELECT = "#ytp-caption-window-container";
const YT_AD_SELECT = ".video-ads";

class YouTubeCaptionProvider {
  #setting = {};
  #videoId = "";
  #subtitles = [];
  #managerInstance = null;
  #toggleButton = null;
  #enabled = false;
  #ytControls = null;
  #isBusy = false;
  #fromLang = "auto";
  #notificationEl = null;
  #notificationTimeout = null;
  #i18n = () => "";

  constructor(setting = {}) {
    this.#setting = setting;
    this.#i18n = newI18n(setting.uiLang || "zh");
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
      setTimeout(() => {
        if (this.#toggleButton) {
          this.#toggleButton.style.opacity = "0.5";
        }
        this.#destroyManager();
        this.#doubleClick();
      }, 1000);
    });

    this.#waitForElement(CONTORLS_SELECT, (ytControls) =>
      this.#injectToggleButton(ytControls)
    );

    this.#waitForElement(YT_AD_SELECT, (adContainer) => {
      this.#moAds(adContainer);
    });
  }

  get #videoEl() {
    return document.querySelector(VIDEO_SELECT);
  }

  #moAds(adContainer) {
    const adLayoutSelector = ".ytp-ad-player-overlay-layout";
    const skipBtnSelector =
      ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern";
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const videoEl = this.#videoEl;
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.matches(adLayoutSelector)) {
              logger.debug("Youtube Provider: AD start playing!", node);
              // todo: 顺带把广告快速跳过
              if (videoEl) {
                videoEl.playbackRate = 16;
                videoEl.currentTime = videoEl.duration;
              }
              if (this.#managerInstance) {
                this.#managerInstance.setIsAdPlaying(true);
              }
            } else if (node.matches(skipBtnSelector)) {
              logger.debug("Youtube Provider: AD skip button!", node);
              node.click();
            }

            const skipBtn = node?.querySelector(skipBtnSelector);
            if (skipBtn) {
              logger.debug("Youtube Provider: AD skip button!!", skipBtn);
              skipBtn.click();
            }
          });
          mutation.removedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.matches(adLayoutSelector)) {
              logger.debug("Youtube Provider: Ad ends!");
              if (videoEl) {
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

  async #doubleClick() {
    const button = this.#ytControls?.querySelector(
      "button.ytp-subtitles-button"
    );
    if (button) {
      await sleep(randomBetween(50, 100));
      button.click();
      await sleep(randomBetween(500, 1000));
      button.click();
    }
  }

  #injectToggleButton(ytControls) {
    this.#ytControls = ytControls;

    const kissControls = document.createElement("div");
    kissControls.className = "kiss-bilingual-subtitle-controls";
    Object.assign(kissControls.style, {
      height: "100%",
    });

    const toggleButton = document.createElement("button");
    toggleButton.className =
      "ytp-button notranslate kiss-bilingual-subtitle-button";
    toggleButton.title = APP_NAME;
    Object.assign(toggleButton.style, {
      color: "white",
      opacity: "0.5",
    });

    toggleButton.appendChild(createLogoSVG());
    kissControls.appendChild(toggleButton);

    toggleButton.onclick = () => {
      if (this.#isBusy) {
        logger.info(`Youtube Provider: It's budy now...`);
        this.#showNotification(this.#i18n("subtitle_data_processing"));
      }

      if (!this.#enabled) {
        logger.info(`Youtube Provider: Feature toggled ON.`);
        this.#enabled = true;
        this.#toggleButton?.replaceChildren(
          createLogoSVG({ isSelected: true })
        );
        this.#startManager();
      } else {
        logger.info(`Youtube Provider: Feature toggled OFF.`);
        this.#enabled = false;
        this.#toggleButton?.replaceChildren(createLogoSVG());
        this.#destroyManager();
      }
    };
    this.#toggleButton = toggleButton;
    this.#ytControls?.prepend(kissControls);
  }

  #isSameLang(lang1, lang2) {
    return lang1.slice(0, 2) === lang2.slice(0, 2);
  }

  // todo: 优化逻辑
  #findCaptionTrack(captionTracks) {
    if (!captionTracks?.length) {
      return null;
    }

    let captionTrack = null;

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

    if (!captionTrack) {
      captionTrack = captionTracks.pop();
    }

    return captionTrack;
  }

  async #getCaptionTracks(videoId) {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const html = await fetch(url).then((r) => r.text());
      const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
      if (!match) return [];
      const data = JSON.parse(match[1]);
      return data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    } catch (err) {
      logger.info("Youtube Provider: get captionTracks", err);
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

  #getVideoId() {
    const docUrl = new URL(document.location.href);
    return docUrl.searchParams.get("v");
  }

  async #aiSegment({ videoId, fromLang, toLang, chunkEvents, segApiSetting }) {
    try {
      const events = chunkEvents.filter((item) => item.text);
      const chunkSign = `${events[0].start} --> ${events[events.length - 1].end}`;
      logger.debug("Youtube Provider: aiSegment events", {
        videoId,
        chunkSign,
        fromLang,
        toLang,
        events,
      });
      const subtitles = await apiSubtitle({
        videoId,
        chunkSign,
        fromLang,
        toLang,
        events,
        apiSetting: segApiSetting,
      });
      logger.debug("Youtube Provider: aiSegment subtitles", subtitles);
      if (Array.isArray(subtitles)) {
        return subtitles;
      }
    } catch (err) {
      logger.info("Youtube Provider: ai segmentation", err);
    }

    return [];
  }

  async #handleInterceptedRequest(url, responseText) {
    if (this.#isBusy) {
      logger.info("Youtube Provider is busy...");
      return;
    }
    this.#isBusy = true;

    try {
      const videoId = this.#getVideoId();
      if (!videoId) {
        logger.info("Youtube Provider: videoId not found.");
        return;
      }

      if (videoId === this.#videoId) {
        logger.info("Youtube Provider: videoId already processed.");
        return;
      }

      const potUrl = new URL(url);
      if (videoId !== potUrl.searchParams.get("v")) {
        logger.info("Youtube Provider: skip other timedtext.");
        return;
      }

      const { segApiSetting, toLang } = this.#setting;

      const captionTracks = await this.#getCaptionTracks(videoId);
      const captionTrack = this.#findCaptionTrack(captionTracks);
      if (!captionTrack) {
        logger.info("Youtube Provider: CaptionTrack not found.");
        return;
      }

      const capUrl = new URL(captionTrack.baseUrl);
      const events = await this.#getSubtitleEvents(
        capUrl,
        potUrl,
        responseText
      );
      if (!events?.length) {
        logger.info("Youtube Provider: SubtitleEvents not got.");
        return;
      }

      const lang = potUrl.searchParams.get("lang");
      const fromLang =
        OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang) ||
        OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang.slice(0, 2)) ||
        "auto";

      logger.debug(
        `Youtube Provider: fromLang: ${fromLang}, toLang: ${toLang}`
      );
      if (this.#isSameLang(fromLang, toLang)) {
        logger.info("Youtube Provider: skip same lang", fromLang, toLang);
        return;
      }

      this.#showNotification(this.#i18n("starting_to_process_subtitle"));

      const flatEvents = this.#flatEvents(events);
      if (!flatEvents.length) return;

      if (potUrl.searchParams.get("kind") === "asr" && segApiSetting) {
        logger.info("Youtube Provider: Starting AI ...");

        const eventChunks = this.#splitEventsIntoChunks(
          flatEvents,
          segApiSetting.chunkLength
        );
        const subtitlesFallback = () =>
          this.#formatSubtitles(flatEvents, fromLang);

        if (eventChunks.length === 0) {
          this.#onCaptionsReady({
            videoId,
            subtitles: subtitlesFallback(),
            fromLang,
            isInitialLoad: true,
          });
          return;
        }

        const firstChunkEvents = eventChunks[0];
        const firstBatchSubtitles = await this.#aiSegment({
          videoId,
          chunkEvents: firstChunkEvents,
          fromLang,
          toLang,
          segApiSetting,
        });

        if (!firstBatchSubtitles?.length) {
          this.#onCaptionsReady({
            videoId,
            subtitles: subtitlesFallback(),
            fromLang,
            isInitialLoad: true,
          });
          return;
        }

        this.#onCaptionsReady({
          videoId,
          subtitles: firstBatchSubtitles,
          fromLang,
          isInitialLoad: true,
        });

        if (eventChunks.length > 1) {
          const remainingChunks = eventChunks.slice(1);
          this.#processRemainingChunksAsync({
            chunks: remainingChunks,
            videoId,
            fromLang,
            toLang,
            segApiSetting,
          });
        }
      } else {
        const subtitles = this.#formatSubtitles(flatEvents, fromLang);
        if (!subtitles?.length) {
          logger.info("Youtube Provider: No subtitles after format.");
          return;
        }

        this.#onCaptionsReady({
          videoId,
          subtitles,
          fromLang,
          isInitialLoad: true,
        });
      }
    } catch (error) {
      logger.warn("Youtube Provider: unknow error", error);
      this.#showNotification(this.#i18n("subtitle_load_failed"));
    } finally {
      this.#isBusy = false;
    }
  }

  #onCaptionsReady({ videoId, subtitles, fromLang }) {
    this.#subtitles = subtitles;
    this.#videoId = videoId;
    this.#fromLang = fromLang;

    if (this.#toggleButton) {
      this.#toggleButton.style.opacity = subtitles.length ? "1" : "0.5";
    }

    this.#destroyManager();
    if (this.#enabled) {
      this.#startManager();
    } else {
      this.#showNotification(this.#i18n("subtitle_data_is_ready"));
    }
  }

  #startManager() {
    if (this.#managerInstance) {
      return;
    }

    const videoId = this.#getVideoId();
    if (!this.#subtitles?.length || this.#videoId !== videoId) {
      logger.info("Youtube Provider: No subtitles");
      this.#showNotification(this.#i18n("try_get_subtitle_data"));
      this.#doubleClick();
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
      translationService: apiTranslate,
      setting: { ...this.#setting, fromLang: this.#fromLang },
    });
    this.#managerInstance.start();

    this.#showNotification(this.#i18n("subtitle_load_succeed"));

    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.display = "none");
  }

  #destroyManager() {
    if (!this.#managerInstance) {
      return;
    }

    logger.info("Youtube Provider: Destroying manager...");

    this.#managerInstance.destroy();
    this.#managerInstance = null;

    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.display = "block");
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
      let currentLine = null;
      const MAX_LENGTH = 100;

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
    const isPoor = this.#isQualityPoor(subtitles);
    logger.debug("Youtube Provider: isQualityPoor", { isPoor, subtitles });
    if (isPoor) {
      subtitles = this.#processSubtitles({ flatEvents, usePause: true });
    }

    return subtitles;
  }

  #isQualityPoor(lines, lengthThreshold = 250, percentageThreshold = 0.2) {
    if (lines.length === 0) return false;
    const longLinesCount = lines.filter(
      (line) => line.text.length > lengthThreshold
    ).length;
    return longLinesCount / lines.length > percentageThreshold;
  }

  #processSubtitles({
    flatEvents,
    usePause = false,
    timeout = 1000,
    maxWords = 15,
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

  #flatEvents(events = []) {
    const segments = [];
    let buffer = null;

    events.forEach(({ segs = [], tStartMs = 0, dDurationMs = 0 }) => {
      segs.forEach(({ utf8 = "", tOffsetMs = 0 }, j) => {
        const text = utf8.trim().replace(/\s+/g, " ");
        const start = tStartMs + tOffsetMs;

        if (buffer) {
          if (!buffer.end || buffer.end > start) {
            buffer.end = start;
          }
          segments.push(buffer);
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

    segments.push(buffer);

    return segments;
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

  async #processRemainingChunksAsync({
    chunks,
    videoId,
    fromLang,
    toLang,
    segApiSetting,
  }) {
    logger.info(`Youtube Provider: Starting for ${chunks.length} chunks.`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkEvents = chunks[i];
      const chunkNum = i + 2;
      logger.info(
        `Youtube Provider: Processing subtitle chunk ${chunkNum}/${chunks.length + 1}: ${chunkEvents[0]?.start} --> ${chunkEvents[chunkEvents.length - 1]?.start}`
      );

      let subtitlesForThisChunk = [];

      try {
        const aiSubtitles = await this.#aiSegment({
          videoId,
          chunkEvents,
          fromLang,
          toLang,
          segApiSetting,
        });

        if (aiSubtitles?.length > 0) {
          subtitlesForThisChunk = aiSubtitles;
        } else {
          logger.info(
            `Youtube Provider: AI segmentation for chunk ${chunkNum} returned no data.`
          );
          subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
        }
      } catch (chunkError) {
        subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
      }

      if (this.#getVideoId() !== videoId) {
        logger.info("Youtube Provider: videoId changed!");
        break;
      }

      if (subtitlesForThisChunk.length > 0 && this.#managerInstance) {
        logger.info(
          `Youtube Provider: Appending ${subtitlesForThisChunk.length} subtitles from chunk ${chunkNum}.`
        );
        this.#managerInstance.appendSubtitles(subtitlesForThisChunk);
      } else {
        logger.info(`Youtube Provider: Chunk ${chunkNum} no subtitles.`);
      }

      await sleep(randomBetween(500, 1000));
    }

    logger.info("Youtube Provider: All subtitle chunks processed.");
  }

  #createNotificationElement() {
    const notificationEl = document.createElement("div");
    notificationEl.className = "kiss-notification";
    Object.assign(notificationEl.style, {
      position: "absolute",
      top: "40%",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.7)",
      color: "red",
      padding: "0.5em 1em",
      borderRadius: "4px",
      zIndex: "2147483647",
      opacity: "0",
      transition: "opacity 0.3s ease-in-out",
      pointerEvents: "none",
      fontSize: "2em",
      width: "50%",
      textAlign: "center",
    });

    const videoEl = this.#videoEl;
    const videoContainer = videoEl?.parentElement?.parentElement;
    if (videoContainer) {
      videoContainer.appendChild(notificationEl);
      this.#notificationEl = notificationEl;
    }
  }

  #showNotification(message, duration = 2000) {
    if (!this.#notificationEl) this.#createNotificationElement();
    this.#notificationEl.textContent = message;
    this.#notificationEl.style.opacity = "1";
    clearTimeout(this.#notificationTimeout);
    this.#notificationTimeout = setTimeout(() => {
      this.#notificationEl.style.opacity = "0";
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
