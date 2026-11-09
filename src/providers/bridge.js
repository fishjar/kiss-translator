import { serviceInvocationOptions, remainingInvocationMs } from "./timeout";
import { browser } from "../libs/browser";
import { createInvocation } from "./invocation";
import { providerError } from "./capabilities";
import { createAssetStore } from "./transport";
import {
  decodeAssets,
  createAssetSender,
  createAssetReceiver,
} from "./assetPackets";

export const PROVIDER_PORT = "kiss-provider-client-v1";
export const PROVIDER_HOST_PORT = "kiss-provider-host-v1";

export function invokePlugin(serviceId, capability, input, options = {}) {
  return invokeProviderPort(
    PROVIDER_PORT,
    { serviceId },
    capability,
    input,
    options
  );
}

/** Internal IPC primitive; background callers supply a validated saved snapshot. */
export function invokeProviderPort(
  portName,
  startFields,
  capability,
  input,
  options = {}
) {
  options = serviceInvocationOptions(startFields.instance, options);
  const assets = options.assets || createAssetStore();
  const invocation = createInvocation(async (ctx) => {
    if (ctx.signal.aborted) throw ctx.signal.reason;
    return new Promise((resolve, reject) => {
      const port = browser.runtime.connect({ name: portName });
      const sender = createAssetSender(port, ctx.signal);
      const receiver = createAssetReceiver(assets);
      let done = false;
      // An open port alone does not keep an MV3 background worker alive.
      // Heartbeats contain no task data and never replay interrupted requests.
      const keepalive = setInterval(() => {
        if (!done) {
          try {
            port.postMessage({ type: "ping" });
          } catch {
            // A closed port may throw before onDisconnect is delivered.
            if (!done) {
              cleanup();
              reject(
                providerError("HOST_CLOSED", "Provider host disconnected.")
              );
            }
          }
        }
      }, 10000);
      const cleanup = () => {
        done = true;
        clearInterval(keepalive);
        sender.dispose();
        receiver.clear();
        ctx.signal.removeEventListener("abort", cancel);
        port.disconnect();
      };
      const cancel = () => {
        if (!done) {
          cleanup();
          reject(providerError("REQUEST_CANCELLED", "Cancelled"));
        }
      };
      ctx.signal.addEventListener("abort", cancel, { once: true });
      if (ctx.signal.aborted) {
        cancel();
        return;
      }
      port.onDisconnect.addListener(() => {
        if (!done) {
          done = true;
          clearInterval(keepalive);
          sender.dispose();
          receiver.clear();
          ctx.signal.removeEventListener("abort", cancel);
          reject(providerError("HOST_CLOSED", "Provider host disconnected."));
        }
      });
      port.onMessage.addListener(async (message) => {
        if (done) return;
        if (message.type === "ready" && portName === PROVIDER_HOST_PORT) {
          port.postMessage(start);
          return;
        }
        if (message.type === "prepared") {
          try {
            await sender.send(assets);
            if (!done) port.postMessage({ type: "assets.complete" });
          } catch (error) {
            if (!done) {
              cleanup();
              reject(error);
            }
          }
          return;
        }
        if (
          ["asset.begin", "asset.chunk", "asset.end"].includes(message.type)
        ) {
          try {
            receiver.receive(message);
            port.postMessage({
              type: "asset.ack",
              transferId: message.transferId,
            });
          } catch (error) {
            cleanup();
            reject(error);
          }
          return;
        }
        if (message.type === "event") {
          await ctx.emit(message.event);
          if (!done) port.postMessage({ type: "ack", id: message.id });
        }
        if (message.type === "result") {
          try {
            decodeAssets(message.resources || [], assets);
            receiver.finish();
          } catch (error) {
            cleanup();
            reject(error);
            return;
          }
          cleanup();
          resolve(message.result);
        }
        if (message.type === "error") {
          cleanup();
          reject(
            Object.assign(new Error(message.error.message), {
              code: message.error.code,
            })
          );
        }
      });
      const start = {
        type: "start",
        ...startFields,
        capability,
        input,
        uploads: true,
        options: {
          diagnostic: options.diagnostic,
          streaming: options.streaming,
          timeoutMs: remainingInvocationMs(ctx),
          deadlineAt: ctx.deadlineAt,
        },
      };
      if (portName !== PROVIDER_HOST_PORT) port.postMessage(start);
    });
  }, options);
  return { ...invocation, assets };
}
