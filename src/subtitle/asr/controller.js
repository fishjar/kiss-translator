import { logger } from "../../libs/log";
import { YoutubeAudioBridgeClient } from "./audioBridge";
import { AsrCacheClient } from "./cacheBridge";
import { mediaCacheKey } from "./cacheStore";
import { readAsrCache } from "./cacheRecovery";
import { AsrVideoSession } from "./videoSession";
import {
  createAsrTextProcessor,
  effectiveAsrLimits,
  resolvedAsrServices,
} from "./processing";
import { asrCacheSignatures } from "./signatures";
import { AsrTaskStore } from "./tasks";
import { downloadBlobFile } from "../../libs/utils";
import {
  asrLanguagePreferences,
  asrTranslationPreferences,
  translationLanguageOptions,
  asrLanguageOptions,
  resolveAsrLanguage,
  recognitionIdentity,
  audioIdentity,
} from "./language";

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
    languagePreferences = asrLanguagePreferences,
    translationPreferences = asrTranslationPreferences,
    createSession = (options) => new AsrVideoSession(options),
  }) {
    Object.assign(this, {
      getSetting,
      getVideo,
      onState,
      onSubtitles,
      createSession,
      languagePreferences,
      translationPreferences,
    });
    this.bridge =
      bridge ||
      new YoutubeAudioBridgeClient(() => {
        if (this.active) {
          if (this.state.phase === "error") this.retryStartup();
          else void this.tick(true);
        }
      });
    this.cache = cache || new AsrCacheClient();
    this.cache.onAudioCacheCleared = () => {
      void this.resetAudio().catch(() => {});
    };
    this.tasks = new AsrTaskStore(onTasks);
    this.rangeExports = new Map();
    this.rangePreparations = new Map();
    this.state = { phase: "off" };
    this.epoch = 0;
    this.feedbackSession = 0;
    this.cleanup = Promise.resolve();
  }
  service() {
    return resolvedAsrServices(this.getSetting()).asrService;
  }
  async setLanguage(language) {
    const identity = this.session?.identity || this.languageIdentity;
    if (
      !this.active ||
      !identity ||
      identity.videoId !== this.getVideo().videoId ||
      this.state.clearing ||
      (language !== "auto" &&
        !asrLanguageOptions(this.service()).some(
          (option) => option.value === language
        )) ||
      language === this.state.selectedLanguage
    )
      return;
    this.languagePreferences.set(identity, language);
    const old = this.session;
    this.session = undefined;
    if (!this.retainedAudio) this.retainedAudio = old?.takeAudio?.();
    this.epoch++;
    const epoch = this.epoch;
    this.pending = false;
    this.paused = false;
    this.lookupDone = false;
    this.lookupResult = undefined;
    this.feedbackSession++;
    this.tasks.reset();
    this.rangeExports.clear();
    this.rangePreparations.clear();
    clearTimeout(this.seekTimer);
    clearTimeout(this.startupTimer);
    this.snapshotController?.abort();
    this.emit({
      phase: "restoring",
      selectedLanguage: language,
      effectiveLanguage: undefined,
      translationReady: false,
      languageSource: language === "auto" ? undefined : "manual",
      recognition: undefined,
      translation: undefined,
      cutting: undefined,
      recognitionError: undefined,
      error: undefined,
      retrying: false,
      cacheRestored: false,
    });
    this.onSubtitles([], this.state);
    this.cleanup = Promise.allSettled([this.cleanup, old?.dispose?.()]).then(
      () => undefined
    );
    await this.cleanup;
    if (epoch === this.epoch && this.active) {
      this.beginStartupWait();
      void this.tick();
    }
  }
  async setTranslationLanguage(language) {
    const session = this.session;
    if (
      !this.active ||
      !session ||
      !this.state.translationReady ||
      this.state.clearing ||
      session.identity.videoId !== this.getVideo().videoId ||
      language === this.state.translationLanguage ||
      !translationLanguageOptions.some((option) => option.value === language)
    )
      return;
    this.translationPreferences.set(session.identity, language);
    this.emit({ translationLanguage: language });
    const setting = { ...this.getSetting(), toLang: language };
    const processor = createAsrTextProcessor(setting, {
      ...session.identity,
      sourceLanguage: session.language || session.identity.sourceLanguage,
    });
    const signatures =
      session.cacheMode === "session"
        ? undefined
        : asrCacheSignatures({
            ...resolvedAsrServices(setting),
            setting,
            limits: session.limits,
          }).then(({ translation }) => ({
            ...session.signatures,
            translation,
          }));
    try {
      await session.setTranslationTarget(setting, processor, signatures);
    } catch (cause) {
      if (
        this.active &&
        this.session === session &&
        this.state.translationLanguage === language &&
        cause.name !== "AbortError"
      )
        this.emit({ translationError: cause.code || "TRANSLATION_FAILED" });
    }
  }
  emit(patch) {
    this.state = {
      ...this.state,
      ...patch,
      feedbackSession: this.feedbackSession,
      active: !!this.active,
      paused: !!this.paused,
      clearing: this.clearing?.videoId === this.getVideo().videoId,
    };
    if (this.active && this.paused) this.state.phase = "paused";
    if (!this.session)
      this.state.stoppedByError =
        this.active &&
        !this.paused &&
        this.state.phase === "error" &&
        !!this.state.error;
    if (patch.phase === "error" && patch.error) {
      this.state.stoppedByError = !this.session?.state?.working;
      const stage =
        /^(AUDIO_|ATTESTATION_|NEED_PLAYBACK$|WAITING_FOR_PLAYER$)/.test(
          patch.error
        )
          ? "audio"
          : "recognition";
      this.state.failures = [{ stage, code: patch.error }];
    }
    if (!this.active || this.paused || this.state.retrying)
      this.state.stoppedByError = false;
    this.onState(this.state);
  }
  start() {
    if (
      this.active ||
      this.clearing?.videoId === this.getVideo().videoId ||
      !this.service() ||
      !this.getVideo().videoId
    )
      return;
    this.paused = false;
    this.cacheMode = this.getVideo().cacheMode || "persistent";
    this.lookupDone = false;
    this.lookupResult = undefined;
    if (this.cacheMode === "session" && this.cache.port)
      this.cache.disconnect?.(
        new DOMException("Session-only page", "AbortError")
      );
    this.active = true;
    this.feedbackSession++;
    this.cache.traceId = `${this.getVideo().videoId}-${this.epoch}-${Date.now()}`;
    this.tasks.reset();
    this.beginStartupWait();
    this.attachVideoListeners();
    this.emit({
      phase: this.cacheMode === "session" ? "waiting" : "restoring",
      cacheMode: this.cacheMode,
      retrying: false,
      recognition: undefined,
      translation: undefined,
      cutting: undefined,
      recognitionError: undefined,
      selectedLanguage: "auto",
      effectiveLanguage: undefined,
      languageSource: undefined,
      translationReady: false,
      cacheRestored: false,
      timingSource: undefined,
      error: undefined,
      cacheDeleteError: undefined,
      audio: { phase: "missing" },
    });
    this.onSubtitles([], this.state);
    void this.tick();
  }
  attachVideoListeners() {
    this.detachVideoListeners();
    const element = this.getVideo().element;
    if (!element || typeof element.addEventListener !== "function") return;
    this.videoElement = element;
    this.handleVideoPlay = () => {
      if (!this.active) return;
      if (
        this.state.phase === "error" ||
        !this.session ||
        this.state.waitReason === "NEED_PLAYBACK"
      ) {
        this.retryStartup();
      } else if (
        this.session &&
        !this.session.cacheHit &&
        !this.session.download &&
        (this.getSetting()?.audioCacheLimit ?? 100) > 0 &&
        typeof this.session.ensureDownload === "function"
      ) {
        const download = this.session.ensureDownload();
        if (!this.session.asrLease) {
          this.session.asrLease = download.acquire("asr");
          this.session.asrLease.ready.then(
            () => this.session?.wake?.(),
            () => this.session?.wake?.()
          );
        }
      }
    };
    element.addEventListener("play", this.handleVideoPlay);
    element.addEventListener("playing", this.handleVideoPlay);
  }
  detachVideoListeners() {
    if (
      this.videoElement &&
      this.handleVideoPlay &&
      typeof this.videoElement.removeEventListener === "function"
    ) {
      this.videoElement.removeEventListener("play", this.handleVideoPlay);
      this.videoElement.removeEventListener("playing", this.handleVideoPlay);
    }
    this.videoElement = undefined;
    this.handleVideoPlay = undefined;
  }
  retryStartup() {
    if (!this.active) return;
    this.beginStartupWait();
    if (this.session && (this.state.phase === "error" || this.state.error)) {
      const old = this.session;
      this.session = undefined;
      this.cleanup = this.cleanup.then(() => old.dispose()).catch(() => {});
    }
    this.emit({
      phase: "restoring",
      waitReason: undefined,
      error: undefined,
    });
    if (this.pending) {
      this.needRetry = true;
    } else {
      void this.tick();
    }
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
  #createSessionInstance({
    identity,
    services,
    setting,
    epoch,
    video,
    signatures,
    audioSessionId,
    audioLookup,
    restoreText,
    audioCacheStatus,
  }) {
    let session;
    const savedTarget = this.translationPreferences.get(identity);
    const targetLanguage = translationLanguageOptions.some(
      (option) => option.value === savedTarget
    )
      ? savedTarget
      : setting.toLang || "en";
    setting = { ...setting, toLang: targetLanguage };
    const selectedLanguage = this.languagePreferences.get(identity);
    const options = asrLanguageOptions(services.asrService);
    const selected =
      selectedLanguage === "auto" ||
      options.some((option) => option.value === selectedLanguage)
        ? selectedLanguage
        : "auto";
    const language = resolveAsrLanguage(
      identity,
      selected,
      services.asrService
    );
    this.languageIdentity = identity;
    this.emit({
      selectedLanguage: selected,
      languageOptions: options,
      translationLanguage: targetLanguage,
      translationReady: false,
      effectiveLanguage: language === "auto" ? undefined : language,
      languageSource:
        selected !== "auto"
          ? "manual"
          : language !== "auto"
            ? identity.sourceLanguage === "auto"
              ? "model"
              : "track"
            : undefined,
    });
    const retained = this.retainedAudio;
    const retainedAudio =
      retained &&
      mediaCacheKey(retained.download.identity) === mediaCacheKey(identity)
        ? retained
        : undefined;
    if (retained && !retainedAudio) {
      retained.release();
      void retained.download.dispose();
    }
    this.retainedAudio = undefined;
    session = this.createSession({
      onTask: (task) => {
        if (epoch === this.epoch && this.active && this.session === session)
          this.tasks.update(task);
      },
      identity,
      textIdentity: recognitionIdentity(
        identity,
        selected,
        services.asrService
      ),
      language,
      selectedLanguage: selected,
      retainedAudio,
      cacheMode: video.cacheMode || "persistent",
      audioLookup,
      restoreText,
      audioSessionId,
      audioCacheStatus:
        video.cacheMode === "session"
          ? undefined
          : audioCacheStatus || (audioSessionId ? "partial" : "miss"),
      deferAudio: true,
      setting,
      asrService: services.asrService,
      bridge: this.bridge,
      cache: this.cache,
      targetMs: (video.element?.currentTime || 0) * 1000,
      signatures:
        typeof signatures === "function"
          ? (limits) => signatures(limits, selected, targetLanguage)
          : () => signatures,
      getLimits: effectiveAsrLimits,
      textProcessor: createAsrTextProcessor(setting, {
        ...identity,
        sourceLanguage: language,
      }),
      onState: (state) => {
        if (epoch === this.epoch && this.active && this.session === session)
          this.emit({
            ...state,
            error: undefined,
            waitReason: undefined,
            sourceLanguage: identity.sourceLanguage,
          });
      },
      onSubtitles: (cues, state) => {
        if (epoch === this.epoch && this.active && this.session === session)
          this.onSubtitles(cues, state);
      },
    });
    return session;
  }
  async #startSessionAudio(session, setting, epoch) {
    if (epoch !== this.epoch || !this.active || this.session !== session)
      return;
    if ((setting?.audioCacheLimit ?? 100) <= 0 && !session.missing?.().length)
      return;
    if (typeof session.resumeAudio === "function") {
      await session.resumeAudio();
    } else if (typeof session.ensureDownload === "function") {
      const download = session.ensureDownload();
      if (!session.asrLease) {
        session.asrLease = download.acquire("asr");
        session.asrLease.ready.then(
          () => session.wake?.(),
          () => session.wake?.()
        );
      }
    }
  }
  pause() {
    if (!this.active || this.state.clearing) return;
    this.paused = true;
    this.session?.pause?.();
    this.emit({});
  }
  resume() {
    if (!this.active || this.state.clearing) return;
    this.paused = false;
    this.session?.resume?.();
    this.emit({ phase: this.session?.state?.phase || "waiting" });
  }
  async tick(refreshIdentity = false) {
    if (!this.active || this.state.phase === "error") return;
    if (this.pending) {
      this.refreshIdentity ||= refreshIdentity;
      return;
    }
    const epoch = this.epoch,
      video = this.getVideo(),
      signal = this.snapshotController?.signal;
    if (!video.videoId) return;
    if (video.element && video.element !== this.videoElement) {
      this.attachVideoListeners();
    }
    if (
      this.session &&
      !refreshIdentity &&
      (this.session.cacheMode || "persistent") ===
        (video.cacheMode || "persistent") &&
      (this.session.cacheHit ||
        this.state.phase === "cached" ||
        this.state.phase === "complete")
    ) {
      return;
    }
    this.pending = true;
    try {
      const sessionMode = video.cacheMode === "session";
      const setting = this.getSetting(),
        services = resolvedAsrServices(setting);
      if (!services.asrService)
        throw Object.assign(new Error("SERVICE_UNAVAILABLE"), {
          code: "SERVICE_UNAVAILABLE",
        });
      const snapshotStarted = performance.now();
      const player = Promise.resolve()
        .then(() => this.bridge.snapshot(video.videoId, signal))
        .then(
          (value) => {
            logger.child("subtitle").debug("[YouTube ASR] player parameters", {
              traceId: this.cache.traceId,
              videoId: video.videoId,
              ms: performance.now() - snapshotStarted,
            });
            return { value };
          },
          (cause) => {
            logger.child("subtitle").debug("[YouTube ASR] player parameters", {
              traceId: this.cache.traceId,
              videoId: video.videoId,
              ms: performance.now() - snapshotStarted,
              code: cause.code,
            });
            return { cause };
          }
        );
      let lookup = this.lookupResult;
      if (!this.session && !sessionMode) {
        if (!this.lookupDone) {
          lookup = await readAsrCache(async () => {
            if (this.cache.lookupCache)
              return this.cache.lookupCache(
                { videoId: video.videoId },
                { signal }
              );
            const subtitle = await this.cache.getVideo(
              { videoId: video.videoId },
              undefined,
              { signal, metadataOnly: true }
            );
            return {
              subtitle,
              audio:
                (await this.cache.findAudioSession?.(
                  { videoId: video.videoId },
                  { signal }
                )) || null,
            };
          }, signal);
          if (epoch !== this.epoch || !this.active) return;
          this.lookupResult = lookup;
          this.lookupDone = true;
        }
      }
      if (epoch !== this.epoch || !this.active) return;
      if (this.state.phase === "restoring")
        this.emit({
          phase: "waiting",
          audio: {
            phase: "idle",
            cacheStatus: sessionMode
              ? undefined
              : lookup?.audio
                ? "partial"
                : "miss",
          },
        });
      const snapshot = await player;
      if (epoch !== this.epoch || !this.active || signal?.aborted) return;
      const candidate = lookup?.subtitle || lookup?.audio;
      const identity =
        snapshot.value?.identity ||
        (candidate?.identity && audioIdentity(candidate.identity));
      if (!identity)
        throw (
          snapshot.cause ||
          Object.assign(new Error("WAITING_FOR_PLAYER"), {
            code: "WAITING_FOR_PLAYER",
          })
        );
      if (identity.videoId !== this.getVideo().videoId) return;
      if (
        this.session &&
        mediaCacheKey(this.session.identity) === mediaCacheKey(identity) &&
        (this.session.cacheMode || "persistent") ===
          (video.cacheMode || "persistent")
      ) {
        if (refreshIdentity && this.session.download?.error)
          this.session.download.retry();
        return;
      }
      const replacing = !!this.session;
      if (this.session) {
        const old = this.session;
        this.session = undefined;
        this.tasks.reset();
        this.feedbackSession++;
        const disposing = old.dispose();
        if (!sessionMode) await disposing;
        else void disposing.catch(() => {});
        this.onSubtitles([], this.state);
      }
      if (!sessionMode) await this.cleanup;
      if (epoch !== this.epoch || !this.active || signal?.aborted) return;
      // Only re-query when the player's actual media identity differs from the candidate.
      if (
        !sessionMode &&
        lookup !== null &&
        (replacing ||
          (candidate &&
            mediaCacheKey(candidate.identity) !== mediaCacheKey(identity)))
      ) {
        lookup = await readAsrCache(
          () =>
            this.cache.lookupCache
              ? this.cache.lookupCache(
                  { videoId: video.videoId, identity },
                  { signal }
                )
              : this.cache
                  .findAudioSession?.(identity, { signal })
                  .then((audio) => ({ audio })),
          signal
        );
      }
      const audio =
        lookup?.audio &&
        mediaCacheKey(lookup.audio.identity) === mediaCacheKey(identity)
          ? lookup.audio
          : null;
      const session = this.#createSessionInstance({
        identity,
        services,
        setting,
        epoch,
        video,
        audioSessionId: audio?.sessionId,
        audioLookup: this.cache.lookupCache
          ? lookup === null
            ? false
            : audio
          : undefined,
        restoreText: !this.cache.lookupCache || lookup !== null,
        audioCacheStatus: sessionMode ? undefined : audio ? "partial" : "miss",
        signatures: sessionMode
          ? undefined
          : (limits, selected, toLang) =>
              asrCacheSignatures({
                ...services,
                setting: { ...setting, toLang },
                language:
                  selected === "auto" ? identity.sourceLanguage : selected,
                limits,
              }),
      });
      this.session = session;
      if (this.paused) session.pause?.();
      clearTimeout(this.startupTimer);
      await session.start();
      if (epoch === this.epoch && this.active && this.session === session)
        this.emit({ translationReady: true });
      await this.#startSessionAudio(session, setting, epoch);
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
      const isComplete =
        this.session &&
        (this.session.cacheHit ||
          this.state.phase === "cached" ||
          this.state.phase === "complete");
      if (!isComplete) {
        if (this.session || Date.now() >= this.deadline) {
          const error = cause.code || "AUDIO_UNAVAILABLE";
          if (this.state.phase !== "error" || this.state.error !== error)
            this.emit({ phase: "error", error });
        } else if (this.state.waitReason !== cause.code) {
          this.emit({ phase: "waiting", waitReason: cause.code });
        }
      }
    } finally {
      if (epoch === this.epoch) {
        this.pending = false;
        if ((this.needRetry || this.refreshIdentity) && this.active) {
          const refresh = this.refreshIdentity;
          this.refreshIdentity = false;
          this.needRetry = false;
          void this.tick(refresh);
        }
      }
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
    this.paused = false;
    this.epoch++;
    this.detachVideoListeners();
    clearTimeout(this.seekTimer);
    clearTimeout(this.startupTimer);
    this.snapshotController?.abort();
    const old = this.session;
    this.session = undefined;
    const disposing = old?.dispose?.();
    const retained = this.retainedAudio;
    this.retainedAudio = undefined;
    retained?.release();
    this.cleanup = Promise.allSettled([
      this.cleanup,
      disposing,
      retained?.download.dispose(),
    ]).then(() => undefined);
    this.pending = false;
    if (wasActive) this.bridge.clear();
    this.tasks.stop();
    this.emit({ phase: "off", retrying: false, audio: { phase: "missing" } });
    return this.cleanup;
  }
  async restart() {
    const stopping = this.stop();
    if (this.getVideo().cacheMode !== "session") await stopping;
    this.start();
  }
  async retryIncomplete() {
    if (!this.state.stoppedByError) return;
    await this.retryRecognition(undefined, true);
  }
  async retryRecognition(taskId, recoverAll = false) {
    if (!this.active || this.paused || this.state.retrying) return;
    if (
      taskId !== undefined &&
      this.tasks.rows.get(taskId)?.recognition !== "failed"
    )
      return;
    if (taskId !== undefined && !this.session) return;
    const failed = this.tasks
      .snapshot()
      .filter(
        (task) =>
          task.recognition === "failed" &&
          (taskId === undefined || task.id === taskId)
      );
    for (const task of failed)
      this.tasks.update({
        id: task.id,
        recognition: "queued",
        errorCode: undefined,
        errorDetail: undefined,
        retrying: true,
      });
    if (
      !this.session ||
      (taskId === undefined &&
        this.state.phase === "error" &&
        (!recoverAll || this.state.error))
    ) {
      this.retryStartup();
      return;
    }
    const session = this.session,
      epoch = this.epoch;
    let retryError;
    if (taskId === undefined)
      this.emit({ retrying: true, recognitionError: undefined });
    try {
      if (recoverAll) await session.retryIncomplete();
      else await session.retryRecognition(taskId);
    } catch (cause) {
      if (epoch !== this.epoch || this.session !== session || !this.active)
        return;
      retryError = cause.code || "ASR_FAILED";
      for (const task of failed)
        if (this.tasks.rows.get(task.id)?.recognition === "queued")
          this.tasks.update({
            ...task,
            errorCode: cause.code || "ASR_FAILED",
            errorDetail: cause.message,
            retrying: false,
          });
      this.emit({ recognitionError: retryError });
    } finally {
      if (
        taskId === undefined &&
        epoch === this.epoch &&
        this.session === session &&
        this.active
      ) {
        if (retryError) {
          this.emit({
            retrying: false,
            stoppedByError: !session.state?.working,
            failures: [{ stage: "recognition", code: retryError }],
          });
        } else {
          this.emit({
            retrying: false,
            stoppedByError: !!session.state?.stoppedByError,
          });
        }
      }
    }
  }

  retryTranslation(taskId) {
    if (!this.active || this.paused || !this.session) return;
    if (
      taskId !== undefined &&
      this.tasks.rows.get(taskId)?.translation !== "failed"
    )
      return;
    this.session.retryTranslation(taskId);
  }
  async deleteCache(restart = false) {
    return this.clearCache("recognition", restart);
  }
  async clearCache(kind, restart = false) {
    const session = this.session;
    if (!session || this.clearing?.videoId === session.identity.videoId) return;
    const { identity, cacheMode = this.cacheMode } = session;
    const sessionId = session.download?.sessionId || session.audioSessionId;
    const clearing = { videoId: identity.videoId };
    this.clearing = clearing;
    const stopping = this.stop(),
      epoch = this.epoch;
    this.tasks.reset();
    this.rangeExports.clear();
    this.rangePreparations.clear();
    this.emit({
      clearing: true,
      cutting: undefined,
      recognition: undefined,
      translation: undefined,
      recognitionError: undefined,
      translationError: undefined,
      cacheDeleteError: undefined,
      exportError: undefined,
    });
    try {
      await stopping;
      if (cacheMode !== "session") {
        if (kind === "audio") await this.cache.deleteAudio(sessionId, identity);
        else await this.cache.deleteVideo(session.textIdentity || identity);
      }
      if (epoch !== this.epoch || identity.videoId !== this.getVideo().videoId)
        return;
      this.lookupDone = false;
      this.lookupResult = undefined;
    } catch (cause) {
      if (epoch === this.epoch && identity.videoId === this.getVideo().videoId)
        this.emit({
          cacheDeleteError: cause.code || "CACHE_UNAVAILABLE",
        });
      restart = false;
    } finally {
      if (this.clearing === clearing) {
        this.clearing = undefined;
        if (identity.videoId === this.getVideo().videoId) {
          this.emit({ clearing: false });
          if (restart && epoch === this.epoch) this.start();
        }
      }
    }
  }
  async resetAudio(remove) {
    const session = this.session,
      epoch = this.epoch;
    if (!session || !this.active) return;
    this.rangeExports.clear();
    this.rangePreparations.clear();
    const reset = session.resetAudio(remove);
    for (const row of this.tasks.snapshot()) {
      if (row.kind === "media")
        this.tasks.update({
          id: row.id,
          download: "idle",
          downloadProgress: 0,
          downloadBytes: 0,
          playbackError: undefined,
        });
    }
    this.emit({
      audioCoverageMs: 0,
      audioBytes: 0,
      audioSessionReady: false,
      audio: { phase: "missing", bytes: 0 },
    });
    try {
      await reset;
    } catch (cause) {
      if (
        epoch === this.epoch &&
        this.session === session &&
        this.active &&
        cause.name !== "AbortError"
      )
        this.emit({ exportError: cause.code || "AUDIO_DELETE_FAILED" });
      throw cause;
    }
  }
  async deleteAudio() {
    return this.clearCache("audio");
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
          `youtube-${session.identity.videoId}-${Math.round(cue.start)}-${Math.round(cue.end)}.m4a`
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
    if (this.cacheMode !== "session" || this.cache.port) this.cache.close();
  }
}
