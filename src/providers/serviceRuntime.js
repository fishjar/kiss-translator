import { invokeInstance } from "./runtime";
import { createInvocation } from "./invocation";
import { createAssetStore } from "./transport";
import { invokeBridgedService } from "./bridgeInvocation";
import { OPT_TRANS_SYSTEM_TTS } from "../config/api";

/** Frontend dispatch keeps legacy native page dependencies out of the user-script Offscreen host. */
export function invokeService(instance, capability, input, options = {}) {
  // Chrome TTS stop is browser-global. Background owns all utterances so a stale
  // page cancellation cannot stop a different page's newer speech task.
  if (
    instance.apiType === OPT_TRANS_SYSTEM_TTS &&
    capability === "speak" &&
    globalThis.chrome?.runtime?.id &&
    // Content scripts expose runtime but not chrome.tts; the privileged owner
    // must still handle playback and browser-global cancellation for Chromium.
    (["chrome", "edge"].includes(process.env.REACT_APP_CLIENT) ||
      globalThis.chrome?.tts?.speak)
  )
    return invokeBridgedService(instance.apiSlug, capability, input, options);
  if (
    !instance.provider ||
    instance.provider.implementation.kind === "native"
  ) {
    // Native execution has no interpreter or user network grants. Its compiled
    // adapter remains responsible for the existing trusted transport/lifecycle.
    const assets = options.assets || createAssetStore();
    const invocation = createInvocation(async (invocation) => {
      const { createNativeRegistry } = await import(
        "../builtin-plugins/runtime"
      );
      const call = createNativeRegistry(
        (id) => (id === instance.apiSlug ? instance : undefined),
        { assets, nativeOptions: options.nativeOptions }
      ).invoke(instance.apiSlug, capability, input, {
        ...options,
        signal: invocation.signal,
      });
      const events = (async () => {
        for await (const event of call.events) await invocation.emit(event);
      })();
      events.catch(() => {});
      let unsubscribe = () => {};
      if (instance.apiSlug) {
        const [
          { subscribeStorageInvalidation },
          { getSettingWithDefault },
          { STOKEY_SETTING },
        ] = await Promise.all([
          import("../libs/storageEvents"),
          import("../libs/storage"),
          import("../config/storage"),
        ]);
        unsubscribe = subscribeStorageInvalidation(STOKEY_SETTING, () => {
          getSettingWithDefault()
            .then((setting) => {
              if (
                !setting.transApis.some(
                  (api) => api.apiSlug === instance.apiSlug && !api.isDisabled
                )
              )
                call.cancel();
            })
            .catch(() => {});
        });
        invocation.signal.addEventListener("abort", unsubscribe, {
          once: true,
        });
        if (invocation.signal.aborted) unsubscribe();
      }
      try {
        const result = await call.result;
        await events;
        return result;
      } finally {
        await call.finished;
        invocation.signal.removeEventListener("abort", unsubscribe);
        unsubscribe();
      }
    }, options);
    return { ...invocation, assets };
  }
  return invokeInstance(instance, capability, input, options);
}
