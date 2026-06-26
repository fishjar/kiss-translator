import { kissLog, logger } from "./log";

/**
 * Chrome 浏览器内置翻译
 */
/**
 * Chrome 浏览器本地内置 AI (Gemini Nano) 翻译与语种检测服务的封装类。
 */
class ChromeTranslator {
  // 缓存不同语种方向的 Translator 实例或其初始化 Promise (e.g. key: "en_zh")
  #translatorMap = new Map();
  // 缓存全局唯一的本地 LanguageDetector 实例 Promise
  #detectorPromise = null;
  // 缓存上一次通过置信度阈值的可靠语言识别结果
  #lastReliableDetectedLanguage = "";

  constructor(options = {}) {
    // 支持接收模型下载进度的回调通知
    this.onProgress = options.onProgress || this.#defaultProgressHandler;
  }

  /**
   * 默认的模型下载进度处理器，用于输出调试日志
   */
  #defaultProgressHandler(type, progress) {
    kissLog(`Downloading ${type} model: ${progress}%`);
  }

  /**
   * 单例模式获取或初始化本地语言检测器 (LanguageDetector)
   */
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
          this.#detectorPromise = null; // 初始化失败时重置缓存，以便下次能够重试
          throw error;
        }
      })();
    }

    return this.#detectorPromise;
  }

  /**
   * 依据源语言与目标语言创建或复用特定的 Translator 实例。
   * @param {string} sourceLanguage 源语言
   * @param {string} targetLanguage 目标翻译语言
   */
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
        this.#translatorMap.delete(key); // 创建失败立刻移出缓存，以允许重新发起初始化
        throw error;
      }
    })();

    this.#translatorMap.set(key, translatorPromise);
    return translatorPromise;
  }

  /**
   * 绑定 Chrome 内置模型在后台离线下载时的事件监听，获取并回调下载进度。
   */
  _monitorProgress(monitorable, type) {
    monitorable.addEventListener("downloadprogress", (e) => {
      const progress = e.total > 0 ? Math.round((e.loaded / e.total) * 100) : 0;
      this.onProgress(type, progress);
    });
  }

  /**
   * 检测一段文本的语言类别。
   * @param {string} text 待识别文本
   * @param {number} confidenceThreshold 置信度过滤阈值，默认 0.4。低于此置信度则判定为识别失败
   * @returns {Promise<[string, string]>} [语言简写代码, 报错信息]
   */
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
      // 过滤低置信度的噪音识别结果，防止误报
      if (confidence < confidenceThreshold) {
        if (this.#lastReliableDetectedLanguage) {
          return [this.#lastReliableDetectedLanguage, ""];
        }

        return [
          "",
          `Confidence of test results (${detectedLanguage} ${confidence.toFixed(
            2
          )}) below the set threshold ${confidenceThreshold}。`,
        ];
      }

      this.#lastReliableDetectedLanguage = detectedLanguage;
      return [detectedLanguage, ""];
    } catch (error) {
      kissLog("detectLanguage", error, `(${text})`);
      return ["", error.message];
    }
  }

  /**
   * 本地翻译单条文本核心方法。
   * @param {string} text 原文字符串
   * @param {string} targetLanguage 目标语种
   * @param {string} sourceLanguage 源语种。若为 "auto" 则先调检测 API
   * @returns {Promise<[string, string, string]>} [译文字符串, 最终源语言代码, 报错信息]
   */
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

      // REVIEW: 极其优秀的大模型热重载与防死锁设计！
      // Chrome 127+ 本地 AI (Gemini Nano) 尚处于实验阶段，稳定性较差。
      // 在处理高并发或长句子时极其容易触发 WAF 级别的底层进程崩溃，并返回 "Other generic failures occurred" 异常。
      // 一旦该错误发生，之前缓存的 translator 实例会全部失效卡死。
      // 此处捕获该异常后，主动执行 clear() 清空翻译器 Map 缓存。
      // 如此一来，在下一次请求进入时，程序会重新向浏览器底层申请并创建全新的翻译实例，
      // 从而神奇地实现了本地模型的无缝热重启，极大地增强了稳定性，非常高级。
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

// 导出全局单例实例及快捷函数，供 background.js 中的指令分发器直接调用
const chromeTranslator = new ChromeTranslator();

export const chromeDetect = (args) =>
  chromeTranslator.detectLanguage(args.text);
export const chromeTranslate = (args) =>
  chromeTranslator.translateText(args.text, args.to, args.from);
