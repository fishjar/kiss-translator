import { logger } from "../libs/log.js";
import { apiTranslate } from "../apis/index.js";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager.js";
import { MSG_XHR_DATA_YOUTUBE, APP_NAME } from "../config";
import { truncateWords, sleep } from "../libs/utils.js";
import { createLogoSvg } from "../libs/svg.js";
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

  constructor(setting = {}) {
    this.#setting = setting;
  }

  initialize() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data?.type === MSG_XHR_DATA_YOUTUBE) {
        const { url, response } = event.data;
        this.#handleInterceptedRequest(url, response);
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

    toggleButton.appendChild(createLogoSvg());
    kissControls.appendChild(toggleButton);

    toggleButton.onclick = () => {
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

  #findCaptionTrack(captionTracks) {
    let captionTrack = captionTracks.find((item) =>
      item.vssId?.startsWith(".en")
    );
    if (!captionTrack) {
      captionTrack = captionTracks.find((item) =>
        item.vssId?.startsWith("a.en")
      );
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
      return (
        data.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
      );
    } catch (err) {
      logger.info("Youtube Provider: get captionTracks", err);
    }
  }

  async #getSubtitleEvents(captionTrack, potUrl, responseText) {
    if (potUrl.searchParams.get("lang") === captionTrack.languageCode) {
      try {
        return JSON.parse(responseText);
      } catch (err) {
        logger.error("Youtube Provider: parse responseText", err);
        return null;
      }
    }

    try {
      const baseUrl = new URL(captionTrack.baseUrl);
      potUrl.searchParams.set("lang", baseUrl.searchParams.get("lang"));
      potUrl.searchParams.set("fmt", "json3");
      if (baseUrl.searchParams.get("kind")) {
        potUrl.searchParams.set("kind", baseUrl.searchParams.get("kind"));
      } else {
        potUrl.searchParams.delete("kind");
      }

      const res = await fetch(potUrl);
      if (res.ok) {
        const json = await res.json();
        return json;
      }
      logger.error(
        `Youtube Provider: Failed to fetch subtitles: ${res.status}`
      );
      return null;
    } catch (error) {
      logger.error("Youtube Provider: fetching subtitles error", error);
      return null;
    }
  }

  #getVideoId() {
    const docUrl = new URL(document.location.href);
    return docUrl.searchParams.get("v");
  }

  async #handleInterceptedRequest(url, responseText) {
    try {
      if (!responseText) {
        return;
      }

      const videoId = this.#getVideoId();
      if (!videoId) {
        logger.info("Youtube Provider: can't get doc videoId");
        return;
      }

      if (videoId === this.#videoId) {
        logger.info("Youtube Provider: skip fetched timedtext.");
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

      const subtitleEvents = await this.#getSubtitleEvents(
        captionTrack,
        potUrl,
        responseText
      );
      if (!subtitleEvents) {
        logger.info("Youtube Provider: SubtitleEvents not got.");
        return;
      }

      const subtitles = this.#formatSubtitles(subtitleEvents);
      if (subtitles.length === 0) {
        logger.info("Youtube Provider: No subtitles after format.");
        return;
      }

      this.#onCaptionsReady(videoId, subtitles);
    } catch (error) {
      logger.warn("Youtube Provider: unknow error", error);
    }
  }

  #onCaptionsReady(videoId, subtitles) {
    this.#subtitles = subtitles;
    this.#videoId = videoId;

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
    this.#toggleButton?.replaceChildren(createLogoSvg({ isSelected: true }));

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
      setting: this.#setting,
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
    this.#toggleButton?.replaceChildren(createLogoSvg());

    logger.info("Youtube Provider: Destroying manager...");

    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.display = "block");

    if (this.#managerInstance) {
      this.#managerInstance.destroy();
      this.#managerInstance = null;
    }
  }

  #formatSubtitles(data) {
    const events = data?.events;
    if (!Array.isArray(events)) return [];

    const lines = [];
    let currentLine = null;

    events.forEach((event) => {
      (event.segs ?? []).forEach((seg, segIndex) => {
        const text = seg.utf8 ?? "";
        const trimmedText = text.trim();
        const segmentStartTime = event.tStartMs + (seg.tOffsetMs ?? 0);

        if (currentLine) {
          if (currentLine.text.endsWith(",") && !text.startsWith(" ")) {
            currentLine.text += " ";
          }
          currentLine.text += text.replaceAll("\n", " ");
        } else if (trimmedText) {
          if (lines.length > 0) {
            const prevLine = lines[lines.length - 1];
            if (!prevLine.end) {
              prevLine.end = segmentStartTime;
            }
          }
          currentLine = {
            text: text.replaceAll("\n", " "),
            start: segmentStartTime,
            end: 0,
          };
        }

        const isEndOfSentence = /[.?!\]]$/.test(trimmedText);
        const isEnoughLong =
          (currentLine?.text.length ?? 0) > 50 && /[,]\s*$/.test(trimmedText);
        if (currentLine && trimmedText && (isEndOfSentence || isEnoughLong)) {
          const isLastSegmentInEvent =
            segIndex === (event.segs?.length ?? 0) - 1;
          if (isLastSegmentInEvent && event.dDurationMs) {
            currentLine.end = event.tStartMs + event.dDurationMs;
          }
          lines.push(currentLine);
          currentLine = null;
        }
      });
    });

    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (!lastLine.end) {
        const lastMeaningfulEvent = [...events]
          .reverse()
          .find((e) => e.dDurationMs);
        if (lastMeaningfulEvent) {
          lastLine.end =
            lastMeaningfulEvent.tStartMs + lastMeaningfulEvent.dDurationMs;
        }
      }
    }

    const isPoor = this.#isQualityPoor(lines);
    if (isPoor) {
      return this.#processSubtitles(data);
    }

    return lines.map((item) => ({
      ...item,
      duration: Math.max(0, item.end - item.start),
      text: truncateWords(item.text.trim().replace(/\s+/g, " "), 250),
    }));
  }

  #isQualityPoor(lines, lengthThreshold = 250, percentageThreshold = 0.1) {
    if (lines.length === 0) return false;
    const longLinesCount = lines.filter(
      (line) => line.text.length > lengthThreshold
    ).length;
    return longLinesCount / lines.length > percentageThreshold;
  }

  #processSubtitles(data, { timeout = 1500, maxWords = 15 } = {}) {
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

    const joinSegs = (segs) => ({
      text: segs
        .map((s) => s.text)
        .join(" ")
        .trim(),
      start: segs[0].start,
      end: segs[segs.length - 1].end,
    });

    const flushBuffer = () => {
      if (currentBuffer.length > 0) {
        sentences.push(joinSegs(currentBuffer));
      }
      currentBuffer = [];
      bufferWordCount = 0;
    };

    data.events?.forEach((event) => {
      event.segs?.forEach((seg, j) => {
        const text = seg.utf8?.trim() || "";
        if (!text) return;

        const start = event.tStartMs + (seg.tOffsetMs ?? 0);
        const lastSegment = currentBuffer[currentBuffer.length - 1];

        if (lastSegment) {
          if (!lastSegment.end) {
            lastSegment.end = start;
          }

          const isEndOfSentence = /[.?!\]]$/.test(lastSegment.text);
          const isTimeout = start - lastSegment.end > timeout;
          const isWordLimitExceeded = bufferWordCount >= maxWords;
          const startsWithPauseWord = groupedPauseWords["1"].has(
            text.toLowerCase().split(" ")[0]
          );

          // todo: 考虑连词开头
          const isNewClause =
            (startsWithPauseWord && currentBuffer.length > 1) ||
            text.startsWith("[");

          if (
            isEndOfSentence ||
            isTimeout ||
            isWordLimitExceeded ||
            isNewClause
          ) {
            flushBuffer();
          }
        }

        const currentSegment = { text, start };
        if (j === event.segs.length - 1) {
          currentSegment.end = event.tStartMs + event.dDurationMs;
        }

        currentBuffer.push(currentSegment);
        bufferWordCount += text.split(/\s+/).length;
      });
    });

    flushBuffer();

    return sentences.map((item) => ({
      ...item,
      duration: item.end - item.start,
    }));
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
