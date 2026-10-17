import { browser } from "../../libs/browser";
import { createAssetStore } from "../../providers/transport";
import {
  createAssetSender,
  createAssetReceiver,
} from "../../providers/assetPackets";
import { normalizeCachedChunk } from "./cacheStore";

export const ASR_CACHE_PORT = "kiss-youtube-asr-cache-v1";
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
      port.onMessage.addListener((message) => {
        if (message.type === "ready") {
          resolve();
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
            pending.receiver.receive(message);
            port.postMessage({
              type: "asset.ack",
              transferId: message.transferId,
            });
          } catch (cause) {
            port.disconnect();
            pending.reject(cause);
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
            .catch(pending.reject);
        } else if (message.type === "chunk") {
          try {
            const chunk = normalizeCachedChunk(message.chunk);
            if (!pending.signal?.aborted) {
              pending.chunks.push(chunk);
              pending.onChunk?.(chunk);
            }
            port.postMessage({ type: "chunk.ack", requestId: pending.id });
          } catch (cause) {
            port.disconnect();
            pending.reject(cause);
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
            if (result?.audio) {
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
        clearInterval(this.heartbeat);
        this.pending?.reject(error("CACHE_DISCONNECTED"));
        this.ready = undefined;
        this.port = undefined;
        reject(error("CACHE_DISCONNECTED"));
      });
      this.heartbeat = setInterval(() => {
        try {
          port.postMessage({ type: "ping" });
        } catch {
          port.disconnect();
        }
      }, 10000);
    });
    return this.ready;
  }
  call(action, payload = {}, { signal, onChunk } = {}) {
    const execute = async () => {
      if (signal?.aborted)
        throw signal.reason || new DOMException("Cancelled", "AbortError");
      await this.connect();
      const id = `cache-${++this.sequence}`;
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
      try {
        return await new Promise((resolve, reject) => {
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
          };
          abort = () => {
            this.port?.postMessage({ type: "cancel", requestId: id });
          };
          signal?.addEventListener("abort", abort, { once: true });
          timer = setTimeout(() => {
            this.port?.disconnect();
            reject(error("CACHE_TIMEOUT"));
          }, 30000);
          this.port.postMessage({
            type: "request",
            requestId: id,
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
    const result = this.queue.then(execute, execute);
    this.queue = result.catch(() => {});
    return result;
  }
  getVideo(identity, signatures, options) {
    return this.call("getVideo", { identity, signatures }, options);
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
  beginAudio(sessionId, identity) {
    return this.call("beginAudio", { sessionId, identity });
  }
  putAudio(sessionId, segment, options) {
    return this.call("putAudio", { sessionId, segment }, options);
  }
  getAudio(sessionId, index, options) {
    return this.call("getAudio", { sessionId, index }, options);
  }
  listAudio(sessionId) {
    return this.call("listAudio", { sessionId });
  }
  removeAudio(sessionId) {
    return this.call("removeAudio", { sessionId });
  }
  close() {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.pending?.reject(error("CACHE_CLOSED"));
    this.port?.disconnect();
    this.port = undefined;
    this.ready = undefined;
  }
}
