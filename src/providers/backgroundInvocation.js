import { serviceInvocationOptions } from "./timeout";
import { browser } from "../libs/browser";
import { createInvocation } from "./invocation";
import { invokeProviderPort, PROVIDER_HOST_PORT } from "./bridge";
import { acquireProviderHost } from "./hostLease";
import { localAiHost } from "../libs/localAiBackground";
import { STOKEY_SETTING } from "../config/storage";
import { availableServiceIds } from "./lifecycle";
import { providerError } from "./capabilities";

/** Connect directly to the shared host using bounded IPC. */
export function invokeBackgroundPlugin(
  instance,
  capability,
  input,
  options = {}
) {
  options = serviceInvocationOptions(instance, options);
  return createInvocation(async (ctx) => {
    if (
      !instance.provider ||
      instance.provider.implementation?.kind === "native"
    )
      throw providerError(
        "NATIVE_ACCESS_DENIED",
        "Expected an external service."
      );
    if (ctx.signal.aborted) throw ctx.signal.reason;
    let call;
    let stopped = false;
    const release = acquireProviderHost();
    let invalidate;
    const invalidated = new Promise((_, reject) => {
      invalidate = reject;
    });
    const aborted = () => invalidate(ctx.signal.reason);
    ctx.signal.addEventListener("abort", aborted, { once: true });
    const changed = (changes, area) => {
      if (area !== "local") return;
      const available = changes[STOKEY_SETTING]
        ? availableServiceIds(changes[STOKEY_SETTING].newValue)
        : null;
      if (available && !available.has(instance.apiSlug))
        invalidate(
          providerError(
            "SERVICE_UNAVAILABLE",
            "Service was disabled or deleted."
          )
        );
    };
    browser.storage.onChanged.addListener(changed);
    try {
      return await Promise.race([
        invalidated,
        (async () => {
          if (ctx.signal.aborted) throw ctx.signal.reason;
          if (globalThis.chrome?.offscreen?.createDocument) {
            await localAiHost({ action: "ensure" });
            if (stopped) return;
            if (ctx.signal.aborted) throw ctx.signal.reason;
            call = invokeProviderPort(
              PROVIDER_HOST_PORT,
              { instance },
              capability,
              input,
              { ...options, signal: ctx.signal }
            );
          } else {
            const { invokeInstance } = await import("./runtime");
            if (stopped) return;
            if (ctx.signal.aborted) throw ctx.signal.reason;
            call = invokeInstance(instance, capability, input, {
              ...options,
              signal: ctx.signal,
            });
          }
          const events = (async () => {
            for await (const event of call.events) await ctx.emit(event);
          })();
          events.catch(() => {});
          const result = await call.result;
          await events;
          return result;
        })(),
      ]);
    } finally {
      stopped = true;
      ctx.signal.removeEventListener("abort", aborted);
      browser.storage.onChanged.removeListener(changed);
      call?.cancel();
      release();
    }
  }, options);
}
