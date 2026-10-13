import { createInvocation } from "./invocation";
import { createAssetStore } from "./transport";
import { invokeScene } from "./sceneInvocation";
import { providerError } from "./capabilities";

/** Resolve the existing scene FK without copying credentials or implementation into UI messages. */
export function invokeSavedService(serviceId, capability, input, options = {}) {
  const assets = options.assets || createAssetStore();
  const invocation = createInvocation(
    async (ctx) => {
      const { getSettingWithDefault } = await import("../libs/storage");
      const { subscribeStorageInvalidation } = await import(
        "../libs/storageEvents"
      );
      const { STOKEY_SETTING } = await import("../config/storage");
      const instance = (await getSettingWithDefault()).transApis.find(
        (api) => api.apiSlug === serviceId && !api.isDisabled
      );
      if (!instance)
        throw providerError(
          "SERVICE_UNAVAILABLE",
          "Service is disabled, deleted or unavailable."
        );
      if (ctx.signal.aborted) throw ctx.signal.reason;
      const call = invokeScene(instance, capability, input, {
        ...options,
        assets,
        signal: ctx.signal,
      });
      const unsubscribe = subscribeStorageInvalidation(STOKEY_SETTING, () => {
        // Config edits preserve the captured instance; only disable/delete cancels this task.
        getSettingWithDefault()
          .then((setting) => {
            if (
              !setting.transApis.some(
                (api) => api.apiSlug === serviceId && !api.isDisabled
              )
            )
              call.cancel();
          })
          .catch(() => {});
      });
      const events = (async () => {
        for await (const event of call.events) await ctx.emit(event);
      })();
      events.catch(() => {});
      try {
        const result = await call.result;
        await events;
        return result;
      } finally {
        unsubscribe();
        call.cancel();
      }
    },
    { ...options, timeoutMs: options.timeoutMs || 60000 }
  );
  return { ...invocation, assets };
}
