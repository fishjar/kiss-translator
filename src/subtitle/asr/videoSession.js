import { logger } from "../../libs/log";
import { blockTask } from "./tasks";
import { asrFailure } from "./status";
import { ASR_SAMPLE_RATE, ASR_MAX_WAV_BYTES } from "./audioChunks";
import { AsrPcmPipeline } from "./pcmPipeline";
import { IncrementalAacDecoder } from "./aacDecoder";
import { AudioDownloadManager } from "./downloadManager";
import { asrCacheSignatures } from "./signatures";
import { normalizeCachedChunk } from "./cacheStore";
import { readAsrCache } from "./cacheRecovery";
import { AsrPauseGate } from "./pause";
import { missingIntervals, coverageProgress } from "./coverage";
import { transcribeAudioChunk } from "./transcribeChunk";
import { remuxAac, cropAacSentence } from "./audioExport";
import {
  isLocalAsrService,
  asrChunkDurationSeconds,
  asrSegmentCues,
  asrSupportsTimestamps,
} from "./timing";
import { isSameLang } from "../youtubeCaptionTracks";

const fail = (code) => Object.assign(new Error(code), { code });
const slots = new Map();
const rank = { failed: 0, recognized: 1, segmented: 2, translated: 3 };
const ranges = (chunks, total) =>
  chunks.map((chunk) => ({
    start: chunk.startSample,
    end: chunk.endOfMedia ? total : chunk.endSample,
  }));
async function exclusiveAsr(videoId, signal, execute) {
  const previous = slots.get(videoId) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(() => {
      if (signal.aborted)
        throw signal.reason || new DOMException("Cancelled", "AbortError");
      return execute();
    });
  const finished = task
    .then(
      () => {},
      () => {}
    )
    .finally(() => {
      if (slots.get(videoId) === finished) slots.delete(videoId);
    });
  slots.set(videoId, finished);
  return task;
}

