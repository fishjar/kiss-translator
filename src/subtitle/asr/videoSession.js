import { blockTask } from "./tasks";
import { asrFailure } from "./status";
import { ASR_SAMPLE_RATE } from "./audioChunks";
import { AsrPcmPipeline } from "./pcmPipeline";
import { IncrementalAacDecoder } from "./aacDecoder";
import { AudioDownloadManager } from "./downloadManager";
import { asrCacheSignatures } from "./signatures";
import { normalizeCachedChunk } from "./cacheStore";
import {
  missingIntervals,
  prioritizeIntervals,
  coverageProgress,
} from "./coverage";
import { transcribeAudioChunk } from "./transcribeChunk";
import { remuxAac, cropAacSentence } from "./audioExport";
import {
  asrChunkDurationSeconds,
  asrSegmentCues,
  asrSupportsTimestamps,
} from "./timing";

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
    this.total = Math.round(identity.durationMs * 16);
    this.target = Math.min(
      this.total - 1,
      Math.max(0, Math.round(targetMs * 16))
    );
    this.blocks = new Map();
    this.postFailures = new Set();
    this.priorityVersion = 0;
    this.writes = Promise.resolve();
    this.state = { phase: "restoring", audio: { phase: "missing" } };
  }
  check() {
    if (this.signal.aborted)
      throw this.signal.reason || new DOMException("Cancelled", "AbortError");
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
    let phase = this.recognitionPaused
      ? "error"
      : !this.restored
        ? "restoring"
        : recognition.complete && translation.complete
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
      timestampDowngraded: !!this.timestampDowngraded,
      chunkDurationSeconds: asrChunkDurationSeconds(
        this.asrService,
        this.timestampDowngraded
      ),
      timingSource: chunks.some((chunk) => chunk.timingSource === "audio-chunk")
        ? "audio-chunk"
        : "asr",
      phase,
      recognition,
      translation,
      audio: this.download?.state || { phase: "missing" },
      targetMs: this.target / 16,
      cacheSaved: !this.cacheFailed,
    };
    this.onState(this.state);
    this.onSubtitles(this.subtitles(), this.state);
  }
  async start() {
    this.signatures =
      typeof this.signatureInput === "function"
        ? await this.signatureInput()
        : this.signatureInput ||
          (await asrCacheSignatures({
            asrService: this.asrService,
            segmentationService: this.setting.transApis?.find(
              (api) => api.apiSlug === this.setting.segSlug
            ),
            translationService: this.setting.apiSetting,
            setting: this.setting,
            language: this.identity.sourceLanguage,
          }));
    this.check();
    let cached;
    try {
      cached = await this.cache.getVideo(this.identity, this.signatures, {
        signal: this.signal,
        onChunk: (chunk) => {
          if (!this.signal.aborted) {
            this.blocks.set(chunk.startSample, chunk);
            if (chunk.stage !== "failed")
              this.onTask({ ...blockTask(chunk), cached: true });
            this.emit();
          }
        },
      });
      this.check();
      for (const chunk of cached?.chunks || []) {
        this.blocks.set(chunk.startSample, chunk);
        if (chunk.stage !== "failed")
          this.onTask({ ...blockTask(chunk), cached: true });
      }
      if ([...this.blocks.values()].some((chunk) => chunk.stage === "failed")) {
        await this.cache.removeFailed(this.identity);
        this.check();
        for (const [key, chunk] of this.blocks)
          if (chunk.stage === "failed") this.blocks.delete(key);
      }
    } catch (cause) {
      this.check();
      this.cacheFailed = true;
      this.state.cacheError = cause.code || "CACHE_UNAVAILABLE";
    }
    this.restored = true;
    this.cacheHit = cached?.translation.complete === true;
    this.state.cacheRestored = this.blocks.size > 0;
    this.emit();
    if (this.cacheHit) return this.state;
    this.queuePostProcessing();
    if (this.missing().length) {
      this.limits = await this.getLimits(this.asrService);
      this.check();
      this.ensureDownload();
      this.asrLease = this.download.acquire("asr");
      this.asrLease.ready.then(
        () => this.wake(),
        () => this.wake()
      );
      this.wake();
    }
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
    this.download = this.createDownload({
      bridge: this.bridge,
      cache: this.cache,
      identity: this.identity,
      onState: () => {
        this.emit();
        this.wake();
      },
      onSegment: () => this.wake(),
      onTask: (task) => {
        if (!this.signal.aborted) this.onTask(task);
      },
    });
    return this.download;
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
    const task = blockTask(block);
    if (
      this.postBlock === block.startSample &&
      this.postPhase === "translating" &&
      task.translation === "waiting"
    )
      task.translation = "translating";
    this.onTask(task);
    this.emit();
    if (this.cacheFailed) return block;
    const saved = this.writes
      .catch(() => {})
      .then(async () => {
        this.check();
        try {
          await this.cache.putChunk(this.identity, this.signatures, block, {
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
  queuePostProcessing() {
    if (!this.restored || this.signal.aborted || this.postWork) return;
    const pending = () =>
      [...this.blocks.values()]
        .filter(
          (block) =>
            block.stage !== "failed" &&
            block.stage !== "translated" &&
            !this.postFailures.has(block.startSample)
        )
        .sort(
          (a, b) =>
            (a.startSample < this.target) - (b.startSample < this.target) ||
            a.startSample - b.startSample
        )[0];
    if (!pending()) {
      this.emit();
      return;
    }
    this.postWork = Promise.resolve()
      .then(async () => {
        let block;
        while (!this.signal.aborted && (block = pending())) {
          this.postBlock = block.startSample;
          this.postPhase = "segmenting";
          try {
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
                        this.signal
                      )
                    ).map((cue) => ({ ...cue, timingSource: "asr" }));
              this.check();
              block = await this.saveBlock({
                ...block,
                subtitles,
                stage: "segmented",
              });
            }
            const blockStart = block.startSample;
            this.postPhase = "translating";
            this.onTask({
              id: `block-${blockStart}`,
              processing: undefined,
              translation: "translating",
              translationError: undefined,
            });
            const subtitles = await this.textProcessor.translate(
              block.subtitles,
              this.signal,
              (partial) => {
                if (!this.signal.aborted) {
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
              }
            );
            this.check();
            await this.saveBlock({
              ...this.blocks.get(block.startSample),
              subtitles,
              stage: "translated",
            });
          } catch (cause) {
            if (this.signal.aborted) break;
            this.postFailures.add(block.startSample);
            this.onTask({
              id: `block-${block.startSample}`,
              processing: undefined,
              translation: "failed",
              translationError: cause.code || "TRANSLATION_FAILED",
            });
            this.emit({ translationError: cause.code || "TRANSLATION_FAILED" });
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
    this.mediaWake?.();
    this.mediaWake = undefined;
    this.dirty = true;
    if (
      !this.restored ||
      this.signal.aborted ||
      this.recognitionPaused ||
      this.work ||
      !this.download
    )
      return;
    this.work = Promise.resolve()
      .then(() => this.runRecognition())
      .catch((cause) => {
        if (!this.signal.aborted && cause.code !== "ASR_PAUSED")
          this.emit({ recognitionError: cause.code || "AUDIO_DECODE_FAILED" });
      })
      .finally(() => {
        this.work = undefined;
        if (this.dirty && !this.signal.aborted) this.wake();
      });
  }
  async waitForMedia() {
    this.check();
    await new Promise((resolve, reject) => {
      const abort = () => {
        this.mediaWake = undefined;
        reject(
          this.signal.reason || new DOMException("Cancelled", "AbortError")
        );
      };
      this.mediaWake = () => {
        this.signal.removeEventListener("abort", abort);
        resolve();
      };
      this.signal.addEventListener("abort", abort, { once: true });
    });
  }
  async runRecognition() {
    this.dirty = false;
    while (!this.signal.aborted && !this.seeking && !this.recognitionPaused) {
      const missing = prioritizeIntervals(this.missing(), this.target);
      const available = Math.round(this.download.coverageMs * 16);
      const range = missing.find(
        (interval) =>
          interval.start < available &&
          (interval.start >= this.target ||
            this.download.complete() ||
            !missing.some((item) => item.end > this.target))
      );
      if (!range) return;
      const priorityVersion = this.priorityVersion;
      try {
        await this.decodeRange(range, priorityVersion);
      } catch (cause) {
        if (cause.code === "SEEK_CHANGED") continue;
        throw cause;
      }
      this.check();
      if (this.download.error && available <= range.start) return;
    }
  }
  async decodeRange(range, priorityVersion) {
    let lastBlock,
      decodedEnd = 0,
      nextIndex,
      decoder,
      pipeline;
    const checkPriority = () => {
      this.check();
      if (this.recognitionPaused) throw fail("ASR_PAUSED");
      if (priorityVersion !== this.priorityVersion || this.seeking)
        throw fail("SEEK_CHANGED");
    };
    const onAudio = async (frame) => {
      checkPriority();
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
      checkPriority();
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
          this.identity.videoId,
          this.signal,
          () => {
            this.onTask({
              id: task.id,
              recognition: "recognizing",
              startedAt: Date.now(),
              progress: undefined,
            });
            return this.recognize(this.asrService, chunk, {
              signal: this.signal,
              language: this.identity.sourceLanguage,
              onProgress: (event) => {
                if (!this.signal.aborted)
                  this.onTask({
                    id: task.id,
                    progress: event.progress,
                  });
              },
            });
          }
        );
        this.check();
        if (
          asrSupportsTimestamps(this.asrService) &&
          !result.silent &&
          result.timingSource === "audio-chunk" &&
          result.segments.some((segment) => segment.text.trim())
        ) {
          this.timestampDowngraded = true;
          pipeline.shortenLimit(asrChunkDurationSeconds(this.asrService, true));
        }
        await this.saveBlock({
          startSample: chunk.startSample,
          endSample: chunk.endSample,
          silent: result.silent,
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
        if (this.signal.aborted) throw cause;
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
          ["HOST_STARTUP_FAILED", "HOST_UNAVAILABLE", "HOST_CLOSED"].includes(
            failure.errorCode
          )
        )
          this.recognitionPaused = true;
        this.emit({ recognitionError: failure.errorCode });
        if (this.recognitionPaused) throw fail("ASR_PAUSED");
      } finally {
        this.recognizing = false;
        this.emit();
      }
    };
    try {
      while (!this.signal.aborted) {
        checkPriority();
        if (nextIndex === undefined) {
          const candidates = [...this.download.index.values()]
            .filter((entry) => entry.index > 0)
            .sort((a, b) => a.index - b.index);
          const first = candidates.findIndex(
            (entry) => entry.endMs >= range.start / 16
          );
          if (!this.download.index.has(0) || first < 0) {
            if (this.download.error || this.download.complete()) return;
            await this.waitForMedia();
            continue;
          }
          pipeline = this.createPipeline(
            asrChunkDurationSeconds(this.asrService, this.timestampDowngraded),
            submit,
            this.signal,
            { ...this.limits, startSample: range.start, endSample: range.end }
          );
          decoder = this.createDecoder(onAudio, this.signal);
          const init = await this.cache.getAudio(this.download.sessionId, 0, {
            signal: this.signal,
          });
          checkPriority();
          if (!init) throw fail("AUDIO_CACHE_MISSING");
          await decoder.append(new Uint8Array(init.data));
          nextIndex = candidates[Math.max(0, first - 1)].index;
        }
        const part = this.download.index.get(nextIndex);
        if (!part) {
          if (this.download.error || this.download.complete()) break;
          await this.waitForMedia();
          continue;
        }
        const row = await this.cache.getAudio(
          this.download.sessionId,
          nextIndex++,
          { signal: this.signal }
        );
        checkPriority();
        if (!row) throw fail("AUDIO_CACHE_MISSING");
        await decoder.append(new Uint8Array(row.data));
        if (decodedEnd >= range.end) break;
      }
      checkPriority();
      const eof =
        this.download.complete() &&
        range.end === this.total &&
        nextIndex > this.download.expectedSegments;
      if (eof) await decoder.finish();
      await pipeline.finish();
      if (eof) {
        if (Math.abs(decodedEnd - this.total) > ASR_SAMPLE_RATE / 10)
          throw fail("AUDIO_DURATION_MISMATCH");
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
    this.priorityVersion++;
    this.wake();
  }
  seek(timeMs) {
    this.seeking = false;
    this.target = Math.min(
      this.total - 1,
      Math.max(0, Math.round(timeMs * 16))
    );
    this.priorityVersion++;
    this.emit();
    this.wake();
    this.queuePostProcessing();
  }
  async retryRecognition() {
    this.check();
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
      this.asrLease?.release();
      await this.download?.dispose();
      this.check();
      this.download = undefined;
      this.asrLease = undefined;
    }
    this.limits = await this.getLimits(this.asrService);
    this.check();
    await this.cache.removeFailed(this.identity);
    this.check();
    for (const [key, block] of this.blocks)
      if (block.stage === "failed") this.blocks.delete(key);
    if (this.missing().length && !this.download) {
      this.ensureDownload();
      this.asrLease = this.download.acquire("asr");
      this.asrLease.ready.then(
        () => this.wake(),
        () => this.wake()
      );
    }
    this.recognitionPaused = false;
    this.emit({ recognitionError: undefined });
    this.download?.retry();
    this.wake();
  }
  retryTranslation() {
    this.postFailures.clear();
    this.emit({ translationError: undefined });
    this.queuePostProcessing();
  }
  async retrySave() {
    this.cacheFailed = false;
    for (const block of this.blocks.values()) {
      await this.saveBlock(block);
      if (this.cacheFailed) break;
    }
    if (!this.cacheFailed) this.emit({ cacheError: undefined });
  }
  async exportSentence(cue) {
    this.check();
    const key = `${cue.start}:${cue.end}`;
    if (this.sentenceJob?.key === key) return this.sentenceJob.task;
    if (this.sentenceJob) throw fail("AUDIO_EXPORT_BUSY");
    const download = this.ensureDownload(),
      lease = download.acquire(`sentence-${key}`, cue.end);
    const task = (async () => {
      try {
        await lease.ready;
        this.check();
        return await cropAacSentence(
          download.segmentsFor(cue.start, cue.end),
          cue.start,
          cue.end,
          { signal: this.signal }
        );
      } finally {
        lease.release();
        this.sentenceJob = undefined;
      }
    })();
    this.sentenceJob = { key, task };
    return task;
  }
  exportFull() {
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
        this.emit({ fullExport: "ready" });
        return result;
      } catch (cause) {
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
    this.mediaWake?.();
    this.mediaWake = undefined;
    this.asrLease?.release();
    await Promise.allSettled([
      this.download?.dispose(),
      this.work,
      this.postWork,
      this.writes,
    ]);
  }
}
