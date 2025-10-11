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

const VIDEO_SELECT = "#container video";
const CONTORLS_SELECT = ".ytp-right-controls";
const YT_CAPTION_SELECT = "#ytp-caption-window-container";

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

  constructor(setting = {}) {
    this.#setting = setting;
  }

  initialize() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data?.type === MSG_XHR_DATA_YOUTUBE) {
        const { url, response } = event.data;
        if (url && response) {
          this.#handleInterceptedRequest(url, response);
        }
      }
    });
    document.body.addEventListener("yt-navigate-finish", () => {
      setTimeout(() => {
        if (this.#toggleButton) {
          this.#toggleButton.style.opacity = "0.5";
        }
        this.#destroyManager();
        this.#doubleClick();
      }, 1000);
    });
    this.#waitForElement(CONTORLS_SELECT, () => this.#injectToggleButton());
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
    const button = this.#ytControls.querySelector(
      "button.ytp-subtitles-button"
    );
    if (button) {
      await sleep(randomBetween(50, 100));
      button.click();
      await sleep(randomBetween(500, 1000));
      button.click();
    }
  }

  #injectToggleButton() {
    this.#ytControls = document.querySelector(CONTORLS_SELECT);
    if (!this.#ytControls) {
      logger.warn("Youtube Provider: Could not find YouTube player controls.");
      return;
    }

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
        return;
      }

      if (!this.#enabled) {
        logger.info(`Youtube Provider: Feature toggled ON.`);
        this.#startManager();
      } else {
        logger.info(`Youtube Provider: Feature toggled OFF.`);
        this.#destroyManager();
      }
    };
    this.#toggleButton = toggleButton;
    this.#ytControls.before(kissControls);
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
      const subtitles = await apiSubtitle({
        videoId,
        chunkSign,
        fromLang,
        toLang,
        events,
        apiSetting: segApiSetting,
      });
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
    this.#isBusy = true; // todo: 提示用户等待中

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

      const flatEvents = this.#flatEvents(events);
      if (!flatEvents.length) return;

      const { segApiSetting, toLang } = this.#setting;
      const lang = potUrl.searchParams.get("lang");
      const fromLang =
        OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang) ||
        OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang.slice(0, 2)) ||
        "auto";

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

    if (this.#enabled) {
      this.#destroyManager();
      this.#startManager();
    }
  }

  #startManager() {
    if (this.#enabled || this.#managerInstance) {
      return;
    }
    this.#enabled = true;
    this.#toggleButton?.replaceChildren(createLogoSVG({ isSelected: true }));

    const videoEl = document.querySelector(VIDEO_SELECT);
    if (!videoEl) {
      logger.warn("Youtube Provider: No video element found");
      return;
    }

    const videoId = this.#getVideoId();
    if (!this.#subtitles?.length || this.#videoId !== videoId) {
      // todo: 等待并给出用户提示
      logger.info("Youtube Provider: No subtitles");
      this.#doubleClick();
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

    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.display = "none");
  }

  #destroyManager() {
    if (!this.#enabled) {
      return;
    }
    this.#enabled = false;
    this.#toggleButton?.replaceChildren(createLogoSVG());

    logger.info("Youtube Provider: Destroying manager...");

    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.display = "block");

    if (this.#managerInstance) {
      this.#managerInstance.destroy();
      this.#managerInstance = null;
    }
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
    if (isPoor) {
      subtitles = this.#processSubtitles({ flatEvents, usePause: true });
    }

    return subtitles;
  }

  #isQualityPoor(lines, lengthThreshold = 250, percentageThreshold = 0.1) {
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
        `Youtube Provider: Processing subtitle chunk ${chunkNum}/${chunks.length + 1}...`
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

      if (this.#videoId !== videoId) {
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