/** A video/audio-track/config-bound session. UI and original CC have no ownership here. */
export class AsrVideoSession {
  constructor({
    identity,
    textIdentity = identity,
    language = identity.sourceLanguage,
    selectedLanguage = "auto",
    retainedAudio,
    cacheMode = "persistent",
    audioLookup,
    restoreText = true,
    audioSessionId,
    audioCacheStatus = "checking",
    deferAudio = false,
    asrService,
    setting,
    bridge,
    cache,
    textProcessor,
    onState = () => {},
    onSubtitles = () => {},
    onTask = () => {},
    targetMs = 0,
    signatures,
    getLimits = async () => ({}),
    recognize = transcribeAudioChunk,
    createDownload = (options) => new AudioDownloadManager(options),
    createDecoder = (callback, signal) =>
      new IncrementalAacDecoder(callback, signal),
    createPipeline = (...args) => new AsrPcmPipeline(...args),
  }) {
    Object.assign(this, {
      identity,
      textIdentity,
      language,
      selectedLanguage,
      retainedAudio,
      cacheMode,
      audioLookup,
      restoreText,
      audioSessionId,
      audioCacheStatus,
      deferAudio,
      asrService,
      setting,
      bridge,
      cache,
      textProcessor,
      onState,
      onSubtitles,
      onTask,
      signatureInput: signatures,
      getLimits,
      recognize,
      createDownload,
      createDecoder,
      createPipeline,
    });
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.textController = new AbortController();
    this.signal.addEventListener("abort", () => this.textController.abort(), {
      once: true,
    });
    this.pauseGate = new AsrPauseGate();
    this.waitUntilRunning = (signal = this.signal) =>
      this.pauseGate.wait(signal);
    this.audioController = new AbortController();
    this.signal.addEventListener("abort", () => this.audioController.abort(), {
      once: true,
    });
    this.total = Math.round(identity.durationMs * 16);
    this.target = Math.min(
      this.total - 1,
      Math.max(0, Math.round(targetMs * 16))
    );
    this.blocks = new Map();
    this.chunkIndex = new Map();
    this.mediaWaiters = new Set();
    this.postFailures = new Set();
    this.recognitionRetries = new Set();
    this.postRetries = new Set();
    this.writes = Promise.resolve();
    this.cacheFailed = audioLookup === false;
    this.state = { phase: "restoring", audio: { phase: "missing" } };
  }
  setDetectedLanguage(language, confidence) {
    if (!language || this.language !== "auto") return;
    this.language = language;
    this.textProcessor.setLanguage?.(language);
    this.state.effectiveLanguage = language;
    this.state.languageSource = "detected";
    this.state.languageConfidence = confidence;
  }
  takeAudio() {
    if (this.retainedAudio) {
      const retained = this.retainedAudio;
      this.retainedAudio = undefined;
      return retained;
    }
    const download = this.download;
    if (!download || download.disposed) return;
    const lease = this.asrLease;
    this.asrLease = undefined;
    this.download = undefined;
    this.pauseGate.resume();
    download.waitUntilRunning = async () => {};
    download.onState = download.onTask = download.onSegment = () => {};
    return { download, lease, release: () => lease?.release() };
  }
  check() {
    if (this.signal.aborted)
      throw this.signal.reason || new DOMException("Cancelled", "AbortError");
  }
  pause() {
    if (this.signal.aborted) return;
    this.pauseGate.pause();
    this.emit();
  }
  resume() {
    if (this.signal.aborted) return;
    this.pauseGate.resume();
    this.emit();
    this.wake();
    this.queuePostProcessing();
  }
  subtitles() {
    return [...this.blocks.values()]
      .filter((block) => block.stage !== "failed")
      .flatMap((block) =>
        block.subtitles.length
          ? block.subtitles
          : asrSegmentCues(block.segments, block.timingSource)
      )
      .sort((a, b) => a.start - b.start);
  }
  emit(patch = {}) {
    if (this.signal.aborted) return;
    const chunks = [...this.blocks.values()];
    const recognition = coverageProgress(
      ranges(
        chunks.filter((chunk) => chunk.stage !== "failed"),
        this.total
      ),
      this.total
    );
    const translation = coverageProgress(
      ranges(
        chunks.filter((chunk) => chunk.silent || chunk.stage === "translated"),
        this.total
      ),
      this.total
    );
    let phase = this.pauseGate.paused
      ? "paused"
      : this.recognitionPaused
        ? "error"
        : !this.restored
          ? "restoring"
          : (recognition.complete && translation.complete) ||
              (recognition.complete &&
                isSameLang(
                  this.language,
                  this.setting.toLang,
                  this.setting.translateVariants ?? true
                ))
            ? this.cacheHit
              ? "cached"
              : "complete"
            : this.recognizing
              ? "recognizing"
              : this.postWork
                ? "translating"
                : patch.recognitionError ||
                    this.state.recognitionError ||
                    this.download?.error ||
                    this.postFailures.size ||
                    chunks.some((chunk) => chunk.stage === "failed")
                  ? "partial"
                  : "waiting";
    this.state = {
      ...this.state,
      ...patch,
      paused: this.pauseGate.paused,
      cuttingActive: !!this.indexWork && !this.indexError && !this.indexWaiting,
      timestampDowngraded: !!this.timestampDowngraded,
      chunkDurationSeconds:
        this.chunkDurationSeconds || asrChunkDurationSeconds(this.asrService),
      cutting:
        this.cacheHit && !this.indexedUntil
          ? undefined
          : {
              samples: this.indexedUntil || 0,
              totalSamples: this.total,
              complete: !!this.indexComplete,
            },
      timingSource: chunks.some((chunk) => chunk.timingSource === "audio-chunk")
        ? "audio-chunk"
        : "asr",
      phase,
      recognition,
      translation,
      audio: this.download?.state || {
        phase: "missing",
        cacheStatus: this.audioCacheStatus,
      },
      targetMs: this.target / 16,
      cacheMode: this.cacheMode,
      cacheSaved: this.cacheMode !== "session" && !this.cacheFailed,
      cacheWarning: this.download?.cacheWriteFailed
        ? "CACHE_WRITE_FAILED"
        : this.download?.memoryOnly
          ? "CACHE_READ_FAILED"
          : undefined,
    };
    const failures = [
      ...(this.download?.error
        ? [{ stage: "audio", code: this.download.error.code }]
        : []),
      ...(this.indexError
        ? [{ stage: "cutting", code: this.indexError.code }]
        : []),
      ...(this.workError
        ? [
            {
              stage: "recognition",
              code: this.workError.code || "AUDIO_DECODE_FAILED",
            },
          ]
        : []),
      ...chunks
        .filter((block) => block.stage === "failed")
        .map((block) => ({ stage: "recognition", code: block.errorCode })),
      ...[...this.postFailures].map((start) => ({
        stage: "translation",
        code: this.postErrors?.get(start),
      })),
    ];
    if (!failures.length && this.state.recognitionError)
      failures.push({
        stage: "recognition",
        code: this.state.recognitionError,
      });
    const audioBusy = ["fetching", "restoring", "cooldown"].includes(
      this.download?.state?.phase
    );
    const runnable =
      !this.recognitionPaused &&
      !this.indexError &&
      !this.workError &&
      [...this.chunkIndex.values()].some(
        (chunk) =>
          !this.blocks.has(chunk.startSample) &&
          (this.recognitionRetries.has(chunk.startSample) ||
            chunk.endSample > this.target ||
            this.indexComplete)
      );
    this.state.failures = failures;
    this.state.working = !!(
      audioBusy ||
      this.work ||
      this.indexWork ||
      this.postWork ||
      this.audioReset ||
      runnable ||
      this.pendingPostBlock()
    );
    this.state.stoppedByError =
      !!failures.length &&
      !this.signal.aborted &&
      !this.pauseGate.paused &&
      !this.state.working;
    this.onState(this.state);
    this.onSubtitles(this.subtitles(), this.state);
  }
  async start() {
    this.emit();
    this.limits = Object.freeze({ ...(await this.getLimits(this.asrService)) });
    this.chunkDurationSeconds = asrChunkDurationSeconds(this.asrService);
    this.check();
    if (this.cacheMode === "session") {
      this.restored = true;
      this.cacheFailed = true;
      this.audioCacheStatus = undefined;
      this.emit();
      if (!this.deferAudio) await this.resumeAudio();
      return this.state;
    }
    this.signatures =
      typeof this.signatureInput === "function"
        ? await this.signatureInput(this.limits)
        : this.signatureInput ||
          (await asrCacheSignatures({
            asrService: this.asrService,
            segmentationService: this.setting.transApis?.find(
              (api) => api.apiSlug === this.setting.segSlug
            ),
            translationService: this.setting.apiSetting,
            setting: this.setting,
            language: this.language,
            limits: this.limits,
          }));
    this.check();
    this.emit();
    let cached;
    try {
      cached = this.restoreText
        ? await readAsrCache(
            () =>
              this.cache.getVideo(this.textIdentity, this.signatures, {
                signal: this.signal,
                onChunk: (chunk) => {
                  if (!this.signal.aborted) {
                    this.blocks.set(chunk.startSample, chunk);
                    this.setDetectedLanguage(
                      chunk.language,
                      chunk.languageConfidence
                    );
                    if (chunk.stage !== "failed")
                      this.onTask({ ...blockTask(chunk), cached: true });
                    this.emit();
                  }
                },
              }),
            this.signal
          )
        : null;
      this.check();
      for (const chunk of cached?.chunks || []) {
        this.blocks.set(chunk.startSample, chunk);
        this.setDetectedLanguage(chunk.language, chunk.languageConfidence);
        if (chunk.stage !== "failed")
          this.onTask({ ...blockTask(chunk), cached: true });
      }
      if ([...this.blocks.values()].some((chunk) => chunk.stage === "failed")) {
        if (this.cacheMode !== "session")
          await this.cache.removeFailed(this.textIdentity);
        this.check();
        for (const [key, chunk] of this.blocks)
          if (chunk.stage === "failed") this.blocks.delete(key);
      }
    } catch (cause) {
      this.check();
      this.cacheFailed = true;
      logger
        .child("subtitle")
        .debug(
          "[YouTube ASR cache] text restore failed",
          cause.code || cause.name
        );
      this.state.cacheError = cause.code || "CACHE_UNAVAILABLE";
    }
    this.restored = true;
    const isTransComplete =
      cached?.translation.complete === true ||
      (this.blocks.size > 0 &&
        this.missing().length === 0 &&
        [...this.blocks.values()].every(
          (chunk) => chunk.silent || chunk.stage === "translated"
        ));
    const isSame = isSameLang(
      this.language,
      this.setting.toLang,
      this.setting.translateVariants ?? true
    );
    this.cacheHit =
      isTransComplete ||
      (isSame &&
        (cached?.recognition.complete === true ||
          (this.blocks.size > 0 && this.missing().length === 0)));
    this.state.cacheRestored = this.blocks.size > 0;
    this.emit();
    if (this.cacheHit) return this.state;
    this.queuePostProcessing();
    if (this.missing().length && !this.deferAudio) await this.resumeAudio();
    return this.state;
  }
  missing(includeFailed = true) {
    return missingIntervals(
      ranges(
        [...this.blocks.values()].filter(
          (block) => includeFailed || block.stage !== "failed"
        ),
        this.total
      ),
      this.total
    );
  }
  ensureDownload() {
    if (this.download) return this.download;
    if (this.audioReset)
      throw new DOMException("Audio is resetting", "AbortError");
    let download;
    const options = {
      bridge: this.bridge,
      cache: this.cache,
      cacheMode: this.cacheMode,
      audioLookup: this.audioLookup,
      identity: this.identity,
      sessionId: this.audioSessionId,
      persistAudio: (this.setting?.audioCacheLimit ?? 100) > 0,
      waitUntilRunning: this.waitUntilRunning,
      onState: () => {
        if (this.download !== download) return;
        if (this.download?.memoryOnly || this.download?.cacheWriteFailed)
          this.cacheFailed = true;
        this.emit();
        this.wake();
      },
      onSegment: () => {
        if (this.download === download) this.wake();
      },
      onTask: (task) => {
        if (!this.signal.aborted && this.download === download)
          this.onTask(task);
      },
    };
    if (this.retainedAudio) {
      const retained = this.retainedAudio;
      this.retainedAudio = undefined;
      download = retained.download;
      Object.assign(download, {
        waitUntilRunning: options.waitUntilRunning,
        onState: options.onState,
        onTask: options.onTask,
        onSegment: options.onSegment,
      });
      this.asrLease = retained.lease;
      this.asrLease?.ready.then(
        () => this.wake(),
        () => this.wake()
      );
      for (const segment of download.index.values())
        if (segment.index > 0)
          this.onTask({
            ...segment,
            id: `media-${segment.index}`,
            kind: "media",
            download: "complete",
          });
    } else download = this.createDownload(options);
    this.download = download;
    return this.download;
  }
  resetAudio(remove = async () => {}) {
    this.check();
    const version = (this.audioVersion = (this.audioVersion || 0) + 1);
    this.audioController.abort();
    this.cancelFullExport();
    this.asrLease?.release();
    this.asrLease = undefined;
    const old = this.download;
    this.download = undefined;
    const disposing = old?.dispose();
    const job = Promise.allSettled([
      this.audioReset,
      disposing,
      this.work,
      this.indexWork,
      this.sentenceJob?.task,
      this.fullJob,
    ]).then(async () => {
      this.check();
      await remove();
      this.check();
      if (version !== this.audioVersion) return;
      this.audioLookup = undefined;
      this.audioSessionId = undefined;
      this.audioCacheStatus = this.cacheMode === "session" ? undefined : "miss";
      this.chunkIndex.clear();
      this.indexedUntil = 0;
      this.indexComplete = false;
      this.indexError = undefined;
      this.workError = undefined;
      this.indexDownloadError = false;
      this.indexWork = undefined;
      this.audioController = new AbortController();
      this.audioReset = undefined;
      this.emit({ fullExport: undefined, exportError: undefined });
      if (this.missing().length) await this.resumeAudio();
    });
    this.audioReset = job;
    return job.finally(() => {
      if (this.audioReset === job) this.audioReset = undefined;
    });
  }
  async resumeAudio() {
    await this.audioReset;
    this.check();
    const download = this.ensureDownload();
    if (!this.asrLease) {
      this.asrLease = download.acquire("asr");
      this.asrLease.ready.then(
        () => this.wake(),
        () => this.wake()
      );
    }
    if (this.missing().length && !this.limits) {
      this.limits = await this.getLimits(this.asrService);
      this.check();
    }
    this.wake();
  }
  async saveBlock(input) {
    this.check();
    const current = this.blocks.get(input.startSample);
    const merged = {
      ...current,
      ...input,
      endOfMedia: input.endOfMedia || current?.endOfMedia || false,
    };
    if (current && rank[current.stage] > rank[merged.stage])
      merged.stage = current.stage;
    const block = normalizeCachedChunk(merged);
    this.blocks.set(block.startSample, block);
    if (
      block.stage !== "failed" &&
      !this.indexError &&
      !this.workError &&
      ![...this.blocks.values()].some((block) => block.stage === "failed")
    )
      this.state.recognitionError = undefined;
    const task = blockTask(block);
    if (
      this.postBlock === block.startSample &&
      this.postPhase === "translating" &&
      task.translation === "waiting"
    )
      task.translation = "translating";
    this.onTask(task);
    this.emit();
    if (this.cacheMode === "session" || this.cacheFailed) return block;
    const signatures = this.signatures;
    const saved = this.writes
      .catch(() => {})
      .then(async () => {
        this.check();
        try {
          await this.cache.putChunk(this.textIdentity, signatures, block, {
            signal: this.signal,
          });
        } catch (cause) {
          if (this.signal.aborted) return;
          this.cacheFailed = true;
          this.emit({ cacheError: cause.code || "CACHE_WRITE_FAILED" });
        }
      });
    this.writes = saved;
    await saved;
    return block;
  }
  async setTranslationTarget(setting, processor, signatures) {
    const version = (this.translationVersion =
      (this.translationVersion || 0) + 1);
    this.translationChanging = true;
    this.textController.abort();
    this.setting = setting;
    this.textProcessor = processor;
    processor.setLanguage?.(this.language);
    this.cacheHit = false;
    this.postFailures.clear();
    this.postErrors?.clear();
    this.postRetries.clear();
    for (const [start, block] of this.blocks) {
      if (block.stage === "failed" || block.silent) continue;
      const cleared = {
        ...block,
        subtitles: block.subtitles.map((cue) => ({
          ...cue,
          translation: "",
          _isDraftTranslation: false,
        })),
        stage: block.stage === "translated" ? "segmented" : block.stage,
      };
      this.blocks.set(start, cleared);
      this.onTask({
        ...blockTask(cleared),
        processing: undefined,
        translationError: undefined,
      });
    }
    this.emit({ translationError: undefined, cacheRestored: false });
    try {
      const [, nextSignatures] = await Promise.all([this.postWork, signatures]);
      if (this.signal.aborted || version !== this.translationVersion) return;
      this.signatures = nextSignatures;
      // Persist the new target signature after all previously queued writes.
      for (const block of this.blocks.values()) {
        if (this.signal.aborted || version !== this.translationVersion) return;
        await this.saveBlock(block);
      }
    } finally {
      if (!this.signal.aborted && version === this.translationVersion) {
        this.textController = new AbortController();
        this.translationChanging = false;
        this.queuePostProcessing();
      }
    }
  }
  pendingPostBlock() {
    if (this.cacheHit && !this.postRetries.size) return;
    return [...this.blocks.values()]
      .filter(
        (block) =>
          block.stage !== "failed" &&
          block.stage !== "translated" &&
          !this.postFailures.has(block.startSample) &&
          (this.postRetries.has(block.startSample) ||
            block.endSample > this.target ||
            (this.indexComplete &&
              ![...this.chunkIndex.values()].some(
                (chunk) =>
                  chunk.endSample > this.target &&
                  !this.blocks.has(chunk.startSample)
              )) ||
            this.missing().length === 0)
      )
      .sort(
        (a, b) =>
          (a.endSample <= this.target) - (b.endSample <= this.target) ||
          a.startSample - b.startSample
      )[0];
  }
  queuePostProcessing() {
    if (
      !this.restored ||
      this.signal.aborted ||
      this.postWork ||
      this.translationChanging
    )
      return;
    const signal = this.textController.signal;
    const check = () => {
      this.check();
      if (signal.aborted)
        throw new DOMException("Translation replaced", "AbortError");
    };
    const pending = () => this.pendingPostBlock();
    if (!pending()) {
      this.emit();
      return;
    }
    this.postWork = Promise.resolve()
      .then(async () => {
        let block;
        while (!signal.aborted && (block = pending())) {
          this.postBlock = block.startSample;
          this.postPhase = "segmenting";
          try {
            await this.waitUntilRunning(signal);
            check();
            if (block.stage === "recognized") {
              this.onTask({
                id: `block-${block.startSample}`,
                processing: "segmenting",
              });
              const subtitles =
                block.timingSource === "audio-chunk"
                  ? asrSegmentCues(block.segments, block.timingSource)
                  : (
                      await this.textProcessor.segment(
                        block.segments,
                        signal,
                        this.waitUntilRunning
                      )
                    ).map((cue) => ({ ...cue, timingSource: "asr" }));
              check();
              block = await this.saveBlock({
                ...block,
                subtitles,
                stage: "segmented",
              });
            }
            const blockStart = block.startSample;
            await this.waitUntilRunning(signal);
            check();
            this.postPhase = "translating";
            this.onTask({
              id: `block-${blockStart}`,
              processing: undefined,
              translation: "translating",
              translationError: undefined,
            });
            const subtitles = await this.textProcessor.translate(
              block.subtitles,
              signal,
              (partial) => {
                if (!signal.aborted) {
                  const latest = this.blocks.get(blockStart);
                  this.blocks.set(blockStart, {
                    ...latest,
                    subtitles: partial.map((cue) => ({ ...cue })),
                  });
                  this.onTask({
                    id: `block-${blockStart}`,
                    translated: partial.filter((cue) => cue.translation?.trim())
                      .length,
                    total: partial.length,
                  });
                  this.emit();
                }
              },
              this.waitUntilRunning
            );
            check();
            await this.saveBlock({
              ...this.blocks.get(block.startSample),
              subtitles,
              stage: "translated",
            });
            this.postErrors?.delete(block.startSample);
          } catch (cause) {
            if (signal.aborted) break;
            this.postFailures.add(block.startSample);
            this.postErrors ||= new Map();
            this.postErrors.set(
              block.startSample,
              cause.code || "TRANSLATION_FAILED"
            );
            this.onTask({
              id: `block-${block.startSample}`,
              processing: undefined,
              translation: "failed",
              translationError: cause.code || "TRANSLATION_FAILED",
            });
            this.emit({ translationError: cause.code || "TRANSLATION_FAILED" });
          } finally {
            this.postRetries.delete(block.startSample);
          }
        }
      })
      .finally(() => {
        this.postWork = undefined;
        this.postBlock = undefined;
        this.postPhase = undefined;
        this.emit();
      });
    this.emit();
  }
  wake() {
    // Download retries and cache rebuilds keep the session; release their scanner error.
    if (
      this.indexDownloadError &&
      !this.indexWork &&
      !this.download?.error &&
      this.download?.index.has(0) &&
      this.download.coverageMs > 0
    ) {
      const error = this.indexError;
      this.indexError = undefined;
      this.indexDownloadError = false;
      this.chunkIndex.clear();
      this.indexedUntil = 0;
      this.indexComplete = false;
      if (this.state.recognitionError === error?.code)
        this.emit({ recognitionError: undefined });
    }
    for (const wake of this.mediaWaiters) wake();
    this.dirty = true;
    if (
      !this.restored ||
      this.audioReset ||
      !this.limits ||
      this.signal.aborted ||
      this.recognitionPaused ||
      this.workError ||
      this.missing().length === 0 ||
      this.work ||
      !this.download
    )
      return;
    this.work = Promise.resolve()
      .then(() => this.runRecognition())
      .catch((cause) => {
        if (
          !this.signal.aborted &&
          !this.audioReset &&
          cause.name !== "AbortError" &&
          cause.code !== "ASR_PAUSED" &&
          !cause.cacheReadError
        ) {
          if (!this.indexError && cause !== this.download?.error)
            this.workError = cause;
          this.emit({ recognitionError: cause.code || "AUDIO_DECODE_FAILED" });
        }
      })
      .finally(() => {
        this.work = undefined;
        if (this.dirty && !this.signal.aborted) this.wake();
        this.emit();
      });
  }
  async waitForMedia(signal = this.signal) {
    this.check();
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        this.mediaWaiters.delete(wake);
        signal.removeEventListener("abort", abort);
      };
      const wake = () => {
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(signal.reason || new DOMException("Cancelled", "AbortError"));
      };
      this.mediaWaiters.add(wake);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  ensureIndex() {
    if (this.indexWork || this.indexComplete || this.indexError) return;
    const download = this.download;
    this.indexWork = this.decodeRange({ start: 0, end: this.total }, true)
      .then(() => {
        this.indexComplete = true;
        this.emit();
      })
      .catch((cause) => {
        if (!this.signal.aborted && !this.audioController.signal.aborted) {
          this.indexError = cause;
          this.indexDownloadError =
            cause === download.error || cause.cacheReadError === true;
          this.emit({ recognitionError: cause.code || "AUDIO_DECODE_FAILED" });
        }
      })
      .finally(() => {
        this.indexWork = undefined;
        this.wake();
        this.queuePostProcessing();
      });
    this.emit();
  }
  async runRecognition() {
    this.dirty = false;
    this.ensureIndex();
    while (!this.signal.aborted && !this.seeking && !this.recognitionPaused) {
      await this.waitUntilRunning(this.audioController.signal);
      this.ensureIndex();
      const pending = [...this.chunkIndex.values()].filter(
        (chunk) => !this.blocks.has(chunk.startSample)
      );
      const forward = pending.filter((chunk) => chunk.endSample > this.target);
      // Do not backfill while the canonical scanner is still discovering later blocks.
      const chunk =
        pending.find((chunk) =>
          this.recognitionRetries.has(chunk.startSample)
        ) ||
        forward[0] ||
        (this.indexComplete ? pending[0] : undefined);
      if (!chunk) {
        if (
          this.indexComplete &&
          this.languageAttempts &&
          this.language === "auto"
        ) {
          this.recognitionPaused = true;
          this.emit({ recognitionError: "LANGUAGE_UNCERTAIN" });
        }
        if (
          this.indexComplete ||
          this.state.recognitionError ||
          this.download.error
        )
          return;
        await this.waitForMedia(this.audioController.signal);
        continue;
      }
      await this.decodeRange({
        ...chunk,
        start: chunk.startSample,
        end: chunk.endSample,
      });
      this.check();
    }
  }
  async decodeRange(range, indexOnly = false) {
    const signal = this.audioController.signal;
    const download = this.download;
    let lastBlock,
      decodedEnd = 0,
      nextIndex,
      decoder,
      pipeline;
    const checkAudio = () => {
      this.check();
      if (signal.aborted)
        throw signal.reason || new DOMException("Cancelled", "AbortError");
      if (download !== this.download) throw fail("AUDIO_SESSION_MISSING");
      if (!indexOnly && this.recognitionPaused) throw fail("ASR_PAUSED");
    };
    const waitForMore = async () => {
      if (indexOnly) {
        this.indexWaiting = true;
        this.emit();
      }
      try {
        await this.waitForMedia(signal);
      } finally {
        if (indexOnly) {
          this.indexWaiting = false;
          this.emit();
        }
      }
    };
    const onAudio = async (frame) => {
      await this.waitUntilRunning(signal);
      checkAudio();
      decodedEnd = Math.max(
        decodedEnd,
        Math.round(
          (frame.timestamp + frame.channels[0].length / frame.sampleRate) *
            ASR_SAMPLE_RATE
        )
      );
      if (
        frame.timestamp * ASR_SAMPLE_RATE <=
        range.end + (16 * ASR_SAMPLE_RATE) / frame.sampleRate
      )
        await pipeline.push(frame);
    };
    const submit = async (chunk) => {
      await this.waitUntilRunning(signal);
      checkAudio();
      if (indexOnly) {
        const indexed = {
          startSample: chunk.startSample,
          endSample: chunk.endSample,
          silent: chunk.silent,
        };
        this.chunkIndex.set(chunk.startSample, indexed);
        this.indexedUntil = chunk.endSample;
        if (!this.blocks.has(chunk.startSample))
          this.onTask({
            id: `block-${chunk.startSample}`,
            kind: "block",
            startMs: chunk.startSample / 16,
            endMs: chunk.endSample / 16,
            recognition: "waiting",
            translation: "waiting",
            indexed: true,
          });
        this.emit();
        this.wake();
        return;
      }
      const task = {
        id: `block-${chunk.startSample}`,
        kind: "block",
        startMs: chunk.startSample / 16,
        endMs: chunk.endSample / 16,
      };
      this.onTask({
        ...task,
        recognition: "queued",
        translation: "waiting",
        errorCode: undefined,
        errorDetail: undefined,
        cached: false,
      });
      this.recognizing = true;
      this.emit();
      try {
        const result = await exclusiveAsr(
          this.cacheMode === "session" ? this : this.identity.videoId,
          signal,
          async () => {
            await this.waitUntilRunning(signal);
            checkAudio();
            this.onTask({
              id: task.id,
              recognition: "recognizing",
              startedAt: Date.now(),
              progress: undefined,
            });
            return this.recognize(this.asrService, chunk, {
              signal,
              language: this.language,
              maxBytes: this.limits.maxBytes,
              maxDurationSeconds: this.limits.maxModelDurationSeconds,
              prepareAudio: async () => {
                await this.waitUntilRunning(signal);
                checkAudio();
                const startMs = chunk.startSample / 16,
                  endMs = chunk.endSample / 16;
                try {
                  const result = await cropAacSentence(
                    download.segmentsFor(startMs, endMs, { signal }),
                    startMs,
                    endMs,
                    {
                      signal,
                      maxBytes: Math.min(
                        this.limits.maxBytes ?? ASR_MAX_WAV_BYTES,
                        ASR_MAX_WAV_BYTES
                      ),
                    }
                  );
                  checkAudio();
                  return result;
                } catch (cause) {
                  if (cause.code === "AUDIO_CACHE_MISSING")
                    await this.discardMissingAudio(download);
                  throw cause;
                }
              },
              onProgress: (event) => {
                if (!signal.aborted)
                  this.onTask({
                    id: task.id,
                    progress: event.progress,
                  });
              },
            });
          }
        );
        this.check();
        if (signal.aborted)
          throw signal.reason || new DOMException("Cancelled", "AbortError");
        if (result.languagePending) {
          this.languageAttempts = (this.languageAttempts || 0) + 1;
          await this.saveBlock({
            startSample: chunk.startSample,
            endSample: chunk.endSample,
            silent: false,
            segments: [],
            subtitles: [],
            stage: "failed",
            errorCode: "LANGUAGE_DETECTION_PENDING",
          });
          if (this.languageAttempts >= 3) {
            this.recognitionPaused = true;
            this.emit({ recognitionError: "LANGUAGE_UNCERTAIN" });
            throw fail("ASR_PAUSED");
          }
          return;
        }
        this.setDetectedLanguage(result.language, result.languageConfidence);
        if (this.language !== "auto" && this.languageAttempts) {
          for (const [start, block] of this.blocks)
            if (block.errorCode === "LANGUAGE_DETECTION_PENDING") {
              this.blocks.delete(start);
              this.recognitionRetries.add(start);
            }
          this.languageAttempts = 0;
        }
        if (
          asrSupportsTimestamps(this.asrService) &&
          !result.silent &&
          result.timingSource === "audio-chunk" &&
          result.segments.some((segment) => segment.text.trim())
        ) {
          this.timestampDowngraded = true;
        }
        await this.saveBlock({
          startSample: chunk.startSample,
          endSample: chunk.endSample,
          endOfMedia: !!this.chunkIndex.get(chunk.startSample)?.endOfMedia,
          silent: result.silent,
          language: this.language === "auto" ? undefined : this.language,
          languageConfidence: this.state.languageConfidence,
          timingSource: result.timingSource || "asr",
          segments: result.segments,
          subtitles: asrSegmentCues(
            result.segments,
            result.timingSource || "asr"
          ),
          stage:
            result.silent || !result.segments.length
              ? "translated"
              : (result.timingSource || "asr") === "audio-chunk"
                ? "segmented"
                : "recognized",
        });
        lastBlock = chunk.startSample;
        this.queuePostProcessing();
      } catch (cause) {
        if (signal.aborted) throw cause;
        if (cause.code === "ASR_PAUSED") throw cause;
        const failure = asrFailure(cause, this.asrService);
        await this.saveBlock({
          startSample: chunk.startSample,
          endSample: chunk.endSample,
          silent: false,
          timingSource: "asr",
          segments: [],
          subtitles: [],
          stage: "failed",
          errorCode: failure.errorCode,
        });
        this.onTask({ id: task.id, ...failure });
        if (
          [
            "HOST_STARTUP_FAILED",
            "HOST_UNAVAILABLE",
            "HOST_CLOSED",
            "LANGUAGE_DETECTION_UNAVAILABLE",
            "UNSUPPORTED_LANGUAGE",
          ].includes(failure.errorCode)
        )
          this.recognitionPaused = true;
        this.emit({ recognitionError: failure.errorCode });
        if (this.recognitionPaused) throw fail("ASR_PAUSED");
      } finally {
        this.recognitionRetries.delete(chunk.startSample);
        this.recognizing = false;
        this.emit();
      }
    };
    try {
      while (!signal.aborted) {
        await this.waitUntilRunning(signal);
        checkAudio();
        if (nextIndex === undefined) {
          const candidates = [...download.index.values()]
            .filter((entry) => entry.index > 0)
            .sort((a, b) => a.index - b.index);
          const first = candidates.findIndex(
            (entry) => entry.endMs >= range.start / 16
          );
          if (!download.index.has(0) || first < 0) {
            if (download.error) throw download.error;
            if (download.complete()) throw fail("AUDIO_CACHE_MISSING");
            await waitForMore();
            continue;
          }
          pipeline = this.createPipeline(
            this.chunkDurationSeconds,
            submit,
            signal,
            {
              ...this.limits,
              startSample: range.start,
              endSample: range.end,
              fixedRange: !indexOnly,
              silent: range.silent,
              boundaryPaddingFrames: isLocalAsrService(this.asrService) ? 0 : 2,
            }
          );
          decoder = this.createDecoder(onAudio, signal);
          const init = await download.readAudio(0, {
            signal,
          });
          checkAudio();
          if (!init) throw fail("AUDIO_CACHE_MISSING");
          await this.waitUntilRunning(signal);
          await decoder.append(new Uint8Array(init.data));
          nextIndex = candidates[Math.max(0, first - 1)].index;
        }
        const part = download.index.get(nextIndex);
        if (!part) {
          if (download.error) throw download.error;
          if (download.complete()) break;
          await waitForMore();
          continue;
        }
        const row = await download.readAudio(nextIndex++, { signal });
        checkAudio();
        if (!row) throw fail("AUDIO_CACHE_MISSING");
        await this.waitUntilRunning(signal);
        await decoder.append(new Uint8Array(row.data));
        if (decodedEnd >= range.end + ASR_SAMPLE_RATE / 100) break;
      }
      await this.waitUntilRunning(signal);
      checkAudio();
      const eof =
        download.complete() &&
        range.end === this.total &&
        nextIndex > download.expectedSegments;
      if (eof) await decoder.finish();
      await pipeline.finish();
      if (eof) {
        if (Math.abs(decodedEnd - this.total) > ASR_SAMPLE_RATE / 10)
          throw fail("AUDIO_DURATION_MISMATCH");
        if (indexOnly) {
          const indexed = [...this.chunkIndex.values()].pop();
          if (indexed) {
            indexed.endOfMedia = true;
            const saved = this.blocks.get(indexed.startSample);
            if (saved && saved.stage !== "failed")
              await this.saveBlock({ ...saved, endOfMedia: true });
          }
        }
        const tail = this.blocks.get(lastBlock);
        if (tail && tail.stage !== "failed")
          await this.saveBlock({ ...tail, endOfMedia: true });
      }
    } finally {
      decoder?.close();
      pipeline?.close();
    }
  }
  beginSeek() {
    this.seeking = true;
    this.wake();
  }
  seek(timeMs) {
    this.seeking = false;
    this.target = Math.min(
      this.total - 1,
      Math.max(0, Math.round(timeMs * 16))
    );
    this.emit();
    this.wake();
    this.queuePostProcessing();
  }
  async retryRecognition(taskId) {
    this.check();
    if (taskId !== undefined) {
      const block = [...this.blocks.values()].find(
        (block) => `block-${block.startSample}` === taskId
      );
      if (
        !block ||
        block.stage !== "failed" ||
        this.recognitionRetries.has(block.startSample)
      )
        return;
      this.recognitionRetries.add(block.startSample);
      this.blocks.delete(block.startSample);
      this.recognitionPaused = false;
      this.onTask({
        id: taskId,
        recognition: "queued",
        errorCode: undefined,
        errorDetail: undefined,
        retrying: true,
      });
      this.emit({ recognitionError: undefined });
      this.wake();
      return;
    }
    if (
      [
        "AUDIO_SESSION_MISSING",
        "AUDIO_CACHE_MISSING",
        "CACHE_DISCONNECTED",
        "CACHE_CLOSED",
      ].includes(this.state.recognitionError) ||
      [
        "AUDIO_SESSION_MISSING",
        "AUDIO_CACHE_MISSING",
        "CACHE_DISCONNECTED",
      ].includes(this.download?.error?.code)
    ) {
      const download = this.download;
      this.audioController.abort();
      await Promise.allSettled([this.work, this.indexWork]);
      this.check();
      await this.discardMissingAudio(download);
      this.check();
      this.audioController = new AbortController();
      this.chunkIndex.clear();
      this.indexedUntil = 0;
      this.indexComplete = false;
    }
    if (this.cacheMode !== "session" && !this.cacheFailed) {
      try {
        await this.cache.removeFailed(this.textIdentity);
      } catch (cause) {
        this.check();
        if (
          cause.name === "AbortError" ||
          cause.code === "STALE_VIDEO" ||
          cause.code === "AUDIO_IDENTITY_MISMATCH"
        )
          throw cause;
        this.cacheFailed = true;
        this.emit({ cacheError: cause.code || "CACHE_UNAVAILABLE" });
      }
    }
    this.check();
    for (const [key, block] of this.blocks)
      if (block.stage === "failed") {
        this.blocks.delete(key);
        this.recognitionRetries.add(key);
      }
    if (this.missing().length && !this.download) {
      this.ensureDownload();
      this.asrLease = this.download.acquire("asr");
      this.asrLease.ready.then(
        () => this.wake(),
        () => this.wake()
      );
    }
    this.recognitionPaused = false;
    this.workError = undefined;
    this.indexError = undefined;
    this.indexDownloadError = false;
    this.emit({ recognitionError: undefined });
    this.download?.retry();
    this.wake();
  }
  retryTranslation(taskId) {
    this.check();
    for (const start of [...this.postFailures]) {
      if (taskId !== undefined && `block-${start}` !== taskId) continue;
      this.postFailures.delete(start);
      this.postRetries.add(start);
      this.postErrors?.delete(start);
      this.onTask({
        id: `block-${start}`,
        translation: "waiting",
        translationError: undefined,
        retrying: true,
      });
    }
    this.emit({ translationError: undefined });
    this.queuePostProcessing();
  }
  async retryIncomplete() {
    const recoverAudio =
      !!this.download?.error ||
      !!this.indexError ||
      this.missing().length > 0 ||
      [
        "AUDIO_CACHE_MISSING",
        "AUDIO_SESSION_MISSING",
        "CACHE_DISCONNECTED",
        "CACHE_CLOSED",
      ].includes(this.state.recognitionError);
    await this.retryRecognition();
    this.check();
    if (recoverAudio && !this.download?.complete()) await this.resumeAudio();
    this.check();
    this.retryTranslation();
  }
  async retrySave() {
    this.cacheFailed = false;
    for (const block of this.blocks.values()) {
      await this.saveBlock(block);
      if (this.cacheFailed) break;
    }
    if (!this.cacheFailed) this.emit({ cacheError: undefined });
  }
  async discardMissingAudio(download) {
    if (this.download === download) {
      this.asrLease?.release();
      this.asrLease = undefined;
      this.download = undefined;
      this.audioLookup = false;
      this.audioSessionId = undefined;
      this.audioCacheStatus = this.cacheMode === "session" ? undefined : "miss";
    }
    await download?.dispose().catch(() => {});
  }
  async exportSentence(cue) {
    await this.audioReset;
    this.check();
    const signal = this.audioController.signal;
    const key = `${cue.start}:${cue.end}`;
    if (this.sentenceJob?.key === key) return this.sentenceJob.task;
    if (this.sentenceJob) throw fail("AUDIO_EXPORT_BUSY");
    const download = this.ensureDownload(),
      lease = download.acquire(`sentence-${key}`, cue.end);
    const task = (async () => {
      try {
        await lease.ready;
        this.check();
        const result = await cropAacSentence(
          download.segmentsFor(cue.start, cue.end, { signal }),
          cue.start,
          cue.end,
          { signal }
        );
        if (signal.aborted)
          throw signal.reason || new DOMException("Cancelled", "AbortError");
        return result;
      } catch (cause) {
        if (cause?.code === "AUDIO_CACHE_MISSING") {
          await this.discardMissingAudio(download);
        }
        throw cause;
      } finally {
        lease.release();
        this.sentenceJob = undefined;
      }
    })();
    this.sentenceJob = { key, task };
    return task;
  }
  exportFull() {
    if (this.audioReset) return this.audioReset.then(() => this.exportFull());
    this.check();
    if (this.fullJob) return this.fullJob;
    const download = this.ensureDownload(),
      lease = download.acquire("full-export");
    this.emit({ fullExport: "fetching", exportError: undefined });
    const controller = (this.fullExportController = new AbortController());
    const cancel = () => {
      controller.abort();
      lease.release();
    };
    this.signal.addEventListener("abort", cancel, { once: true });
    this.fullJob = (async () => {
      try {
        await lease.ready;
        this.check();
        if (controller.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        const result = await remuxAac(
          download.segmentsFor(0, Infinity, { signal: controller.signal }),
          {
            signal: controller.signal,
            onProgress: (progress) => this.emit({ fullExport: progress.phase }),
          }
        );
        if (controller.signal.aborted)
          throw (
            controller.signal.reason ||
            new DOMException("Cancelled", "AbortError")
          );
        this.emit({ fullExport: "ready" });
        return result;
      } catch (cause) {
        if (cause?.code === "AUDIO_CACHE_MISSING") {
          await this.discardMissingAudio(download);
        }
        this.emit({
          fullExport:
            controller.signal.aborted || this.signal.aborted
              ? "cancelled"
              : "failed",
          exportError:
            controller.signal.aborted || this.signal.aborted
              ? undefined
              : cause.code || "AUDIO_EXPORT_FAILED",
        });
        throw cause;
      } finally {
        lease.release();
        this.signal.removeEventListener("abort", cancel);
        this.fullJob = undefined;
        this.fullExportController = undefined;
      }
    })();
    controller.signal.addEventListener("abort", () => lease.release(), {
      once: true,
    });
    return this.fullJob;
  }
  cancelFullExport() {
    this.fullExportController?.abort();
    this.emit({ fullExport: "cancelled" });
  }
  async dispose() {
    if (this.signal.aborted) return;
    this.controller.abort();
    for (const wake of this.mediaWaiters) wake();
    this.asrLease?.release();
    this.retainedAudio?.release();
    if (this.cacheMode === "session") {
      this.blocks.clear();
      this.postFailures.clear();
      this.download?.memory?.clear();
    }
    await Promise.allSettled([
      this.download?.dispose(),
      this.retainedAudio?.download.dispose(),
      this.work,
      this.indexWork,
      this.postWork,
      this.writes,
      this.audioReset,
    ]);
  }
}
