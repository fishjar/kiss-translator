// Unified Local AI Runtime Host (offscreen.html)
// 职责：
// 1. 维护本地 AI Runtime 生命周期（ModelManager + RuntimePool + TaskScheduler）
// 2. 创建与管理 Dedicated Workers（JEV / ASR / OCR / LLM / TTS）
// 3. 响应来自 ChromiumOffscreenHost (BroadcastChannel) 与 Service Worker 的 RPC 请求及取消指令

import {
  KISS_AI_RPC_CHANNEL,
  type AiRpcRequest,
  type RpcChannelEnvelope,
} from "./runtime/rpc";
import { RuntimeManager } from "./runtime/runtimeManager";
import { installProviderHost } from "../providers/host";
import { invokeInstance } from "../providers/runtime";
import { createLocalAsrInvoker } from "../builtin-plugins/local-asr-runtime";
import { isHostedLocalAsr } from "../providers/localAsrRouting";

const channel = new BroadcastChannel(KISS_AI_RPC_CHANNEL);

const runtimeManager = new RuntimeManager({
  onProgress: (progress) => {
    channel.postMessage({
      kind: "progress",
      progress,
    } satisfies RpcChannelEnvelope);
  },
  onStream: (stream) => {
    channel.postMessage({
      kind: "stream",
      stream,
    } satisfies RpcChannelEnvelope);
  },
  onModelBroadcast: (id, record) => {
    channel.postMessage({
      kind: "model-broadcast",
      id,
      record,
    } satisfies RpcChannelEnvelope);
  },
  onModelImportResult: (result) => {
    channel.postMessage({
      kind: "model-import-result",
      result,
    } satisfies RpcChannelEnvelope);
  },
  onServiceState: (state) => {
    channel.postMessage({
      kind: "service-state",
      state,
    } satisfies RpcChannelEnvelope);
  },
});

const invokeLocalAsr = createLocalAsrInvoker(runtimeManager);
installProviderHost(undefined, (instance: any, capability: string, input: any, options: any) =>
  isHostedLocalAsr(instance, capability)
    ? invokeLocalAsr(instance, capability, input, options)
    : invokeInstance(instance, capability, input, options)
);

// 启动时自动初始化 ModelManager（恢复 OPFS + IDB 模型状态）
void runtimeManager.modelManager.init().catch((err) => {
  console.warn("[offscreen] ModelManager init error:", err);
});

channel.onmessage = (e: MessageEvent<RpcChannelEnvelope>) => {
  const env = e.data;
  if (!env || typeof env !== "object") return;

  if (env.kind === "ping") {
    channel.postMessage({
      kind: "pong",
      id: env.id,
    } satisfies RpcChannelEnvelope);
    return;
  }

  if (env.kind === "cancel") {
    runtimeManager.cancelRequest(env.id, env.reason);
    return;
  }

  if (env.kind === "request") {
    void runtimeManager.handleRequest(env.request).then((response) => {
      channel.postMessage({
        kind: "response",
        response,
      } satisfies RpcChannelEnvelope);
    });
  }
};

const notifyHostClosed = () => {
  try {
    channel.postMessage({
      kind: "host-closed",
      reason: "Offscreen 文档已卸载",
    } satisfies RpcChannelEnvelope);
  } catch {
    // 忽略通道已关闭异常
  }
};

window.addEventListener("pagehide", notifyHostClosed);
window.addEventListener("beforeunload", notifyHostClosed);

// 同时监听来自 Service Worker 的直接消息（如健康检查或 SW 侧发起的 RPC）
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (message.type === "kiss-ai:offscreen-ping") {
      sendResponse({ ok: true, host: "offscreen.html" });
      return false;
    }
    if (message.type === "kiss-ai:offscreen-rpc" && message.request) {
      void runtimeManager
        .handleRequest(message.request as AiRpcRequest)
        .then((res) => sendResponse(res));
      return true;
    }
    return false;
  });
}

(globalThis as any).__kissRuntimeManager = runtimeManager;
console.log("[kiss-translator] Local AI runtime host started");
