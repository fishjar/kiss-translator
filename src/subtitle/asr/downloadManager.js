import { logger } from "../../libs/log";
import { SessionAudioStorage } from "./sessionStorage";
import { mediaCacheKey } from "./cacheStore";
import { audioSessionId, readAsrCache } from "./cacheRecovery";

const fail = (code, extra = {}) =>
  Object.assign(new Error(code), { code, ...extra });
const cooldowns = new Map();
const abortError = () => new DOMException("Cancelled", "AbortError");
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason || abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
export function retryAfterDeadline(value, now = Date.now()) {
  if (typeof value !== "string") return now;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0
    ? now + seconds * 1000
    : Math.max(now, Date.parse(value) || now);
}

/** One shared sequential downloader per video; seeks only change recognition priority. */
export class AudioDownloadManager {
  constructor({
    bridge,
    cache,
    identity,
    cacheMode = "persistent",
    audioLookup,
    sessionId,
    persistAudio = false,
    waitUntilRunning = async () => {},
    onState = () => {},
    onSegment = () => {},
    onTask = () => {},
    now = Date.now,
    wait = sleep,
  }) {
    Object.assign(this, {
      bridge,
      cache,
      identity,
      cacheMode,
      audioLookup,
      persistAudio,
      waitUntilRunning,
      onState,
      onSegment,
      onTask,
      now,
      wait,
    });
    this.sessionId = sessionId;
    this.memory = new SessionAudioStorage();
    this.memoryOnly = cacheMode === "session" || audioLookup === false;
    this.cacheWriteFailed = false;
    this.bound = false;
    this.owners = new Map();
    this.index = new Map();
    this.bytes = 0;
    this.coverageMs = 0;
    this.state = {
      phase: "idle",
      cacheStatus: this.cacheMode === "session" ? undefined : "miss",
      source: "sequential",
      bytes: 0,
      coverageMs: 0,
      expectedMs: identity.durationMs,
      percent: 0,
    };
  }
  emit(patch = {}) {
    this.state = {
      ...this.state,
      ...patch,
      bytes: this.bytes,
      coverageMs: this.coverageMs,
      expectedMs: this.identity.durationMs,
      percent: Math.min(
        100,
        (this.coverageMs / this.identity.durationMs) * 100
      ),
    };
    this.onState(this.state);
  }
  complete() {
    return (
      this.index.has(0) &&
      Number.isSafeInteger(this.expectedSegments) &&
      this.expectedSegments > 0 &&
      this.lastIndex === this.expectedSegments &&
      Math.abs(this.coverageMs - this.expectedEndMs) <= 100
    );
  }
  ready(targetMs) {
    return (
      this.index.has(0) &&
      (targetMs === Infinity
        ? this.complete()
        : this.coverageMs >= Math.min(targetMs, this.identity.durationMs))
    );
  }
  settleOwners() {
    for (const owner of this.owners.values())
      if (!owner.settled && this.ready(owner.targetMs)) {
        owner.settled = true;
        owner.resolve();
      }
  }
  acquire(ownerId, targetMs = Infinity) {
    if (this.disposed) throw fail("AUDIO_SESSION_CLOSED");
    if (this.error && this.state.cooldownUntil > this.now()) throw this.error;
    if (
      !ownerId ||
      this.owners.has(ownerId) ||
      (targetMs !== Infinity && (!Number.isFinite(targetMs) || targetMs <= 0))
    )
      throw fail("INVALID_AUDIO_RANGE");
    let resolve, reject;
    const ready = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    ready.catch(() => {});
    const owner = { targetMs, resolve, reject, settled: false };
    this.owners.set(ownerId, owner);
    this.settleOwners();
    if (
      this.error &&
      (!this.state.cooldownUntil || this.state.cooldownUntil <= this.now())
    )
      this.error = undefined;
    this.kick();
    return {
      ready,
      release: () => {
        if (!this.owners.delete(ownerId)) return;
        if (!owner.settled) {
          owner.settled = true;
          owner.reject(abortError());
        }
        if (!this.owners.size) this.controller?.abort();
      },
    };
  }
  kick() {
    if (
      this.running ||
      this.disposed ||
      this.error ||
      !this.owners.size ||
      [...this.owners.values()].every((owner) => this.ready(owner.targetMs))
    )
      return;
    const controller = (this.controller = new AbortController());
    this.running = this.pump(controller.signal)
      .catch((cause) => {
        if (controller.signal.aborted || this.disposed) {
          this.emit({ phase: "paused" });
          return;
        }
        this.error = cause;
        this.emit({
          phase: "error",
          code: cause.code || "AUDIO_NETWORK",
          cooldownUntil: cause.cooldownUntil || 0,
        });
        for (const owner of this.owners.values())
          if (!owner.settled) {
            owner.settled = true;
            owner.reject(cause);
          }
      })
      .finally(() => {
        this.running = undefined;
        if (this.controller === controller) this.controller = undefined;
        this.kick();
      });
  }
  async awaitRunning(signal) {
    const started = this.now();
    await this.waitUntilRunning(signal);
    if (signal.aborted) throw signal.reason || abortError();
    // User pause time is not a network stall.
    if (this.lastProgress !== undefined)
      this.lastProgress += this.now() - started;
  }
  async begin(positionMs, signal) {
    await this.awaitRunning(signal);
    const metadata = await this.bridge.open(
      this.identity.videoId,
      this.sessionId,
      positionMs,
      signal
    );
    if (mediaCacheKey(metadata.identity) !== mediaCacheKey(this.identity))
      throw fail("AUDIO_IDENTITY_MISMATCH");
    if (this.state.reconnecting) this.emit({ reconnecting: false });
  }
  async next(signal) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.awaitRunning(signal);
      if (signal.aborted) throw signal.reason || abortError();
      const remaining = 30000 - (this.now() - this.lastProgress);
      if (remaining <= 0) throw fail("AUDIO_STALLED");
      const request = new AbortController(),
        cancel = () => request.abort();
      signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(
        () => request.abort(),
        Math.min(15000, remaining)
      );
      try {
        return await this.bridge.next(
          this.identity.videoId,
          this.sessionId,
          request.signal
        );
      } catch (error) {
        let cause = error;
        if (signal.aborted) throw signal.reason || abortError();
        if (request.signal.aborted)
          cause = fail(
            this.now() - this.lastProgress >= 30000
              ? "AUDIO_STALLED"
              : "AUDIO_TIMEOUT"
          );
        if (cause.code === "AUDIO_RATE_LIMITED") {
          const deadline = retryAfterDeadline(cause.retryAfter, this.now());
          cause.cooldownUntil = deadline;
          cooldowns.set(mediaCacheKey(this.identity), deadline);
          this.emit({ cooldownUntil: deadline, reconnecting: true });
          if (attempt === 2 || deadline - this.lastProgress >= 30000)
            throw cause;
          await this.wait(Math.max(0, deadline - this.now()), signal);
          continue;
        }
        if (
          attempt === 2 ||
          !(
            cause.code === "AUDIO_NETWORK" ||
            cause.code === "AUDIO_TIMEOUT" ||
            cause.code === "TIMEOUT" ||
            cause.status >= 500
          )
        )
          throw cause;
        this.emit({ reconnecting: true });
        await this.wait(attempt === 0 ? 1000 : 3000, signal);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
      }
    }
  }
  async pump(signal) {
    const key = mediaCacheKey(this.identity);
    for (const [entry, until] of cooldowns)
      if (until <= this.now()) cooldowns.delete(entry);
    const until = cooldowns.get(key) || 0;
    if (until > this.now()) {
      this.emit({ phase: "cooldown", cooldownUntil: until });
      await this.wait(until - this.now(), signal);
      if (signal.aborted) throw signal.reason || abortError();
    }
    this.emit({
      phase: this.memoryOnly ? "fetching" : "restoring",
      cacheStatus: this.cacheMode === "session" ? undefined : "checking",
      code: undefined,
      cooldownUntil: 0,
    });
    let existing = [];
    if (!this.memoryOnly && !this.bound) {
      const restored = await readAsrCache(async () => {
        const found =
          this.audioLookup !== undefined
            ? this.audioLookup
            : await this.cache.findAudioSession?.(this.identity, { signal });
        this.sessionId =
          found?.sessionId ||
          this.sessionId ||
          (await audioSessionId(this.identity, key));
        if (signal.aborted) throw signal.reason || abortError();
        await this.cache.beginAudio(this.sessionId, this.identity, { signal });
        this.bound = true;
        return {
          rows:
            this.audioLookup === null
              ? []
              : found?.index ||
                (await this.cache.listAudio?.(this.sessionId, { signal })) ||
                [],
        };
      }, signal);
      if (restored) existing = restored.rows;
      else this.memoryOnly = true;
    }
    this.sessionId ||=
      this.cacheMode === "session"
        ? `session-${this.identity.videoId}`
        : await audioSessionId(this.identity, key);
    this.lastProgress = this.now();
    if (this.index.size === 0) {
      if (existing.length) {
        let totalBytes = 0;
        let lastIdx = 0;
        let end = 0;
        for (const seg of existing) {
          this.index.set(seg.index, seg);
          totalBytes += seg.bytes;
          if (seg.index > 0) {
            this.onTask({
              id: `media-${seg.index}`,
              kind: "media",
              index: seg.index,
              startMs: seg.startMs,
              endMs: seg.endMs,
              bytes: seg.bytes,
              download: "complete",
            });
          }
          this.onSegment(seg);
        }
        while (this.index.has(lastIdx + 1)) {
          const part = this.index.get(++lastIdx);
          if (Math.abs(part.startMs - end) > 1) throw fail("AUDIO_GAP");
          end = part.endMs;
        }
        this.bytes = totalBytes;
        this.lastIndex = lastIdx;
        this.coverageMs = end;
        this.settleOwners();
        this.emit();
        if (
          this.index.has(0) &&
          (Math.abs(this.coverageMs - this.identity.durationMs) <= 100 ||
            this.coverageMs >= this.identity.durationMs)
        ) {
          this.expectedSegments = lastIdx;
          this.expectedEndMs = this.coverageMs;
          this.emit({ phase: "complete", cacheStatus: "hit", percent: 100 });
          this.settleOwners();
          return;
        }
      }
    }
    this.emit({
      phase: "fetching",
      cacheStatus:
        this.cacheMode === "session"
          ? undefined
          : this.coverageMs > 0
            ? "partial"
            : "miss",
    });
    let wireEnd = this.coverageMs,
      fallbackUsed = false,
      refreshed = false,
      empty = 0;
    let canFallback = this.coverageMs > 0;
    await this.begin(this.coverageMs, signal);
    while (this.owners.size && !signal.aborted) {
      if (
        [...this.owners.values()].every((owner) => this.ready(owner.targetMs))
      )
        break;
      let result;
      try {
        result = await this.next(signal);
      } catch (cause) {
        if (signal.aborted) throw cause;
        if (
          !refreshed &&
          [
            "AUDIO_AUTH_EXPIRED",
            "ATTESTATION_REJECTED",
            "ATTESTATION_PENDING",
            "AUDIO_EMPTY",
          ].includes(cause.code)
        ) {
          refreshed = true;
          this.emit({ reconnecting: true });
          canFallback ||= this.coverageMs > 0;
          await this.begin(this.coverageMs, signal);
          continue;
        }
        if (
          canFallback &&
          !fallbackUsed &&
          ["ATTESTATION_PENDING", "AUDIO_EMPTY", "AUDIO_NO_PROGRESS"].includes(
            cause.code
          )
        ) {
          fallbackUsed = true;
          this.emit({ reconnecting: true });
          wireEnd = 0;
          empty = 0;
          await this.begin(0, signal);
          continue;
        }
        throw cause;
      }
      if (result.expectedSegments !== undefined) {
        if (
          this.expectedSegments &&
          this.expectedSegments !== result.expectedSegments
        )
          throw fail("AUDIO_IDENTITY_MISMATCH");
        this.expectedSegments = result.expectedSegments;
      }
      if (this.state.reconnecting) this.emit({ reconnecting: false });
      if (result.expectedEndMs !== undefined) {
        if (Math.abs(result.expectedEndMs - this.identity.durationMs) > 100)
          throw fail("AUDIO_IDENTITY_MISMATCH");
        this.expectedEndMs = result.expectedEndMs;
      }
      const incomingEnd = Math.max(
        0,
        ...result.segments
          .filter((segment) => segment.index)
          .map((segment) => segment.endMs)
      );
      if (incomingEnd > wireEnd) {
        wireEnd = incomingEnd;
        this.lastProgress = this.now();
        empty = 0;
      } else empty++;
      for (const segment of [...result.segments].sort(
        (a, b) => a.index - b.index
      )) {
        if (signal.aborted) throw abortError();
        if (this.expectedSegments && segment.index > this.expectedSegments)
          throw fail("INVALID_AUDIO_SEGMENT");
        if (this.index.has(segment.index)) {
          const previous = this.index.get(segment.index);
          if (
            previous.startMs !== segment.startMs ||
            previous.endMs !== segment.endMs ||
            previous.bytes !== segment.data.byteLength
          )
            throw fail("AUDIO_SEGMENT_MISMATCH");
          continue;
        }
        const task = {
          id: `media-${segment.index}`,
          kind: "media",
          index: segment.index,
          startMs: segment.startMs,
          endMs: segment.endMs,
          bytes: segment.data.byteLength,
        };
        if (segment.index > 0) this.onTask({ ...task, download: "saving" });
        try {
          await this.memory.putAudio(this.sessionId, segment);
          if (!this.memoryOnly && !this.cacheWriteFailed) {
            try {
              await this.cache.putAudio(this.sessionId, segment, { signal });
            } catch (cause) {
              if (signal.aborted || cause.code === "STALE_VIDEO") throw cause;
              logger.child("subtitle").debug("[YouTube ASR cache] write failed; using session audio", cause.code || cause.name);
              // Restored segments may still be readable from persistent storage.
              this.cacheWriteFailed = true;
            }
          }
          if (segment.index > 0 && !signal.aborted)
            this.onTask({
              ...task,
              download: "complete",
              errorCode: undefined,
            });
        } catch (cause) {
          if (segment.index > 0 && !signal.aborted)
            this.onTask({
              ...task,
              download: "failed",
              errorCode: cause.code || "AUDIO_CACHE_FAILED",
            });
          throw cause;
        }
        const metadata = {
          index: segment.index,
          startMs: segment.startMs,
          endMs: segment.endMs,
          bytes: segment.data.byteLength,
        };
        this.index.set(segment.index, metadata);
        this.bytes += metadata.bytes;
        this.lastIndex = 0;
        let end = 0;
        while (this.index.has(this.lastIndex + 1)) {
          const part = this.index.get(++this.lastIndex);
          if (Math.abs(part.startMs - end) > 1) throw fail("AUDIO_GAP");
          end = part.endMs;
        }
        this.coverageMs = end;
        this.emit();
        this.onSegment(metadata);
        this.settleOwners();
      }
      if (this.complete()) {
        this.emit({ phase: "complete", percent: 100 });
        this.settleOwners();
        break;
      }
      if (empty) {
        if (this.now() - this.lastProgress >= 30000)
          throw fail("AUDIO_STALLED");
        if (result.protection === 2 || empty > 2) {
          if (!refreshed) {
            refreshed = true;
            this.emit({ reconnecting: true });
            canFallback ||= this.coverageMs > 0;
            empty = 0;
            await this.begin(this.coverageMs, signal);
            continue;
          }
          if (canFallback && !fallbackUsed) {
            fallbackUsed = true;
            this.emit({ reconnecting: true });
            wireEnd = 0;
            empty = 0;
            await this.begin(0, signal);
            continue;
          }
          throw fail(
            result.protection === 2
              ? "ATTESTATION_PENDING"
              : "AUDIO_NO_PROGRESS"
          );
        }
        await this.wait(empty === 1 ? 1000 : 3000, signal);
      }
      if (result.backoffMs > 0) {
        if (this.now() + result.backoffMs - this.lastProgress >= 30000)
          throw fail("AUDIO_STALLED");
        await this.wait(result.backoffMs, signal);
      }
    }
    if (!this.complete() && !signal.aborted) this.emit({ phase: "paused" });
  }
  retry() {
    if (this.state.cooldownUntil > this.now()) return false;
    this.error = undefined;
    this.kick();
    return true;
  }
  invalidate() {
    this.index.clear();
    this.bytes = 0;
    this.coverageMs = 0;
    this.lastIndex = 0;
    this.expectedSegments = undefined;
    this.expectedEndMs = undefined;
    this.emit({
      phase: "idle",
      cacheStatus: this.cacheMode === "session" ? undefined : "miss",
      bytes: 0,
      coverageMs: 0,
      percent: 0,
    });
  }
  async readAudio(index, options = {}) {
    if (options.signal?.aborted) throw options.signal.reason || abortError();
    const local = await this.memory.getAudio(this.sessionId, index);
    if (local || this.memoryOnly) return local;
    const row = await readAsrCache(
      () => this.cache.getAudio(this.sessionId, index, options),
      options.signal
    );
    if (row) return row;
    // Cached metadata is unusable: fetch fresh audio without deleting persistent data.
    this.memoryOnly = true;
    this.controller?.abort();
    this.invalidate();
    this.error = undefined;
    if (options.recover !== false) this.kick();
    throw fail("AUDIO_CACHE_MISSING", { cacheReadError: true });
  }
  async *segmentsFor(startMs = 0, endMs = Infinity, options = {}) {
    // Exports report a missing cache to the caller; only the next click downloads.
    const readOptions = { ...options, recover: false };
    const metadata = [...this.index.values()].sort((a, b) => a.index - b.index);
    let previous;
    for (const part of metadata) {
      if (part.index && (part.endMs < startMs || part.startMs >= endMs)) {
        if (part.endMs < startMs) previous = part;
        continue;
      }
      if (part.index && previous) {
        const row = await this.readAudio(previous.index, readOptions);
        if (!row) {
          this.invalidate();
          throw fail("AUDIO_CACHE_MISSING");
        }
        yield row;
        previous = undefined;
      }
      const row = await this.readAudio(part.index, readOptions);
      if (!row) {
        this.invalidate();
        throw fail("AUDIO_CACHE_MISSING");
      }
      yield row;
    }
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.controller?.abort();
    this.bridge.clear();
    this.owners.forEach((owner) => {
      if (!owner.settled) owner.reject(abortError());
    });
    this.owners.clear();
    await this.running;
    if (this.bound && typeof this.cache.releaseAudio === "function") {
      await this.cache.releaseAudio(this.sessionId).catch(() => {});
    } else if (this.bound && !this.persistAudio) {
      await this.cache.removeAudio?.(this.sessionId).catch(() => {});
    }
    this.index.clear();
    this.memory.clear();
  }
}
