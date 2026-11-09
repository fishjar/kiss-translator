import { serviceInvocationOptions } from "./timeout";
import browser from "webextension-polyfill";
import { getSettingWithDefault } from "../libs/storage";
import { localAiHost } from "../libs/localAiBackground";
import { PROVIDER_PORT, PROVIDER_HOST_PORT } from "./bridge";
import { acquireProviderHost } from "./hostLease";
import { STOKEY_SETTING } from "../config/storage";
import { availableServiceIds } from "./lifecycle";
import { OPT_TRANS_SYSTEM_TTS } from "../config/apiConstants";
import { serveProviderPort } from "./host";
import { invokeBackgroundSpeech } from "../builtin-plugins/speech-runtime";
import { isHostedLocalAsr } from "./localAsrRouting";

export function installProviderRelay() {
  const active = new Map();
  // A saved disable/delete applies to all pages, including tasks already executing
  // in Offscreen. Ordinary edits preserve the in-flight instance snapshot.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const available = changes[STOKEY_SETTING]
      ? availableServiceIds(changes[STOKEY_SETTING].newValue)
      : null;
    for (const [client, { serviceId, cancel }] of active) {
      if (!available || available.has(serviceId)) continue;
      try {
        client.postMessage({
          type: "error",
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Service was disabled or deleted.",
          },
        });
      } catch {
        // The client may already have closed between storage notification and delivery.
      } finally {
        cancel();
      }
    }
  });
  browser.runtime.onConnect.addListener((client) => {
    if (client.name !== PROVIDER_PORT) return;
    let disconnected = false;
    let host;
    let started = false;
    let release;
    let cancelLocal;
    let hostReadyTimer;
    const cleanup = () => {
      if (disconnected) return;
      disconnected = true;
      clearTimeout(hostReadyTimer);
      active.delete(client);
      cancelLocal?.();
      host?.disconnect();
      release?.();
    };
    client.onDisconnect.addListener(cleanup);
    client.onMessage.addListener(async (message) => {
      if (message.type === "ping") {
        if (!disconnected) client.postMessage({ type: "pong" });
        return;
      }
      if (
        [
          "ack",
          "asset.begin",
          "asset.chunk",
          "asset.end",
          "asset.ack",
          "assets.complete",
        ].includes(message.type)
      ) {
        host?.postMessage(message);
        return;
      }
      if (message.type !== "start" || started) return;
      started = true;
      try {
        const setting = await getSettingWithDefault();
        const instance = setting.transApis.find(
          (api) => api.apiSlug === message.serviceId && !api.isDisabled
        );
        const systemSpeech =
          instance?.apiType === OPT_TRANS_SYSTEM_TTS &&
          (!instance.provider ||
            instance.provider.implementation.kind === "native");
        const localAsr = isHostedLocalAsr(instance, message.capability);
        const trustedNative = systemSpeech || localAsr;
        if (
          !trustedNative &&
          (!instance?.provider ||
            instance.provider.implementation.kind === "native")
        )
          throw new Error("Plugin service is unavailable.");
        if (disconnected) return;
        active.set(client, {
          serviceId: instance.apiSlug,
          cancel: () => {
            // Calling disconnect does not emit onDisconnect on this same end.
            // Explicitly release the lease and cancel a same-context native call.
            cleanup();
            client.disconnect();
          },
        });
        const start = {
          ...message,
          instance,
          options: serviceInvocationOptions(instance, message.options),
        };
        if (systemSpeech) {
          // MV3 has no document for Webpack's DOM chunk loader. Keep this small
          // compiled path static; user-script execution remains in its own host.
          if (!disconnected)
            cancelLocal = serveProviderPort(
              client,
              start,
              invokeBackgroundSpeech
            );
          return;
        }
        if (!globalThis.chrome?.offscreen?.createDocument) {
          if (localAsr)
            throw Object.assign(
              new Error("Local ASR requires an Offscreen runtime host."),
              { code: "HOST_UNAVAILABLE" }
            );
          const { invokeInstance } = await import("./runtime");
          if (!disconnected)
            cancelLocal = serveProviderPort(client, start, invokeInstance);
          return;
        }
        release = acquireProviderHost();
        try {
          await localAiHost({ action: "ensure" });
        } catch (error) {
          if (localAsr) error.code = "HOST_STARTUP_FAILED";
          throw error;
        }
        if (disconnected) {
          release();
          return;
        }
        host = browser.runtime.connect({ name: PROVIDER_HOST_PORT });
        if (localAsr)
          hostReadyTimer = setTimeout(() => {
            if (disconnected) return;
            client.postMessage({
              type: "error",
              error: {
                code: "HOST_STARTUP_FAILED",
                message:
                  "Local ASR Offscreen host did not become ready within 10 seconds.",
              },
            });
            cleanup();
            client.disconnect();
          }, 10000);
        host.onMessage.addListener((response) => {
          if (disconnected) return;
          if (response.type === "ready") {
            clearTimeout(hostReadyTimer);
            host.postMessage(start);
          } else {
            client.postMessage(response);
            if (["result", "error"].includes(response.type)) {
              release?.();
              active.delete(client);
            }
          }
        });
        host.onDisconnect.addListener(() => {
          release?.();
          if (!disconnected) client.disconnect();
        });
      } catch (error) {
        active.delete(client);
        release?.();
        if (!disconnected)
          client.postMessage({
            type: "error",
            error: {
              code: error.code || "PROVIDER_ERROR",
              message: error.message,
            },
          });
      }
    });
  });
}
