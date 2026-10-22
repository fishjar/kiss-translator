import { logger } from "../../libs/log";
import { createAssetStore } from "../../providers/transport";
import {
  createAssetSender,
  createAssetReceiver,
} from "../../providers/assetPackets";
import { ASR_CACHE_PORT } from "./cacheBridge";
import { AsrCacheStore, mediaIdentity } from "./cacheStore";

const youtube = (value) => {
  try {
    const url = new URL(value);
    return url.origin === "https://www.youtube.com" ? url : null;
  } catch {
    return null;
  }
};
const videoId = (url) =>
  url?.pathname === "/watch"
    ? url.searchParams.get("v")
    : url?.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1];
const fail = (code) => Object.assign(new Error(code), { code });

export function installAsrCacheBackend(
  browser,
  store = new AsrCacheStore(),
  { getAudioCacheLimit } = {}
) {
  let lastAudioCacheLimit = 100;
  const resolveAudioCacheLimit = async () => {
    if (typeof getAudioCacheLimit === "function") {
      try {
        const val = await getAudioCacheLimit();
        if (Number.isInteger(val) && val >= 0 && val <= 1000) {
          lastAudioCacheLimit = val;
          return val;
        }
      } catch {}
    }
    return null;
  };
  const activeAudioSessions = new Set();
  const activeSessionPorts = new Map();
  const pendingAudioSessions = new Map();
  // An in-flight cleanup must finish before a new owner acquires the same audio.
  const audioSessionOperations = new Map();
  const withAudioSession = (sessionId, operation) => {
    const previous = audioSessionOperations.get(sessionId) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    audioSessionOperations.set(sessionId, current);
    return current.finally(() => {
      if (audioSessionOperations.get(sessionId) === current)
        audioSessionOperations.delete(sessionId);
    });
  };
  const removeInactiveAudio = (sessionId) =>
    withAudioSession(sessionId, async () => {
      if (
        !activeAudioSessions.has(sessionId) &&
        !pendingAudioSessions.has(sessionId)
      )
        await store.removeAudio(sessionId);
    });
  const pruneInactiveAudio = async () => {
    for (const row of await store.listAudioSessions()) {
      await removeInactiveAudio(row.sessionId);
    }
  };
  browser.runtime.onStartup?.addListener(async () => {
    const limit = await resolveAudioCacheLimit();
    if (limit === 0) {
      void pruneInactiveAudio().catch(() => {});
    }
  });
  const extensionRoot = browser.runtime.getURL("/");
  const listener = (port) => {
    if (port.name !== ASR_CACHE_PORT) return;
    const sender = port.sender;
    const isOptions =
      sender?.id === browser.runtime.id &&
      sender?.url?.startsWith(extensionRoot) &&
      new URL(sender.url).pathname === "/options.html";
    if (
      !isOptions &&
      (sender?.id !== browser.runtime.id ||
        sender.frameId !== 0 ||
        !youtube(sender.url))
    ) {
      port.disconnect();
      return;
    }
    const owner = { tabId: sender.tab?.id, documentId: sender.documentId };
    const sessions = new Map();
    let task,
      closed = false;
    const post = (message) => {
      if (closed) return;
      try {
        port.postMessage(message);
      } catch {
        closed = true;
        task?.controller.abort();
      }
    };
    const authorize = async (identity) => {
      if (isOptions) return;
      const tab = await browser.tabs.get(sender.tab.id);
      if (videoId(youtube(tab.url)) !== identity.videoId)
        throw fail("STALE_VIDEO");
    };
    const run = async (message, current) => {
      const check = () => {
        if (closed || current.controller.signal.aborted)
          throw fail("REQUEST_CANCELLED");
      };
      const { action, sessionId } = message;
      check();
      if (message.identity) {
        if (
          [
            "lookupCache",
            "getVideo",
            "deleteVideo",
            "findAudioSession",
          ].includes(action) &&
          !message.identity.trackId
        ) {
          if (!/^[\w-]{11}$/.test(message.identity.videoId || ""))
            throw fail("INVALID_MEDIA_IDENTITY");
        } else {
          mediaIdentity(message.identity);
        }
        const authStarted = performance.now();
        await authorize(message.identity);
        logger.debug("[YouTube ASR cache] authorize", {
          traceId: message.traceId,
          requestId: current.id,
          ms: performance.now() - authStarted,
        });
      }
      if (
        ["putAudio", "getAudio", "listAudio", "removeAudio"].includes(action)
      ) {
        const identity = sessions.get(sessionId);
        if (!identity) throw fail("AUDIO_SESSION_MISSING");
        if (action !== "removeAudio") await authorize(identity);
      }
      check();
      let result;
      const storageStarted = performance.now();
      if (action === "lookupCache") {
        result = await store.lookupCache({
          videoId: message.identity.videoId,
          identity: message.identity.trackId ? message.identity : undefined,
        });
      } else if (action === "findAudioSession") {
        if (!message.identity) throw fail("INVALID_MEDIA_IDENTITY");
        result = await store.findAudioSession(message.identity);
      } else if (action === "getVideo") {
        result = message.metadataOnly
          ? await store.getVideoMetadata(message.identity, message.signatures)
          : await store.getVideo(message.identity, message.signatures);
        if (result && !message.metadataOnly) {
          const { chunks, ...metadata } = result;
          for (const chunk of chunks) {
            check();
            await new Promise((resolve, reject) => {
              current.ack = { resolve, reject };
              post({ type: "chunk", requestId: current.id, chunk });
            });
          }
          result = { ...metadata, hasChunks: true };
        }
      } else if (action === "putChunk")
        await store.putChunk(
          message.identity,
          message.signatures,
          message.chunk
        );
      else if (action === "deleteVideo")
        await store.deleteVideo(message.identity);
      else if (action === "removeFailed")
        await store.removeFailed(message.identity);
      else if (action === "clearSubtitles") {
        if (!isOptions) throw fail("CACHE_ACCESS_DENIED");
        await store.clearSubtitles();
      } else if (action === "clearAudio") {
        if (!isOptions) throw fail("CACHE_ACCESS_DENIED");
        await store.clearAudio();
        sessions.clear();
        activeAudioSessions.clear();
        for (const ports of activeSessionPorts.values()) {
          for (const p of ports) {
            try {
              p.postMessage({ type: "audioCacheCleared" });
            } catch {}
          }
        }
        activeSessionPorts.clear();
      } else if (action === "getStats") {
        result = await store.getStats();
      } else if (action === "deleteAudio") {
        const affected = (await store.listAudioSessions()).filter(
          (row) =>
            row.sessionId === sessionId ||
            row.identity?.videoId === message.identity?.videoId
        );
        await store.deleteAudio(sessionId, message.identity);
        const notified = new Set();
        for (const { sessionId: id } of affected) {
          for (const p of activeSessionPorts.get(id) || []) {
            if (p === port || notified.has(p)) continue;
            notified.add(p);
            try {
              p.postMessage({ type: "audioCacheCleared" });
            } catch {}
          }
          sessions.delete(id);
          activeSessionPorts.delete(id);
          activeAudioSessions.delete(id);
        }
      } else if (action === "beginAudio") {
        pendingAudioSessions.set(
          sessionId,
          (pendingAudioSessions.get(sessionId) || 0) + 1
        );
        try {
          result = await withAudioSession(sessionId, async () => {
            check();
            const begun = await store.beginAudio(
              sessionId,
              message.identity,
              owner
            );
            if (closed || current.controller.signal.aborted) {
              const limit = await resolveAudioCacheLimit();
              if (
                begun?.created &&
                !activeAudioSessions.has(sessionId) &&
                pendingAudioSessions.get(sessionId) === 1 &&
                limit === 0
              ) {
                await store.removeAudio(sessionId);
              }
              check();
            }
            sessions.set(sessionId, mediaIdentity(message.identity));
            if (!activeSessionPorts.has(sessionId)) {
              activeSessionPorts.set(sessionId, new Set());
            }
            activeSessionPorts.get(sessionId).add(port);
            activeAudioSessions.add(sessionId);
            return begun;
          });
        } finally {
          const remaining = pendingAudioSessions.get(sessionId) - 1;
          if (remaining) pendingAudioSessions.set(sessionId, remaining);
          else pendingAudioSessions.delete(sessionId);
        }
      } else if (action === "releaseAudio") {
        sessions.delete(sessionId);
        const ports = activeSessionPorts.get(sessionId);
        if (ports) {
          ports.delete(port);
          if (ports.size === 0) {
            activeSessionPorts.delete(sessionId);
            activeAudioSessions.delete(sessionId);
            const limit = await resolveAudioCacheLimit();
            if (limit === 0) {
              await removeInactiveAudio(sessionId).catch(() => {});
            }
          }
        }
      } else if (action === "putAudio") {
        const blob = current.assets.get(message.segment?.audio);
        const data = await blob.arrayBuffer();
        check();
        const limit = await resolveAudioCacheLimit();
        result = await store.putAudio(
          sessionId,
          { ...message.segment, data },
          {
            audioVideoCountLimit: limit ?? lastAudioCacheLimit,
            protectedSessionIds: [
              ...activeAudioSessions,
              ...pendingAudioSessions.keys(),
            ],
          }
        );
      } else if (action === "listAudio")
        result = await store.listAudio(sessionId);
      else if (action === "getAudio") {
        const row = await store.getAudio(sessionId, message.index);
        if (row) {
          const { data, ...metadata } = row;
          const audio = current.assets.put(new Blob([data]));
          await current.sender.send(current.assets, [audio.assetId]);
          result = { ...metadata, audio };
        } else result = null;
      } else if (action === "removeAudio") {
        sessions.delete(sessionId);
        const ports = activeSessionPorts.get(sessionId);
        if (ports) {
          ports.delete(port);
          if (ports.size === 0) {
            activeSessionPorts.delete(sessionId);
            activeAudioSessions.delete(sessionId);
            await removeInactiveAudio(sessionId);
          }
        } else {
          activeAudioSessions.delete(sessionId);
          await removeInactiveAudio(sessionId);
        }
      } else throw fail("INVALID_CACHE_REQUEST");
      check();
      logger.debug("[YouTube ASR cache] operation", {
        traceId: message.traceId,
        requestId: current.id,
        action,
        ms: performance.now() - storageStarted,
      });
      post({ type: "result", requestId: current.id, result });
    };
    const finish = (current) => {
      if (task !== current) return;
      current.controller.abort();
      current.sender.dispose();
      current.receiver.clear();
      current.assets.clear();
      task = undefined;
    };
    port.onMessage.addListener((message) => {
      if (!message || closed || message.type === "ping") return;
      if (message.type === "request") {
        if (
          task ||
          !/^cache-\d+$/.test(message.requestId || "") ||
          new Blob([JSON.stringify(message)]).size > 8 * 1024 * 1024
        ) {
          post({
            type: "error",
            requestId: message.requestId,
            code: "INVALID_CACHE_REQUEST",
          });
          return;
        }
        const controller = new AbortController(),
          assets = createAssetStore();
        const current = (task = {
          id: message.requestId,
          message,
          controller,
          assets,
          sender: createAssetSender(port, controller.signal),
          receiver: createAssetReceiver(assets),
        });
        current.controller.signal.addEventListener(
          "abort",
          () => current.ack?.reject(fail("REQUEST_CANCELLED")),
          { once: true }
        );
        post({ type: "prepared", requestId: current.id });
      } else if (message.type === "cancel" && message.requestId === task?.id) {
        const current = task;
        current.controller.abort();
        if (!current.started) {
          post({
            type: "error",
            requestId: current.id,
            code: "REQUEST_CANCELLED",
          });
          finish(current);
        }
      } else if (
        message.type === "chunk.ack" &&
        message.requestId === task?.id
      ) {
        task.ack?.resolve();
        task.ack = undefined;
      } else if (
        ["asset.begin", "asset.chunk", "asset.end"].includes(message.type) &&
        task
      ) {
        try {
          task.receiver.receive(message);
          post({ type: "asset.ack", transferId: message.transferId });
        } catch {
          task.controller.abort();
        }
      } else if (
        message.type === "assets.complete" &&
        message.requestId === task?.id
      ) {
        const current = task;
        if (current.started) return;
        current.started = true;
        try {
          current.receiver.finish();
        } catch {
          current.controller.abort();
        }
        void run(current.message, current)
          .catch((cause) =>
            post({
              type: "error",
              requestId: current.id,
              code:
                cause?.name === "QuotaExceededError"
                  ? "AUDIO_QUOTA"
                  : /^[A-Z_]{1,64}$/.test(cause?.code)
                    ? cause.code
                    : "CACHE_UNAVAILABLE",
            })
          )
          .finally(() => finish(current));
      }
    });
    port.onDisconnect.addListener(async () => {
      closed = true;
      if (task) {
        task.controller.abort();
        finish(task);
      }
      const limit = await resolveAudioCacheLimit();
      const ids = Array.from(sessions.keys());
      sessions.clear();
      for (const id of ids) {
        const ports = activeSessionPorts.get(id);
        if (ports) {
          ports.delete(port);
          if (ports.size === 0) {
            activeSessionPorts.delete(id);
            activeAudioSessions.delete(id);
            if (limit === 0) {
              void removeInactiveAudio(id).catch(() => {});
            }
          }
        }
      }
    });
    // Settings and housekeeping must never delay the cache protocol handshake.
    post({ type: "ready" });
    // A previous background/page crash must not retain compressed media forever when audio caching is disabled (limit === 0).
    void (async () => {
      try {
        const limit = await resolveAudioCacheLimit();
        if (limit === 0) {
          await pruneInactiveAudio();
        }
      } catch {}
    })();
  };
  browser.runtime.onConnect.addListener(listener);
  return () => browser.runtime.onConnect.removeListener(listener);
}
