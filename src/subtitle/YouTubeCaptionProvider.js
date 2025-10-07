import { logger } from "../libs/log.js";
import { apiTranslate } from "../apis/index.js";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager.js";
import { getGlobalVariable } from "./globalVariable.js";
import { MSG_XHR_DATA_YOUTUBE } from "../config";
import { truncateWords } from "../libs/utils.js";
import { createLogoSvg } from "../libs/svg.js";

const VIDEO_SELECT = "#container video";
const CONTORLS_SELECT = ".ytp-right-controls";
const YT_CAPTION_SELECT = "#ytp-caption-window-container";

class YouTubeCaptionProvider {
  #setting = {};
  #videoId = "";
  #subtitles = [];
  #managerInstance = null;

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

  #injectToggleButton() {
    const controls = document.querySelector(CONTORLS_SELECT);
    if (!controls) {
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
    toggleButton.title = "Toggle Bilingual Subtitles";
    Object.assign(toggleButton.style, {
      color: "white",
      opacity: "0.8",
    });

    toggleButton.appendChild(createLogoSvg());
    kissControls.appendChild(toggleButton);

    toggleButton.onclick = () => {
      if (!this.#managerInstance) {
        logger.info(`Youtube Provider: Feature toggled ON.`);
        toggleButton.style.opacity = "1";
        this.#setting.enabled = true;
        this.#startManager();
      } else {
        logger.info(`Youtube Provider: Feature toggled OFF.`);
        toggleButton.style.opacity = "0.5";
        this.#setting.enabled = false;
        this.#destroyManager();
      }
    };

    controls.before(kissControls);
  }

  #findCaptionTrack(ytPlayer) {
    const captionTracks =
      ytPlayer?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    let captionTrack = captionTracks.find((item) => item.vssId === ".en");
    if (!captionTrack) {
      captionTrack = captionTracks.find((item) => item.vssId === "a.en");
    }
    return captionTrack;
  }

  async #getSubtitleEvents(captionTrack, potUrl, responseText) {
    if (potUrl.searchParams.get("lang") === captionTrack.languageCode) {
      try {
        return JSON.parse(responseText)?.events;
      } catch (err) {
        logger.error("parse responseText", err);
        return null;
      }
    }

    try {
      const baseUrl = new URL(captionTrack.baseUrl);
      baseUrl.searchParams.set("potc", potUrl.searchParams.get("potc"));
      baseUrl.searchParams.set("pot", potUrl.searchParams.get("pot"));
      baseUrl.searchParams.set("fmt", "json3");
      baseUrl.searchParams.set("c", potUrl.searchParams.get("c"));
      if (potUrl.searchParams.get("kind")) {
        baseUrl.searchParams.set("kind", potUrl.searchParams.get("kind"));
      }

      const res = await fetch(baseUrl);
      if (res.ok) {
        const json = await res.json();
        return json?.events;
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

  async #handleInterceptedRequest(url, responseText) {
    try {
      const ytPlayer = await getGlobalVariable("ytInitialPlayerResponse");
      const captionTrack = this.#findCaptionTrack(ytPlayer);
      if (!captionTrack) {
        logger.warn("Youtube Provider: CaptionTrack not found.");
        return;
      }

      const potUrl = new URL(url);
      const { videoId } = ytPlayer.videoDetails || {};
      if (videoId !== potUrl.searchParams.get("v")) {
        logger.info("Youtube Provider: skip other timedtext.");
        return;
      }

      if (videoId === this.#videoId) {
        logger.info("Youtube Provider: skip fetched timedtext.");
        return;
      }

      const subtitleEvents = await this.#getSubtitleEvents(
        captionTrack,
        potUrl,
        responseText
      );
      if (!subtitleEvents) {
        logger.warn("Youtube Provider: SubtitleEvents not got.");
        return;
      }

      this.#onCaptionsReady(videoId, subtitleEvents);
    } catch (error) {
      logger.error("Youtube Provider: unknow error", error);
    }
  }

  #onCaptionsReady(videoId, subtitleEvents) {
    this.#subtitles = this.#formatSubtitles(subtitleEvents);
    this.#videoId = videoId;

    this.#destroyManager();

    if (this.#setting.enabled) {
      this.#startManager();
    }
  }

  #startManager() {
    if (this.#managerInstance) {
      return;
    }

    const videoEl = document.querySelector(VIDEO_SELECT);
    if (!videoEl) {
      logger.warn("Youtube Provider: No video element found");
      return;
    }

    if (this.#subtitles?.length === 0) {
      // todo: 等待并给出用户提示
      logger.info("Youtube Provider: No subtitles");
      return;
    }

    logger.info("Youtube Provider: Starting manager...");

    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.display = "none");

    this.#managerInstance = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: this.#subtitles,
      translationService: apiTranslate,
      setting: this.#setting,
    });
    this.#managerInstance.start();
  }

  #destroyManager() {
    if (this.#managerInstance) {
      logger.info("Youtube Provider: Destroying manager...");

      const ytCaption = document.querySelector(YT_CAPTION_SELECT);
      ytCaption && (ytCaption.style.display = "block");

      this.#managerInstance.destroy();
      this.#managerInstance = null;
    }
  }

  // todo: 没有标点断句的处理
  #formatSubtitles(events) {
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
        if (currentLine && trimmedText && isEndOfSentence) {
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

    return lines.map((line) => ({
      ...line,
      duration: Math.max(0, line.end - line.start),
      text: truncateWords(line.text.trim().replace(/\s+/g, " "), 300),
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
