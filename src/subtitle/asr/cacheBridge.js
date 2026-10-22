import { logger } from "../../libs/log";
import { browser } from "../../libs/browser";
import { createAssetStore } from "../../providers/transport";
import {
  createAssetSender,
  createAssetReceiver,
} from "../../providers/assetPackets";
import { normalizeCachedChunk } from "./cacheStore";

export const ASR_CACHE_PORT = "kiss-youtube-asr-cache-v1";
export const ASR_CACHE_QUERY_TIMEOUT = 2000;
const error = (code) => Object.assign(new Error(code), { code });

/** One page-owned port: disconnect releases its temporary audio, never subtitles. */
export class AsrCacheClient {
  constructor(runtime = browser.runtime) {
    this.runtime = runtime;
    this.queue = Promise.resolve();
    this.sequence = 0;
    this.closed = false;
  }
  connect() {
    if (this.closed) return Promise.reject(error("CACHE_CLOSED"));
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const port = (this.port = this.runtime.connect({ name: ASR_CACHE_PORT }));
      this.rejectConnection = reject;
      this.connectTimer = setTimeout(() => {
        this.disconnect(error("CACHE_CONNECTION_TIMEOUT"));
      }, ASR_CACHE_QUERY_TIMEOUT);
      port.onMessage.addListener((message) => {
        if (this.port !== port) return;
        if (message.type === "ready") {
          clearTimeout(this.connectTimer);
          this.rejectConnection = undefined;
          resolve();
          return;
        }
        if (message.type === "audioCacheCleared") {
          this.onAudioCacheCleared?.();
          return;
        }
        const pending = this.pending;
        const assetPacket = [
          "asset.begin",
          "asset.chunk",
          "asset.end",
        ].includes(message.type);
        if (!pending || (!assetPacket && message.requestId !== pending.id))
          return;
        if (assetPacket) {
          try {
            pending.touch?.();
            pending.receiver.receive(message);
            port.postMessage({
              type: "asset.ack",
              transferId: message.transferId,
            });
          } catch (cause) {
            this.disconnect(cause);
          }
        } else if (message.type === "prepared") {
          pending.sender
            .send(pending.assets)
            .then(() => {
              port.postMessage({
                type: "assets.complete",
                requestId: pending.id,
              });
            })
            .catch((cause) => {
              if (this.port === port) this.disconnect(cause);
            });
        } else if (message.type === "chunk") {
          try {
            const chunk = normalizeCachedChunk(message.chunk);
            pending.touch?.();
            if (!pending.signal?.aborted) {
              pending.chunks.push(chunk);
              pending.onChunk?.(chunk);
            }
            port.postMessage({ type: "chunk.ack", requestId: pending.id });
          } catch (cause) {
            this.disconnect(cause);
          }
        } else if (message.type === "result") {
          try {
            if (pending.signal?.aborted) {
              pending.reject(
                pending.signal.reason ||
                  new DOMException("Cancelled", "AbortError")
              );
              return;
            }
            pending.receiver.finish();
            const result = message.result;
            if (result?.audio?.assetId) {
              pending.assets
                .get(result.audio)
                .arrayBuffer()
                .then((data) =>
                  pending.resolve({ ...result, data, audio: undefined })
                )
                .catch(pending.reject);
            } else
              pending.resolve(
                result?.hasChunks
                  ? { ...result, chunks: pending.chunks }
                  : result
              );
          } catch (cause) {
            pending.reject(cause);
          }
        } else if (message.type === "error")
          pending.reject(
            pending.signal?.aborted
              ? pending.signal.reason ||
                  new DOMException("Cancelled", "AbortError")
              : error(message.code || "CACHE_UNAVAILABLE")
          );
      });
      port.onDisconnect.addListener(() => {
        if (this.port === port) this.disconnect(error("CACHE_DISCONNECTED"));
      });
      this.heartbeat = setInterval(() => {
        try {
          port.postMessage({ type: "ping" });
        } catch {
          if (this.port === port) this.disconnect(error("CACHE_DISCONNECTED"));
        }
      }, 10000);
    });
    const ready = this.ready;
    ready.catch((cause) => {
      if (this.ready === ready) this.disconnect(cause);
    });
    return this.ready;
  }
  disconnect(cause) {
    const port = this.port;
    this.port = undefined;
    this.ready = undefined;
    clearTimeout(this.connectTimer);
    clearInterval(this.heartbeat);
    this.rejectConnection?.(cause);
    this.rejectConnection = undefined;
    this.pending?.reject(cause);
    try {
      port?.disconnect();
    } catch {}
  }
  call(action, payload = {}, { signal, onChunk } = {}) {
    const queuedAt = performance.now(),
      traceId = this.traceId;
    const execute = async () => {
      const connectingAt = performance.now();
      // Disconnect already released this port's references; cleanup must not reconnect it.
      if (action === "releaseAudio" && !this.port) return;
      if (signal?.aborted)
        throw signal.reason || new DOMException("Cancelled", "AbortError");
      let cancelConnect;
      try {
        await new Promise((resolve, reject) => {
          cancelConnect = () => {
            const cause =
              signal.reason || new DOMException("Cancelled", "AbortError");
            this.disconnect(cause);
            reject(cause);
          };
          signal?.addEventListener("abort", cancelConnect, { once: true });
          this.connect().then(resolve, reject);
          if (signal?.aborted) cancelConnect();
        });
      } finally {
        signal?.removeEventListener("abort", cancelConnect);
      }
      const id = `cache-${++this.sequence}`;
      logger.debug("[YouTube ASR cache] connected", {
        traceId,
        requestId: id,
        action,
        queueMs: connectingAt - queuedAt,
        connectMs: performance.now() - connectingAt,
      });
      const assets = createAssetStore();
      if (payload.segment?.data)
        payload = {
          ...payload,
          segment: {
            ...payload.segment,
            audio: assets.put(new Blob([payload.segment.data])),
            data: undefined,
          },
        };
      const controller = new AbortController();
      const sender = createAssetSender(this.port, controller.signal),
        receiver = createAssetReceiver(assets);
      let abort, timer;
      const timeoutMs =
        action === "getVideo"
          ? payload.metadataOnly
            ? ASR_CACHE_QUERY_TIMEOUT
            : 10000
          : [
                "lookupCache",
                "findAudioSession",
                "listAudio",
                "getStats",
                "beginAudio",
              ].includes(action)
            ? ASR_CACHE_QUERY_TIMEOUT
            : 30000;
      try {
        return await new Promise((resolve, reject) => {
          const touch = () => {
            clearTimeout(timer);
            timer = setTimeout(
              () => this.disconnect(error("CACHE_TIMEOUT")),
              timeoutMs
            );
          };
          this.pending = {
            id,
            resolve,
            reject,
            assets,
            sender,
            receiver,
            chunks: [],
            onChunk,
            signal,
            touch,
          };
          abort = () => {
            this.disconnect(
              signal.reason || new DOMException("Cancelled", "AbortError")
            );
          };
          signal?.addEventListener("abort", abort, { once: true });
          touch();
          this.port.postMessage({
            type: "request",
            requestId: id,
            traceId,
            action,
            ...payload,
          });
          if (signal?.aborted) abort();
        });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        controller.abort();
        sender.dispose();
        receiver.clear();
        assets.clear();
        this.pending = undefined;
      }
    };
    const started = performance.now();
    const result = this.queue.then(execute, execute).finally(() => {
      logger.debug("[YouTube ASR cache] request", {
        traceId,
        action,
        ms: performance.now() - started,
      });
    });
    this.queue = result.catch(() => {});
    return result;
  }
  lookupCache({ videoId, identity }, options) {
    return this.call(
      "lookupCache",
      { identity: identity || { videoId } },
      options
    );
  }
  getVideo(identity, signatures, { metadataOnly = false, ...options } = {}) {
    return this.call(
      "getVideo",
      { identity, signatures, metadataOnly },
      options
    );
  }
  putChunk(identity, signatures, chunk, options) {
    return this.call("putChunk", { identity, signatures, chunk }, options);
  }
  deleteVideo(identity) {
    return this.call("deleteVideo", { identity });
  }
  removeFailed(identity) {
    return this.call("removeFailed", { identity });
  }
  clearSubtitles() {
    return this.call("clearSubtitles");
  }
  getStats() {
    return this.call("getStats");
  }
  clearAudio() {
    return this.call("clearAudio");
  }
  deleteAudio(sessionId, identity) {
    return this.call("deleteAudio", { sessionId, identity });
  }
  beginAudio(sessionId, identity, options) {
    return this.call("beginAudio", { sessionId, identity }, options);
  }
  putAudio(sessionId, segment, options) {
    return this.call("putAudio", { sessionId, segment }, options);
  }
  getAudio(sessionId, index, options) {
    return this.call("getAudio", { sessionId, index }, options);
  }
  listAudio(sessionId, options) {
    return this.call("listAudio", { sessionId }, options);
  }
  findAudioSession(identity, options) {
    return this.call("findAudioSession", { identity }, options);
  }
  removeAudio(sessionId) {
    return this.call("removeAudio", { sessionId });
  }
  releaseAudio(sessionId) {
    return this.call("releaseAudio", { sessionId });
  }
  close() {
    this.closed = true;
    this.disconnect(error("CACHE_CLOSED"));
  }
}
