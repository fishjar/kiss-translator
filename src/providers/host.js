import { serviceTimeoutMs, MAX_SERVICE_TIMEOUT_MS } from "./timeout";
import { providerError } from "./capabilities";
import { createAssetStore } from "./transport";
import {
  decodeAssets,
  encodeAssets,
  createAssetReceiver,
  createAssetSender,
} from "./assetPackets";

// Only background-relayed internal ports reach this module. No page RPC surface.
export function installProviderHost(
  runtime = globalThis.chrome?.runtime,
  invoke
) {
  if (!runtime?.onConnect) return;
  runtime.onConnect.addListener((port) => {
    if (port.name !== "kiss-provider-host-v1") return;
    serveProviderPort(port, undefined, invoke);
    port.postMessage({ type: "ready" });
  });
}

export function serveProviderPort(port, initialMessage, invoke) {
  let invocation;
  let disconnected = false;
  let terminal = false;
  let deadline;
  let timeout;
  const assets = createAssetStore();
  const receiver = createAssetReceiver(assets);
  const sender = createAssetSender(port);
  let pendingStart;
  const acknowledgements = new Map();
  let sequence = 0;
  const cleanup = () => {
    clearTimeout(timeout);
    pendingStart = undefined;
    receiver.clear();
    sender.dispose();
    assets.clear();
    for (const resolve of acknowledgements.values()) resolve();
    acknowledgements.clear();
    port.onMessage.removeListener(start);
    port.onDisconnect.removeListener(disconnect);
  };
  const fail = (error) => {
    if (terminal || disconnected) return;
    terminal = true;
    invocation?.cancel();
    cleanup();
    try {
      port.postMessage({
        type: "error",
        error: {
          code: error.code || "PROVIDER_ERROR",
          message: error.message,
        },
      });
    } catch {
      // Port closure can precede its disconnect notification; cleanup already ran.
    }
  };
  const disconnect = () => {
    disconnected = true;
    invocation?.cancel();
    cleanup();
  };
  port.onDisconnect.addListener(disconnect);
  const start = (message) => {
    if (terminal || disconnected) return;
    if (["asset.begin", "asset.chunk", "asset.end"].includes(message.type)) {
      try {
        if (!pendingStart || invocation)
          throw new Error("Unexpected asset upload.");
        receiver.receive(message);
        port.postMessage({ type: "asset.ack", transferId: message.transferId });
      } catch (error) {
        fail(error);
      }
      return;
    }
    if (message.type === "assets.complete") {
      if (!pendingStart || invocation) return;
      try {
        receiver.finish();
      } catch (error) {
        fail(error);
        return;
      }
      const prepared = pendingStart;
      pendingStart = undefined;
      start({ ...prepared, uploads: false, chunkedResults: true });
      return;
    }
    if (message.type === "ack") {
      acknowledgements.get(message.id)?.();
      acknowledgements.delete(message.id);
      return;
    }
    if (message.type !== "start" || invocation) return;
    if (!deadline) {
      const budget =
        message.options?.timeoutMs ?? serviceTimeoutMs(message.instance);
      if (!Number.isFinite(budget) || budget <= 0) {
        fail(providerError("INVALID_TIMEOUT", "Invalid invocation timeout."));
        return;
      }
      if (
        message.options?.deadlineAt !== undefined &&
        !Number.isFinite(message.options.deadlineAt)
      ) {
        fail(providerError("INVALID_TIMEOUT", "Invalid invocation deadline."));
        return;
      }
      deadline = Math.min(
        Date.now() + Math.min(budget, MAX_SERVICE_TIMEOUT_MS),
        message.options?.deadlineAt ?? Infinity
      );
      if (deadline <= Date.now()) {
        fail(providerError("REQUEST_TIMEOUT", "Provider call timed out."));
        return;
      }
      // Uploads and acknowledgement waits own assets and a host lease too.
      // A client that stalls in either stage must not retain them indefinitely.
      timeout = setTimeout(
        () =>
          fail(providerError("REQUEST_TIMEOUT", "Provider call timed out.")),
        deadline - Date.now()
      );
    }
    if (message.uploads) {
      if (pendingStart) return;
      pendingStart = message;
      port.postMessage({ type: "prepared" });
      return;
    }
    try {
      decodeAssets(message.resources || [], assets);
    } catch (error) {
      fail(error);
      return;
    }
    invocation = invoke(message.instance, message.capability, message.input, {
      ...message.options,
      timeoutMs: Math.max(1, deadline - Date.now()),
      deadlineAt: deadline,
      assets,
    });
    const inputIds = new Set(assets.entries().map(([id]) => id));
    const events = invocation.events[Symbol.asyncIterator]();
    const consume = (async () => {
      for await (const event of { [Symbol.asyncIterator]: () => events }) {
        if (disconnected || terminal) break;
        const id = ++sequence;
        await new Promise((resolve) => {
          acknowledgements.set(id, resolve);
          port.postMessage({ type: "event", id, event });
        });
      }
    })();
    consume.catch(() => {});
    invocation.result
      .then(
        async (result) => {
          await consume;
          if (
            message.chunkedResults &&
            result?.audio &&
            !inputIds.has(result.audio.assetId)
          )
            await sender.send(assets, [result.audio.assetId]);
          const resources =
            !message.chunkedResults && result?.audio
              ? await encodeAssets(assets, [result.audio.assetId])
              : [];
          if (!disconnected && !terminal) {
            terminal = true;
            port.postMessage({ type: "result", result, resources });
          }
        },
        async (error) => {
          for (const resolve of acknowledgements.values()) resolve();
          await consume.catch(() => {});
          fail(error);
        }
      )
      .catch((error) => {
        fail(error);
      })
      .finally(() => {
        // Result chunks have been acknowledged; the client now owns their copies.
        // Cleanup also covers peers that keep their port open after a terminal message.
        cleanup();
      });
  };
  port.onMessage.addListener(start);
  if (initialMessage) start(initialMessage);
  // The owner may close its own port, which does not fire its onDisconnect.
  return disconnect;
}
