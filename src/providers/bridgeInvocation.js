import { createInvocation } from "./invocation";
import { createAssetStore } from "./transport";

/** Load extension APIs only when a privileged task is selected, keeping Web/userscript native paths usable. */
export function invokeBridgedService(
  serviceId,
  capability,
  input,
  options = {}
) {
  const assets = options.assets || createAssetStore();
  const invocation = createInvocation(async (ctx) => {
    const { invokePlugin } = await import("./bridge");
    if (ctx.signal.aborted) throw ctx.signal.reason;
    const call = invokePlugin(serviceId, capability, input, {
      ...options,
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
