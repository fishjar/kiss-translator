/* global chrome */
const CHANNEL = "kiss-ai-runtime-rpc";
let creating;

async function ensureHost() {
  if (typeof chrome === "undefined" || !chrome.offscreen?.createDocument)
    return;
  if (creating) return creating;
  creating = (async () => {
    const url = chrome.runtime.getURL("offscreen.html");
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [url],
      });
      if (contexts.length) return;
    } else if (await chrome.offscreen.hasDocument?.()) {
      return;
    }
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Run locally installed AI models",
      });
    } catch (error) {
      if (!/already exists|Only a single offscreen/i.test(error?.message || ""))
        throw error;
    }
  })().finally(() => {
    creating = null;
  });
  return creating;
}

function exchange(envelope, accept, timeout = 300000, onTimeout) {
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(CHANNEL);
    const timer = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        channel.close();
        reject(new Error("Local AI runtime timed out"));
      }
    }, timeout);
    channel.onmessage = ({ data }) => {
      if (!accept(data)) return;
      clearTimeout(timer);
      channel.close();
      resolve(data);
    };
    channel.postMessage(envelope);
  });
}

export async function localAiRequest(request) {
  await ensureHost();
  let ready = false;
  for (let attempt = 0; attempt < 8 && !ready; attempt++) {
    const id = `${request.id}-ping-${attempt}`;
    try {
      await exchange(
        { kind: "ping", id },
        (data) => data?.kind === "pong" && data.id === id,
        500
      );
      ready = true;
    } catch {
      // The Firefox background module and Chrome Offscreen document may still be loading.
    }
  }
  if (!ready) throw new Error("Local AI runtime is unavailable");
  const envelope = await exchange(
    { kind: "request", request },
    (data) => data?.kind === "response" && data.response?.id === request.id,
    300000,
    () => {
      // 超时时发送取消通知，避免运行时继续占用推理算力
      cancelLocalAiRequest(
        request.id,
        "REQUEST_TIMEOUT: 本地 AI 运行时超时已取消"
      );
    }
  );
  if (!envelope.response.ok)
    throw new Error(
      envelope.response.error?.message || "Local AI inference failed"
    );
  return envelope.response.result;
}

export function cancelLocalAiRequest(
  id,
  reason = "REQUEST_CANCELLED: 用户已取消"
) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ kind: "cancel", id, reason });
  channel.close();
}
