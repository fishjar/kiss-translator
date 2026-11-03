import {
  serviceInvocationOptions,
  serviceTimeoutMs,
  resolveInvocationConfig,
} from "./timeout";
import { createInvocation } from "./invocation";
import { createAssetStore } from "./transport";
import { invokeScene } from "./sceneInvocation";
import { providerError } from "./capabilities";

/** Resolve the existing scene FK without copying credentials or implementation into UI messages. */
export function invokeSavedService(serviceId, capability, input, options = {}) {
  const startedAt = Date.now();
  const assets = options.assets || createAssetStore();
  const invocation = createInvocation(async (ctx) => {
    const {
      instance,
      getSettingWithDefault,
      subscribeStorageInvalidation,
      STOKEY_SETTING,
    } = await resolveInvocationConfig(ctx, async () => {
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
      return {
        instance,
        getSettingWithDefault,
        subscribeStorageInvalidation,
        STOKEY_SETTING,
      };
    });
    ctx.setDeadline(
      startedAt + (options.timeoutMs ?? serviceTimeoutMs(instance))
    );
    if (ctx.signal.aborted) throw ctx.signal.reason;
    const call = invokeScene(instance, capability, input, {
      ...serviceInvocationOptions(instance, options),
      deadlineAt: ctx.deadlineAt,
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
  }, options);
  return { ...invocation, assets };
}
