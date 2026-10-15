import { browser } from "../libs/browser";
import { createInvocation } from "./invocation";
import { invokeProviderPort, PROVIDER_HOST_PORT } from "./bridge";
import {
  approvedProviderOrigins,
  providerGrantKey,
  providerPluginId,
} from "./grants";
import { acquireProviderHost } from "./hostLease";
import { localAiHost } from "../libs/localAiBackground";
import { STOKEY_SETTING } from "../config/storage";
import { availableServiceIds } from "./lifecycle";
import { providerError } from "./capabilities";

/** Background cannot connect to its own client relay. Resolve grants here and
 * connect directly to the shared host using the same bounded IPC implementation. */
export function invokeBackgroundPlugin(
  instance,
  capability,
  input,
  options = {}
) {
  return createInvocation(
    async (ctx) => {
      if (
        !instance.provider ||
        instance.provider.implementation?.kind === "native"
      )
        throw providerError(
          "NATIVE_ACCESS_DENIED",
          "Expected an external service."
        );
      const grantKey = providerGrantKey(providerPluginId(instance));
      if (ctx.signal.aborted) throw ctx.signal.reason;
      let call;
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
        const revoked = changes[grantKey] && !changes[grantKey].newValue;
        if (revoked || (available && !available.has(instance.apiSlug)))
          invalidate(
            providerError(
              revoked ? "PERMISSION_REQUIRED" : "SERVICE_UNAVAILABLE",
              "Service authorization or availability changed."
            )
          );
      };
      browser.storage.onChanged.addListener(changed);
      try {
        return await Promise.race([
          invalidated,
          (async () => {
            const approvedOrigins = [
              ...(await approvedProviderOrigins(instance)),
            ];
            if (ctx.signal.aborted) throw ctx.signal.reason;
            if (globalThis.chrome?.offscreen?.createDocument) {
              await localAiHost({ action: "ensure" });
              if (ctx.signal.aborted) throw ctx.signal.reason;
              call = invokeProviderPort(
                PROVIDER_HOST_PORT,
                { instance, approvedOrigins },
                capability,
                input,
                { ...options, signal: ctx.signal }
              );
            } else {
              const { invokeInstance } = await import("./runtime");
              if (ctx.signal.aborted) throw ctx.signal.reason;
              call = invokeInstance(instance, capability, input, {
                ...options,
                signal: ctx.signal,
                approvedOrigins: new Set(approvedOrigins),
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
        ctx.signal.removeEventListener("abort", aborted);
        browser.storage.onChanged.removeListener(changed);
        call?.cancel();
        release();
      }
    },
    { ...options, timeoutMs: options.timeoutMs || 60000 }
  );
}
