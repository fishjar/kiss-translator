import { logger } from "../libs/log.js";
import { randomBetween, sleep } from "../libs/utils.js";
import { resolveApiPromptSettings } from "../config/prompt.js";
import { splitEventsIntoChunks } from "./youtubeSubtitleProcessing.js";

/**
 * YouTube 字幕 AI 分段层。
 * 负责把展平后的字幕分块提交给断句 API，并通过回调把后续分块增量交还给 provider 渲染。
 */

/**
 * 提取相邻字幕分块的简短上下文，辅助 AI 断句保持语义连续。
 *
 * @param {Array<Array<object>>} chunks 已切分的字幕事件分块。
 * @param {number} chunkIndex 当前分块索引。
 * @param {"prev"|"next"} side 提取前一块或后一块上下文。
 * @param {number} [maxEvents=3] 最多取用的相邻事件数量。
 * @param {number} [maxChars=240] 输出上下文最大字符数。
 * @returns {string} 清洗后的上下文文本。
 */
export function getChunkContext(
  chunks,
  chunkIndex,
  side,
  maxEvents = 3,
  maxChars = 240
) {
  const NON_SPEECH_RE = /^\[.+\]$/i;
  const adj = side === "prev" ? chunks[chunkIndex - 1] : chunks[chunkIndex + 1];
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

/**
 * 通过大模型 AI 接口对字幕切片事件流进行“智能断句”与“辅助翻译”。
 *
 * 设计要点：
 * 1. 预先剥离 `[Music]`、`[Laughter]` 等非语音事件，节省 Token 并避免直译混淆。
 * 2. 对 AI 响应尾部遗漏进行一次 Tail Retry，降低流式截断导致的尾句丢失。
 * 3. 当断句 API 与正式翻译 API 不一致时，清空断句模型返回的 translation，交给后续翻译流程处理。
 *
 * @param {object} param0 参数对象。
 * @param {string} param0.videoId 当前视频 ID。
 * @param {string} param0.fromLang 字幕源语言代码。
 * @param {string} param0.toLang 目标翻译语言代码。
 * @param {Array<object>} param0.chunkEvents 当前 AI 分块内的字幕事件。
 * @param {object} param0.segApiSetting 断句 API 配置。
 * @param {Function} param0.apiSubtitle 调用字幕断句 API 的函数。
 * @param {object} param0.docInfo 页面与 AI 上下文信息。
 * @param {Function} param0.formatSubtitles AI 失败时的内置格式化降级函数。
 * @param {boolean} param0.clearSegmentTranslation 是否清空断句 API 返回的翻译字段。
 * @param {string} [param0.prevContext=""] 前一分块的简短上下文。
 * @param {string} [param0.nextContext=""] 后一分块的简短上下文。
 * @param {Function} [param0.onSubtitleChunk] AI 流式返回完整句子时的增量回调。
 * @param {AbortSignal} [param0.signal] 当前字幕处理生命周期的取消信号。
 * @returns {Promise<Array<object>>} AI 断句后的字幕条目；失败时返回可保留的非语音条目。
 */
export async function aiSegment({
  videoId,
  fromLang,
  toLang,
  chunkEvents,
  segApiSetting,
  apiSubtitle,
  docInfo,
  formatSubtitles,
  clearSegmentTranslation,
  prevContext = "",
  nextContext = "",
  onSubtitleChunk,
  signal,
  setting,
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
    const chunkSign = `${speechEvents[0].start} --> ${
      speechEvents[speechEvents.length - 1].end
    }`;
    logger.debug("Youtube Provider: aiSegment events", {
      videoId,
      chunkSign,
      fromLang,
      toLang,
      speechEvents,
    });

    const resolvedSegApiSetting = resolveApiPromptSettings(
      segApiSetting,
      setting?.prompts,
      setting
    );

    const subtitles = await apiSubtitle({
      videoId,
      chunkSign,
      fromLang,
      toLang,
      events: speechEvents,
      apiSetting: resolvedSegApiSetting,
      docInfo,
      prevContext,
      nextContext,
      signal,
      onSubtitleChunk: ({ subtitles }) => {
        if (!subtitles?.length || !onSubtitleChunk) return;

        const streamedSubtitles = clearSegmentTranslation
          ? subtitles.map((sub) => ({ ...sub, _isDraftTranslation: true }))
          : subtitles;
        // 字幕断句流式回调只上抛已经闭合的完整句子，避免半句扰乱播放器时间轴。
        onSubtitleChunk({ subtitles: streamedSubtitles });
      },
    });
    logger.debug("Youtube Provider: aiSegment subtitles", subtitles);
    if (Array.isArray(subtitles) && subtitles.length) {
      let result = subtitles;
      if (clearSegmentTranslation) {
        result = subtitles.map((sub) => ({
          ...sub,
          _isDraftTranslation: true,
        }));
      }

      const maxEi = Math.max(...result.map((s) => s._ei ?? -1));

      if (maxEi >= 0 && maxEi < speechEvents.length - 1) {
        const tailEvents = speechEvents.slice(maxEi + 1);
        if (tailEvents.length <= speechEvents.length * 0.5) {
          try {
            const tailSign = `${tailEvents[0].start} --> ${
              tailEvents[tailEvents.length - 1].end
            }`;
            const lastResultText = result[result.length - 1]?.text || "";

            const tailSubs = await apiSubtitle({
              videoId,
              chunkSign: tailSign,
              fromLang,
              toLang,
              events: tailEvents,
              apiSetting: resolvedSegApiSetting,
              docInfo,
              prevContext: [prevContext, lastResultText]
                .filter(Boolean)
                .join(" "),
              nextContext,
              signal,
            });

            if (tailSubs?.length) {
              let processedTailSubs = tailSubs;
              if (clearSegmentTranslation) {
                processedTailSubs = processedTailSubs.map((sub) => ({
                  ...sub,
                  _isDraftTranslation: true,
                }));
              }
              result = [...result, ...processedTailSubs];
            } else {
              result = [...result, ...formatSubtitles(tailEvents, fromLang)];
            }
          } catch {
            result = [...result, ...formatSubtitles(tailEvents, fromLang)];
          }
        }
      }

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

  return [
    ...formatSubtitles(speechEvents, fromLang),
    ...nonSpeechEvents.map(toStandaloneSub),
  ].sort((a, b) => a.start - b.start);
}

/**
 * 将 YouTube 原始字幕事件转换为可渲染字幕条目。
 * AI 模式下优先处理首块以便尽快出字幕，剩余块在后台增量处理。
 *
 * @param {object} param0 参数对象。
 * @param {string} param0.videoId 当前视频 ID。
 * @param {Array<object>} param0.events 清洗后的 YouTube json3 events。
 * @param {Array<object>} param0.flatEvents 展平后的字幕事件流。
 * @param {string} param0.fromLang 字幕源语言代码。
 * @param {object} param0.setting 字幕模块配置。
 * @param {number} param0.processingVersion 当前异步处理版本快照。
 * @param {Function} param0.isStaleProcessing 检查当前异步任务是否过期。
 * @param {Function} param0.showNotification 展示处理进度通知。
 * @param {Function} param0.i18n 国际化文案函数。
 * @param {Function} param0.apiSubtitle 调用字幕断句 API 的函数。
 * @param {object} param0.docInfo 页面与 AI 上下文信息。
 * @param {Function} param0.builtinSegment 内置断句降级函数。
 * @param {Function} param0.formatSubtitles 内置规则格式化函数。
 * @param {Function} param0.onAppendSubtitles 后台分块完成时的增量回调。
 * @param {Function} param0.getCurrentVideoId 读取当前页面视频 ID 的函数，用于二次竞态检查。
 * @param {AbortSignal} [param0.signal] 当前字幕处理生命周期的取消信号。
 * @returns {Promise<[Array<object>, number]>} 字幕条目数组与处理进度百分比。
 */
export async function eventsToSubtitles({
  videoId,
  events,
  flatEvents,
  fromLang,
  setting,
  processingVersion,
  isStaleProcessing,
  showNotification,
  i18n,
  apiSubtitle,
  docInfo,
  builtinSegment,
  formatSubtitles,
  onAppendSubtitles,
  getCurrentVideoId,
  signal,
}) {
  const { segSlug, transApis, chunkLength, toLang } = setting;

  const segApiSetting = transApis?.find((api) => api.apiSlug === segSlug);
  const useAiSegmentation = segSlug && segSlug !== "-" && segApiSetting;
  const shouldClearSegmentTranslation =
    setting.forceSubtitleRetranslate &&
    segApiSetting?.apiSlug !== setting.apiSlug;

  // 断句策略仅由用户配置的 segSlug 决定；kind 只负责定位用户实际选择的字幕轨道。
  if (useAiSegmentation) {
    if (isStaleProcessing(processingVersion)) return [[], 0];
    logger.info("Youtube Provider: Starting AI segmentation...");
    showNotification(i18n("ai_processing_pls_wait"));

    const eventChunks = splitEventsIntoChunks(flatEvents, chunkLength);

    if (eventChunks.length === 0) {
      logger.info("Youtube Provider: AI no chunks, falling back to built-in");
      return [builtinSegment(events, flatEvents, fromLang, setting), 100];
    }

    const firstChunkEvents = eventChunks[0];
    const firstChunkProgressed = Math.floor(100 / eventChunks.length);
    const firstBatchSubtitles = await aiSegment({
      videoId,
      chunkEvents: firstChunkEvents,
      fromLang,
      toLang,
      segApiSetting,
      apiSubtitle,
      docInfo,
      formatSubtitles,
      clearSegmentTranslation: shouldClearSegmentTranslation,
      prevContext: "",
      nextContext: getChunkContext(eventChunks, 0, "next"),
      signal,
      setting,
      onSubtitleChunk: ({ subtitles }) => {
        if (
          !subtitles?.length ||
          isStaleProcessing(processingVersion) ||
          videoId !== getCurrentVideoId()
        ) {
          return;
        }

        // 首块也允许按句增量上屏，让用户不必等待整个 AI chunk 完整返回。
        onAppendSubtitles({
          subtitles,
          progressed: firstChunkProgressed,
          chunkNum: 1,
        });
      },
    });
    if (isStaleProcessing(processingVersion)) return [[], 0];

    if (!firstBatchSubtitles?.length) {
      logger.info("Youtube Provider: AI failed, falling back to built-in");
      return [builtinSegment(events, flatEvents, fromLang, setting), 100];
    }

    logger.info("Youtube Provider: Sentence break mode: AI");
    if (eventChunks.length === 1) {
      return [firstBatchSubtitles, 100];
    }

    const scheduler = createAiChunkScheduler({
      chunks: eventChunks,
      firstDoneIndex: 0,
      videoId,
      fromLang,
      toLang,
      segApiSetting,
      setting,
      processingVersion,
      isStaleProcessing,
      apiSubtitle,
      docInfo,
      formatSubtitles,
      clearSegmentTranslation: shouldClearSegmentTranslation,
      onAppendSubtitles,
      getCurrentVideoId,
      signal,
    });

    const processed = Math.floor(100 / eventChunks.length);
    return [firstBatchSubtitles, processed, scheduler];
  }

  return [builtinSegment(events, flatEvents, fromLang, setting), 100];
}

/**
 * 创建按播放窗口懒处理 AI 字幕块的调度器。
 *
 * 该调度器只负责首块之后的 AI 断句 chunk：外层会先处理首块以保证字幕尽快上屏，
 * 后续 chunk 只有进入播放器当前时间 + `preTrans` 的前瞻窗口时才会请求 AI，避免长视频
 * 在用户尚未观看的位置提前消耗大量 token。
 *
 * @param {object} params 调度器依赖与运行上下文。
 * @param {Array<Array<object>>} params.chunks 按字幕文本长度切好的 AI 断句 chunk 列表。
 * @param {number} [params.firstDoneIndex=-1] 已由首屏流程处理完成的 chunk 索引。
 * @param {string} params.videoId 当前 YouTube 视频 ID，用于丢弃跨视频的过期回调。
 * @param {string} params.fromLang 原字幕语言代码。
 * @param {string} params.toLang 目标翻译语言代码。
 * @param {object} params.segApiSetting AI 断句接口配置。
 * @param {object} params.setting 字幕模块完整配置。
 * @param {number} params.processingVersion 当前字幕处理生命周期版本号。
 * @param {Function} params.isStaleProcessing 判断当前异步任务是否已经过期。
 * @param {Function} params.apiSubtitle 调用 AI 断句接口的函数。
 * @param {object} params.docInfo 页面/视频上下文信息。
 * @param {Function} params.formatSubtitles AI 断句失败时的内置降级断句函数。
 * @param {boolean} params.clearSegmentTranslation 是否清空 AI 断句返回的翻译，交给后续翻译服务重翻。
 * @param {Function} params.onAppendSubtitles chunk 完成或流式返回时合并字幕的回调。
 * @param {Function} params.getCurrentVideoId 读取当前页面视频 ID 的函数。
 * @param {AbortSignal} [params.signal] 当前字幕处理生命周期的取消信号。
 * @returns {{scheduleUntil: Function}} 返回按播放窗口调度后续 chunk 的控制对象。
 */
export function createAiChunkScheduler({
  chunks,
  firstDoneIndex = -1,
  videoId,
  fromLang,
  toLang,
  segApiSetting,
  setting,
  processingVersion,
  isStaleProcessing,
  apiSubtitle,
  docInfo,
  formatSubtitles,
  clearSegmentTranslation,
  onAppendSubtitles,
  getCurrentVideoId,
  signal,
}) {
  const states = chunks.map(() => "pending");
  if (firstDoneIndex >= 0) states[firstDoneIndex] = "done";

  let active = false;
  let latestWindow = null;

  /**
   * 根据 chunk 状态计算处理进度。
   * failed 也视为已结束，因为失败 chunk 会立即降级为内置断句，不应阻塞下载和菜单状态。
   *
   * @returns {number} 当前已处理或已降级的 chunk 百分比。
   */
  const getProgressed = () => {
    const doneCount = states.filter(
      (state) => state === "done" || state === "failed"
    ).length;
    return Math.floor((doneCount * 100) / chunks.length);
  };

  /**
   * 判断 chunk 时间轴是否与当前播放前瞻窗口有交集。
   *
   * @param {Array<object>} chunkEvents 当前候选 chunk 内的字幕事件。
   * @param {number} currentTimeMs 播放器当前时间，单位毫秒。
   * @param {number} endTimeMs 播放器当前时间加前瞻窗口后的结束时间，单位毫秒。
   * @returns {boolean} chunk 是否落入需要提前 AI 断句的时间范围。
   */
  const isChunkInWindow = (chunkEvents, currentTimeMs, endTimeMs) => {
    const first = chunkEvents[0];
    const last = chunkEvents[chunkEvents.length - 1];
    if (!first || !last) return false;
    return last.end >= currentTimeMs && first.start <= endTimeMs;
  };

  /**
   * 从最新播放窗口中选择下一个仍未处理的 chunk。
   * 使用最新窗口可以让 seek 后的新位置优先处理，而不是继续排空旧窗口。
   *
   * @returns {number} 下一个待处理 chunk 索引；没有可处理 chunk 时返回 -1。
   */
  const findNextChunkIndex = () => {
    if (!latestWindow) return -1;
    const { currentTimeMs, endTimeMs } = latestWindow;
    return chunks.findIndex(
      (chunkEvents, index) =>
        states[index] === "pending" &&
        isChunkInWindow(chunkEvents, currentTimeMs, endTimeMs)
    );
  };

  /**
   * 处理单个 AI 断句 chunk，并把结果增量合并回 provider。
   * AI 失败时立即使用内置断句降级，保证当前窗口内仍有可显示/可下载的字幕。
   *
   * @param {number} index 需要处理的 chunk 索引。
   * @returns {Promise<void>}
   */
  const processChunk = async (index) => {
    if (isStaleProcessing(processingVersion)) {
      logger.info("Youtube Provider: Skip stale chunk processing.");
      return;
    }

    const chunkEvents = chunks[index];
    const chunkNum = index + 1;
    states[index] = "processing";
    logger.debug(
      `Youtube Provider: Processing subtitle chunk ${chunkNum}/${chunks.length}: ${chunkEvents[0]?.start} --> ${
        chunkEvents[chunkEvents.length - 1]?.start
      }`
    );

    let subtitlesForThisChunk = [];

    try {
      const aiSubtitles = await aiSegment({
        videoId,
        chunkEvents,
        fromLang,
        toLang,
        segApiSetting,
        apiSubtitle,
        docInfo,
        formatSubtitles,
        clearSegmentTranslation,
        prevContext: getChunkContext(chunks, index, "prev"),
        nextContext: getChunkContext(chunks, index, "next"),
        signal,
        setting,
        onSubtitleChunk: ({ subtitles }) => {
          if (
            !subtitles?.length ||
            videoId !== getCurrentVideoId() ||
            isStaleProcessing(processingVersion)
          ) {
            return;
          }

          onAppendSubtitles({
            subtitles,
            progressed: getProgressed(),
            chunkNum,
          });
        },
      });
      if (isStaleProcessing(processingVersion)) return;

      if (aiSubtitles?.length > 0) {
        subtitlesForThisChunk = aiSubtitles;
      } else {
        logger.debug(
          `Youtube Provider: AI segmentation for chunk ${chunkNum} returned no data.`
        );
        subtitlesForThisChunk = formatSubtitles(chunkEvents, fromLang);
      }
    } catch (chunkError) {
      states[index] = "failed";
      subtitlesForThisChunk = formatSubtitles(chunkEvents, fromLang);
    }

    if (
      videoId !== getCurrentVideoId() ||
      isStaleProcessing(processingVersion)
    ) {
      logger.info(
        "Youtube Provider: videoId changed or track replaced!",
        videoId,
        getCurrentVideoId()
      );
      return;
    }

    if (states[index] !== "failed") {
      states[index] = "done";
    }

    if (subtitlesForThisChunk.length > 0) {
      const progressed = getProgressed();
      logger.debug(
        `Youtube Provider: Appending ${subtitlesForThisChunk.length} subtitles from chunk ${chunkNum} (${progressed}%).`
      );
      onAppendSubtitles({
        subtitles: subtitlesForThisChunk,
        progressed,
        chunkNum,
      });
    } else {
      logger.debug(`Youtube Provider: Chunk ${chunkNum} no subtitles.`);
    }
  };

  /**
   * 串行泵送当前窗口内的待处理 chunk。
   * active 锁用于避免高频 timeupdate 重入造成同一 chunk 重复请求。
   *
   * @returns {Promise<void>}
   */
  const pump = async () => {
    if (active) return;
    active = true;
    try {
      while (true) {
        if (signal?.aborted || isStaleProcessing(processingVersion)) return;
        const nextIndex = findNextChunkIndex();
        if (nextIndex === -1) return;
        await processChunk(nextIndex);
      }
    } finally {
      active = false;
    }
  };

  return {
    /**
     * 按播放器当前时间和前瞻秒数更新调度窗口，并启动懒处理。
     *
     * @param {number} currentTimeMs 播放器当前时间，单位毫秒。
     * @param {number} [preTrans=90] 复用字幕“提前翻译时长”的前瞻秒数。
     * @returns {Promise<void>} 当前窗口内已触发 chunk 的处理 Promise；生产路径可忽略，测试可等待。
     */
    scheduleUntil(currentTimeMs, preTrans = 90) {
      latestWindow = {
        currentTimeMs,
        endTimeMs: currentTimeMs + preTrans * 1000,
      };
      return pump();
    },
  };
}

/**
 * 异步批次处理视频后续的所有字幕分块并增量渲染到界面上。
 *
 * 设计要点：
 * 1. 长视频字幕可能有数千行，首块先返回能避免用户长时间看不到字幕。
 * 2. 每块完成后通过 `onAppendSubtitles` 交还 provider 合并、排序，并同步前台字幕管理器和侧边栏列表。
 * 3. 两个分块之间保留 500ms 至 1000ms 的随机延时抖动，平滑 AI 请求曲线，降低 QPS 频控风险。
 *
 * REVIEW: 视频切换时后台异步 API 请求仍可能浪费。
 * 当前过期检查只发生在 await 返回后，已经发出的请求依然会被处理；后续若要修复，应引入 AbortController。
 *
 * @param {object} param0 参数对象。
 * @param {Array<Array<object>>} param0.chunks 待处理的字幕事件分块列表。
 * @param {number} [param0.startIndex=0] 后台续跑的起始分块索引。
 * @param {string} param0.videoId 当前视频 ID。
 * @param {string} param0.fromLang 字幕源语言代码。
 * @param {string} param0.toLang 目标翻译语言代码。
 * @param {object} param0.segApiSetting 断句 API 配置。
 * @param {object} param0.setting 字幕模块配置。
 * @param {number} param0.processingVersion 当前异步处理版本快照。
 * @param {Function} param0.isStaleProcessing 检查当前异步任务是否过期。
 * @param {Function} param0.apiSubtitle 调用字幕断句 API 的函数。
 * @param {object} param0.docInfo 页面与 AI 上下文信息。
 * @param {Function} param0.formatSubtitles AI 失败时的内置格式化降级函数。
 * @param {boolean} param0.clearSegmentTranslation 是否清空断句 API 返回的翻译字段。
 * @param {Function} param0.onAppendSubtitles 分块完成时同步到 provider 的回调。
 * @param {Function} param0.getCurrentVideoId 读取当前页面视频 ID 的函数。
 * @param {AbortSignal} [param0.signal] 当前字幕处理生命周期的取消信号。
 * @returns {Promise<void>}
 */
export async function processRemainingChunksAsync({
  chunks,
  startIndex = 0,
  videoId,
  fromLang,
  toLang,
  segApiSetting,
  setting,
  processingVersion,
  isStaleProcessing,
  apiSubtitle,
  docInfo,
  formatSubtitles,
  clearSegmentTranslation,
  onAppendSubtitles,
  getCurrentVideoId,
  signal,
}) {
  logger.info(
    `Youtube Provider: Starting async from chunk ${startIndex + 1}/${chunks.length}.`
  );

  for (let i = startIndex; i < chunks.length; i++) {
    if (isStaleProcessing(processingVersion)) {
      logger.info("Youtube Provider: Skip stale chunk processing.");
      break;
    }

    const chunkEvents = chunks[i];
    const chunkNum = i + 1;
    logger.debug(
      `Youtube Provider: Processing subtitle chunk ${chunkNum}/${chunks.length}: ${chunkEvents[0]?.start} --> ${
        chunkEvents[chunkEvents.length - 1]?.start
      }`
    );

    let subtitlesForThisChunk = [];

    try {
      const aiSubtitles = await aiSegment({
        videoId,
        chunkEvents,
        fromLang,
        toLang,
        segApiSetting,
        apiSubtitle,
        docInfo,
        formatSubtitles,
        clearSegmentTranslation,
        prevContext: getChunkContext(chunks, i, "prev"),
        nextContext: getChunkContext(chunks, i, "next"),
        signal,
        setting,
        onSubtitleChunk: ({ subtitles }) => {
          if (
            !subtitles?.length ||
            videoId !== getCurrentVideoId() ||
            isStaleProcessing(processingVersion)
          ) {
            return;
          }

          const progressed = Math.floor((chunkNum * 100) / chunks.length);
          // 后续 chunk 内部也按句增量提交，完整 chunk 返回后再由 upsert 去重补齐。
          onAppendSubtitles({
            subtitles,
            progressed,
            chunkNum,
          });
        },
      });
      if (isStaleProcessing(processingVersion)) break;

      if (aiSubtitles?.length > 0) {
        subtitlesForThisChunk = aiSubtitles;
      } else {
        logger.debug(
          `Youtube Provider: AI segmentation for chunk ${chunkNum} returned no data.`
        );
        subtitlesForThisChunk = formatSubtitles(chunkEvents, fromLang);
      }
    } catch (chunkError) {
      subtitlesForThisChunk = formatSubtitles(chunkEvents, fromLang);
    }

    if (
      videoId !== getCurrentVideoId() ||
      isStaleProcessing(processingVersion)
    ) {
      logger.info(
        "Youtube Provider: videoId changed or track replaced!",
        videoId,
        getCurrentVideoId()
      );
      break;
    }

    if (subtitlesForThisChunk.length > 0) {
      const progressed = Math.floor((chunkNum * 100) / chunks.length);
      logger.debug(
        `Youtube Provider: Appending ${subtitlesForThisChunk.length} subtitles from chunk ${chunkNum} (${progressed}%).`
      );
      onAppendSubtitles({
        subtitles: subtitlesForThisChunk,
        progressed,
        chunkNum,
      });
    } else {
      logger.debug(`Youtube Provider: Chunk ${chunkNum} no subtitles.`);
    }

    await sleep(randomBetween(500, 1000));
  }

  logger.info("Youtube Provider: All subtitle chunks processed.");
}
