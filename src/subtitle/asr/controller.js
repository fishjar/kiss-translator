import { YoutubeAudioBridgeClient } from "./audioBridge";
import { AsrCacheClient } from "./cacheBridge";
import { mediaCacheKey } from "./cacheStore";
import { AsrVideoSession } from "./videoSession";
import {
  createAsrTextProcessor,
  effectiveAsrLimits,
  resolvedAsrServices,
} from "./processing";
import { asrCacheSignatures } from "./signatures";
import { AsrTaskStore } from "./tasks";
import { downloadBlobFile } from "../../libs/utils";

export const youtubeAsrSupported = ["chrome", "edge"].includes(
  process.env.REACT_APP_CLIENT
);

/** Owns a page's ASR session; caption acquisition and native CC remain independent. */
export class YoutubeAsrController {
  constructor({
    getSetting,
    getVideo,
    onState,
    onSubtitles,
    onTasks = () => {},
    bridge,
    cache,
    createSession = (options) => new AsrVideoSession(options),
  }) {
    Object.assign(this, {
      getSetting,
      getVideo,
      onState,
      onSubtitles,
      createSession,
    });
    this.bridge =
      bridge ||
      new YoutubeAudioBridgeClient(() => {
        if (this.active && this.state.phase !== "error") void this.tick();
      });
    this.cache = cache || new AsrCacheClient();
    this.tasks = new AsrTaskStore(onTasks);
    this.rangeExports = new Map();
    this.rangePreparations = new Map();
    this.state = { phase: "off" };
    this.epoch = 0;
    this.feedbackSession = 0;
    this.cleanup = Promise.resolve();
    this.bridge.configure(!!this.service());
  }
  service() {
    return resolvedAsrServices(this.getSetting()).asrService;
  }
  emit(patch) {
    this.state = {
      ...this.state,
      ...patch,
      feedbackSession: this.feedbackSession,
      active: !!this.active,
    };
    this.onState(this.state);
  }
  start() {
    if (this.active || !this.service() || !this.getVideo().videoId) return;
    this.active = true;
    this.feedbackSession++;
    this.tasks.reset();
    this.beginStartupWait();
    this.bridge.configure(true);
    this.emit({
      phase: "waiting",
      timingSource: undefined,
      error: undefined,
      audio: { phase: "missing" },
    });
    this.onSubtitles([], this.state);
    void this.tick();
  }
  beginStartupWait() {
    clearTimeout(this.startupTimer);
    this.snapshotController?.abort();
    this.snapshotController = new AbortController();
    this.deadline = Date.now() + 30000;
    const epoch = this.epoch;
    this.startupTimer = setTimeout(() => {
      if (!this.active || epoch !== this.epoch || this.session) return;
      this.emit({
        phase: "error",
        error: this.state.waitReason || "AUDIO_TIMEOUT",
      });
      this.snapshotController.abort();
    }, 30000);
  }
  async tick() {
    if (!this.active || this.pending || this.state.phase === "error") return;
    const epoch = this.epoch,
      video = this.getVideo();
    this.pending = true;
    try {
      const snapshot = await this.bridge.snapshot(
        video.videoId,
        this.snapshotController?.signal
      );
      if (
        epoch !== this.epoch ||
        !this.active ||
        this.state.phase === "error" ||
        snapshot.identity.videoId !== this.getVideo().videoId
      )
        return;
      if (
        this.session &&
        mediaCacheKey(this.session.identity) ===
          mediaCacheKey(snapshot.identity)
      )
        return;
      if (this.session) {
        this.tasks.reset();
        this.feedbackSession++;
        const old = this.session;
        this.session = undefined;
        await old.dispose();
        this.onSubtitles([], this.state);
      }
      await this.cleanup;
      if (epoch !== this.epoch || !this.active || this.state.phase === "error")
        return;
      const setting = this.getSetting(),
        services = resolvedAsrServices(setting);
      if (!services.asrService)
        throw Object.assign(new Error("ASR service unavailable"), {
          code: "SERVICE_UNAVAILABLE",
        });
      const session = this.createSession({
        onTask: (task) => {
          if (epoch === this.epoch && this.active && this.session === session)
            this.tasks.update(task);
        },
        identity: snapshot.identity,
        setting,
        asrService: services.asrService,
        bridge: this.bridge,
        cache: this.cache,
        targetMs: (video.element?.currentTime || 0) * 1000,
        signatures: () =>
          asrCacheSignatures({
            ...services,
            setting,
            language: snapshot.identity.sourceLanguage,
          }),
        getLimits: effectiveAsrLimits,
        textProcessor: createAsrTextProcessor(setting, snapshot.identity),
        onState: (state) => {
          if (epoch === this.epoch && this.active && this.session === session)
            this.emit({
              ...state,
              error: undefined,
              sourceLanguage: snapshot.identity.sourceLanguage,
            });
        },
        onSubtitles: (cues, state) => {
          if (epoch === this.epoch && this.active && this.session === session)
            this.onSubtitles(cues, state);
        },
      });
      this.session = session;
      clearTimeout(this.startupTimer);
      await session.start();
    } catch (cause) {
      if (epoch !== this.epoch || !this.active || cause.name === "AbortError")
        return;
      if (cause.code === "AUDIO_IDENTITY_MISMATCH" && this.session) {
        const old = this.session;
        this.session = undefined;
        this.cleanup = this.cleanup.then(() => old.dispose()).catch(() => {});
        this.beginStartupWait();
        this.state = { phase: "waiting", audio: { phase: "missing" } };
        this.emit({});
        this.onSubtitles([], this.state);
        return;
      }
      if (this.session || Date.now() >= this.deadline) {
        const error = cause.code || "AUDIO_UNAVAILABLE";
        if (this.state.phase !== "error" || this.state.error !== error)
          this.emit({ phase: "error", error });
      } else if (this.state.waitReason !== cause.code) {
        this.emit({ phase: "waiting", waitReason: cause.code });
      }
    } finally {
      this.pending = false;
    }
  }
  beginSeek() {
    clearTimeout(this.seekTimer);
    this.session?.beginSeek();
  }
  seek() {
    clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(
      () =>
        this.session?.seek((this.getVideo().element?.currentTime || 0) * 1000),
      200
    );
  }
  stop() {
    const wasActive = this.active;
    this.active = false;
    this.epoch++;
    clearTimeout(this.seekTimer);
    clearTimeout(this.startupTimer);
    this.snapshotController?.abort();
    const old = this.session;
    this.session = undefined;
    this.cleanup = this.cleanup.then(() => old?.dispose()).catch(() => {});
    if (wasActive) this.bridge.clear();
    this.tasks.stop();
    this.emit({ phase: "off", audio: { phase: "missing" } });
    return this.cleanup;
  }
  async restart() {
    await this.stop();
    this.start();
  }
  async retryRecognition() {
    if (!this.session || this.state.phase === "error") {
      await this.restart();
      return;
    }
    try {
      await this.session.retryRecognition();
    } catch (cause) {
      this.emit({ recognitionError: cause.code || "ASR_FAILED" });
    }
  }
  retryTranslation() {
    this.session?.retryTranslation();
  }
  async deleteCache(restart = false) {
    const identity = this.session?.identity;
    if (!identity) return;
    await this.stop();
    const epoch = this.epoch;
    try {
      await this.cache.deleteVideo(identity);
      if (epoch !== this.epoch || identity.videoId !== this.getVideo().videoId)
        return;
      if (restart) this.start();
    } catch (cause) {
      if (epoch === this.epoch)
        this.emit({
          phase: "error",
          cacheDeleteError: cause.code || "CACHE_UNAVAILABLE",
        });
    }
  }
  exportSentence(cue, { reportError = true } = {}) {
    const session = this.session;
    if (!session || !this.active)
      return Promise.reject(new Error("ASR session unavailable"));
    const key = `${cue.start}:${cue.end}`;
    if (this.rangeExports.has(key)) return this.rangeExports.get(key);
    const prepared = this.prepareAudioRange(cue);
    if (
      reportError &&
      this.state.fullExport !== "failed" &&
      this.state.exportError
    )
      this.emit({ exportError: undefined });
    const job = (async () => {
      await Promise.resolve();
      try {
        const result = await prepared;
        if (session !== this.session || !this.active) return;
        downloadBlobFile(
          result.blob,
          `youtube-${session.identity.videoId}-${Math.round(cue.start)}-${Math.round(cue.end)}.wav`
        );
      } catch (cause) {
        if (cause.name === "AbortError" && session !== this.session) return;
        if (
          reportError &&
          session === this.session &&
          this.active &&
          cause.name !== "AbortError"
        )
          this.emit({ exportError: cause.code || "AUDIO_EXPORT_FAILED" });
        throw cause;
      } finally {
        if (this.rangeExports.get(key) === job) this.rangeExports.delete(key);
      }
    })();
    this.rangeExports.set(key, job);
    return job;
  }
  prepareAudioRange(cue) {
    const session = this.session;
    if (!session || !this.active)
      return Promise.reject(new Error("ASR session unavailable"));
    const key = `${this.epoch}:${this.feedbackSession}:${cue.start}:${cue.end}`;
    if (this.rangePreparations.has(key)) return this.rangePreparations.get(key);
    const job = (async () => {
      await Promise.resolve();
      try {
        const result = await session.exportSentence(cue);
        if (session !== this.session || !this.active)
          throw new DOMException("Cancelled", "AbortError");
        return result;
      } finally {
        if (this.rangePreparations.get(key) === job)
          this.rangePreparations.delete(key);
      }
    })();
    this.rangePreparations.set(key, job);
    return job;
  }
  async prepareSegmentAudio(segment) {
    const row = this.tasks.rows.get(segment.id);
    if (
      !row ||
      row.startMs !== segment.startMs ||
      row.endMs !== segment.endMs ||
      (row.kind === "media" && row.download !== "complete")
    )
      throw Object.assign(new Error("Audio unavailable"), {
        code: "AUDIO_UNAVAILABLE",
      });
    const result = await this.prepareAudioRange({
      start: row.startMs,
      end: row.endMs,
    });
    return result.blob;
  }
  setPlaybackError(segment, code) {
    if (this.active && this.tasks.rows.has(segment.id))
      this.tasks.update({ id: segment.id, playbackError: code });
  }
  async exportSegment(segment) {
    const session = this.session;
    if (!session || !this.active) return;
    const update = (patch) => {
      if (this.session === session && this.active)
        this.tasks.update({ id: segment.id, ...patch });
    };
    update({ exportState: "saving", exportError: undefined });
    try {
      await this.exportSentence(
        { start: segment.startMs, end: segment.endMs },
        { reportError: false }
      );
      update({ exportState: "complete" });
    } catch (cause) {
      update({
        exportState: "failed",
        exportError: cause.code || "AUDIO_EXPORT_FAILED",
      });
    }
  }

  async exportFull() {
    const session = this.session;
    if (!session) return;
    try {
      const result = await session.exportFull();
      if (session === this.session && this.active)
        downloadBlobFile(
          result.blob,
          `youtube-${session.identity.videoId}.m4a`
        );
    } catch (cause) {
      if (
        session === this.session &&
        this.active &&
        cause.name !== "AbortError"
      )
        this.emit({ exportError: cause.code || "AUDIO_EXPORT_FAILED" });
    }
  }
  async dispose() {
    await this.stop();
    this.bridge.dispose();
    this.cache.close();
  }
}
