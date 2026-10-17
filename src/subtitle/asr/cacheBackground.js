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

/** Internal extension messaging only; no external listener and no new permissions. */
export function installAsrCacheBackend(browser, store = new AsrCacheStore()) {
  const activeAudioSessions = new Set();
  browser.runtime.onStartup?.addListener(() => {
    void store.clearAudio().catch(() => {});
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
      if (!closed) port.postMessage(message);
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
        mediaIdentity(message.identity);
        await authorize(message.identity);
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
      if (action === "getVideo") {
        result = await store.getVideo(message.identity, message.signatures);
        if (result) {
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
      } else if (action === "beginAudio") {
        await store.beginAudio(sessionId, message.identity, owner);
        if (closed || current.controller.signal.aborted) {
          await store.removeAudio(sessionId);
          check();
        }
        sessions.set(sessionId, mediaIdentity(message.identity));
        activeAudioSessions.add(sessionId);
      } else if (action === "putAudio") {
        const blob = current.assets.get(message.segment?.audio);
        const data = await blob.arrayBuffer();
        check();
        result = await store.putAudio(sessionId, { ...message.segment, data });
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
        await store.removeAudio(sessionId);
        sessions.delete(sessionId);
        activeAudioSessions.delete(sessionId);
      } else throw fail("INVALID_CACHE_REQUEST");
      check();
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
    port.onDisconnect.addListener(() => {
      closed = true;
      if (task) {
        task.controller.abort();
        finish(task);
      }
      sessions.forEach((_, id) => {
        activeAudioSessions.delete(id);
        void store.removeAudio(id).catch(() => {});
      });
      sessions.clear();
    });
    // A previous background/page crash must not retain compressed media forever.
    void store
      .listAudioSessions()
      .then(async (rows) => {
        for (const row of rows)
          if (!activeAudioSessions.has(row.sessionId))
            await store.removeAudio(row.sessionId);
        post({ type: "ready" });
      })
      .catch(() => {
        post({ type: "ready" });
      });
  };
  browser.runtime.onConnect.addListener(listener);
  return () => browser.runtime.onConnect.removeListener(listener);
}
