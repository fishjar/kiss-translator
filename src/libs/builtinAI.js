import { kissLog, logger } from "./log";

/**
 * Chrome 浏览器内置翻译
 */
class ChromeTranslator {
  #translatorMap = new Map();
  #detectorPromise = null;

  constructor(options = {}) {
    this.onProgress = options.onProgress || this.#defaultProgressHandler;
  }

  #defaultProgressHandler(type, progress) {
    kissLog(`Downloading ${type} model: ${progress}%`);
  }

  #getDetectorPromise() {
    if (!this.#detectorPromise) {
      this.#detectorPromise = (async () => {
        try {
          const availability = await LanguageDetector.availability();
          if (availability === "unavailable") {
            throw new Error("LanguageDetector unavailable");
          }

          return await LanguageDetector.create({
            monitor: (m) => this._monitorProgress(m, "detector"),
          });
        } catch (error) {
          this.#detectorPromise = null;
          throw error;
        }
      })();
    }

    return this.#detectorPromise;
  }

  #createTranslator(sourceLanguage, targetLanguage) {
    const key = `${sourceLanguage}_${targetLanguage}`;
    if (this.#translatorMap.has(key)) {
      return this.#translatorMap.get(key);
    }

    const translatorPromise = (async () => {
      try {
        const avail = await Translator.availability({
          sourceLanguage,
          targetLanguage,
        });
        if (avail === "unavailable") {
          throw new Error(
            `Translator ${sourceLanguage}_${targetLanguage} unavailable`
          );
        }

        const translator = await Translator.create({
          sourceLanguage,
          targetLanguage,
          monitor: (m) => this._monitorProgress(m, `translator (${key})`),
        });
        this.#translatorMap.set(key, translator);

        return translator;
      } catch (error) {
        this.#translatorMap.delete(key);
        throw error;
      }
    })();

    this.#translatorMap.set(key, translatorPromise);
    return translatorPromise;
  }

  _monitorProgress(monitorable, type) {
    monitorable.addEventListener("downloadprogress", (e) => {
      const progress = e.total > 0 ? Math.round((e.loaded / e.total) * 100) : 0;
      this.onProgress(type, progress);
    });
  }

  async detectLanguage(text, confidenceThreshold = 0.4) {
    if (!text) {
      return ["", "Input text cannot be empty."];
    }

    try {
      const detector = await this.#getDetectorPromise();
      const results = await detector.detect(text);

      if (!results || results.length === 0) {
        return ["", "No language could be detected."];
      }

      const { detectedLanguage, confidence } = results[0];
      if (confidence < confidenceThreshold) {
        return [
          "",
          `Confidence of test results (${detectedLanguage} ${confidence.toFixed(
            2
          )}) below the set threshold ${confidenceThreshold}。`,
        ];
      }

      return [detectedLanguage, ""];
    } catch (error) {
      kissLog("detectLanguage", error, `(${text})`);
      return ["", error.message];
    }
  }

  async translateText(text, targetLanguage, sourceLanguage = "auto") {
    if (!text || !targetLanguage || typeof text !== "string") {
      return ["", sourceLanguage, "Input text cannot be empty."];
    }

    try {
      let finalSourceLanguage = sourceLanguage;
      if (sourceLanguage === "auto") {
        const [detectedLanguage, detectionError] =
          await this.detectLanguage(text);
        if (detectionError || !detectedLanguage) {
          const reason =
            detectionError || "Unable to determine source language.";
          return [
            "",
            finalSourceLanguage,
            `Automatic detection of source language failed: ${reason}`,
          ];
        }
        finalSourceLanguage = detectedLanguage;
      }

      if (finalSourceLanguage === targetLanguage) {
        return ["", finalSourceLanguage, "Same lang"];
      }

      const translator = await this.#createTranslator(
        finalSourceLanguage,
        targetLanguage
      );
      const translatedText = await translator.translate(text);

      return [translatedText, finalSourceLanguage, ""];
    } catch (error) {
      kissLog("translateText", error, `(${text})`);

      if (
        error &&
        error.message &&
        error.message.includes("Other generic failures occurred")
      ) {
        logger.info("Generic failure detected, resetting translator cache.");
        this.#translatorMap.clear();
      }

      return ["", sourceLanguage, error.message];
    }
  }
}

const chromeTranslator = new ChromeTranslator();

export const chromeDetect = (args) =>
  chromeTranslator.detectLanguage(args.text);
export const chromeTranslate = (args) =>
  chromeTranslator.translateText(args.text, args.to, args.from);
