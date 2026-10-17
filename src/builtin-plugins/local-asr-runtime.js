import { createProviderRegistry } from "../providers/registry";
import { providerError } from "../providers/capabilities";
import { isHostedLocalAsr } from "../providers/localAsrRouting";
import { resolveBuiltinCapabilities } from "./capabilities";
import { OPT_TRANS_LOCALAI } from "../config/apiConstants";
import { localHandlers } from "./local";

/** Bind to the existing Offscreen manager, preserving its workers and callbacks. */
export function createLocalAsrInvoker(manager) {
  const runtimeHost = {
    cancel: (id, reason) => manager.cancelRequest(id, reason),
    async request(request, hooks) {
      const cancel = () =>
        manager.cancelRequest(request.id, "REQUEST_CANCELLED");
      if (hooks.signal.aborted) throw hooks.signal.reason;
      hooks.signal.addEventListener("abort", cancel, { once: true });
      try {
        const response = await manager.handleRequest(request, {
          onProgress: hooks.onProgress,
        });
        if (hooks.signal.aborted) throw hooks.signal.reason;
        if (!response.ok)
          throw providerError(
            response.error?.code || "ASR_FAILED",
            response.error?.message || "Local ASR failed."
          );
        return response.result;
      } finally {
        hooks.signal.removeEventListener("abort", cancel);
      }
    },
  };
  return (instance, capability, input, options) => {
    const registry = createProviderRegistry({
      resolveInstance: () => {
        if (!isHostedLocalAsr(instance, capability))
          throw providerError(
            "NATIVE_ACCESS_DENIED",
            "Invalid local ASR instance."
          );
        return {
          ...instance,
          provider: {
            apiVersion: "1",
            implementation: { kind: "native", entry: OPT_TRANS_LOCALAI },
            capabilities: resolveBuiltinCapabilities(instance),
          },
        };
      },
      createContext: (_instance, ctx) => ({
        ...ctx,
        assets: options.assets,
        runtimeHost,
      }),
    });
    registry.registerNative(OPT_TRANS_LOCALAI, {
      transcribe: localHandlers.transcribe,
    });
    return registry.invoke(instance.apiSlug, capability, input, options);
  };
}
