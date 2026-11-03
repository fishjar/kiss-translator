import {
  serviceInvocationOptions,
  serviceTimeoutMs,
  resolveInvocationConfig,
} from "./timeout";
import { providerError } from "./capabilities";
import { createInvocation } from "./invocation";
import { createAssetStore } from "./transport";

/** Load extension APIs only when a privileged task is selected, keeping Web/userscript native paths usable. */
export function invokeBridgedService(
  serviceId,
  capability,
  input,
  options = {}
) {
  const startedAt = Date.now();
  const assets = options.assets || createAssetStore();
  const invocation = createInvocation(async (ctx) => {
    let resolved = options;
    const { invokePlugin } = await resolveInvocationConfig(ctx, async () => {
      if (options.timeoutMs === undefined && options.deadlineAt === undefined) {
        const { getSettingWithDefault } = await import("../libs/storage");
        const instance = (await getSettingWithDefault()).transApis.find(
          (api) => api.apiSlug === serviceId && !api.isDisabled
        );
        if (!instance)
          throw providerError(
            "SERVICE_UNAVAILABLE",
            "Service is disabled, deleted or unavailable."
          );
        resolved = serviceInvocationOptions(instance, options);
        ctx.setDeadline(startedAt + serviceTimeoutMs(instance));
        resolved.deadlineAt = ctx.deadlineAt;
      }
      if (ctx.signal.aborted) throw ctx.signal.reason;
      return import("./bridge");
    });
    if (ctx.signal.aborted) throw ctx.signal.reason;
    const call = invokePlugin(serviceId, capability, input, {
      ...resolved,
      assets,
      signal: ctx.signal,
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
      call.cancel();
    }
  }, options);
  return { ...invocation, assets };
}
