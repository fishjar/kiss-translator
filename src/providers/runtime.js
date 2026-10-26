import { serviceInvocationOptions } from "./timeout";
import { createProviderRegistry } from "./registry";
import { createTransportBroker, createAssetStore } from "./transport";
import { projectInstanceConfig, validateServiceConfig } from "./instances";
import { supportedCapabilities } from "./capabilities";
import { providerHelpers } from "./sdk";
import { createTranslationHelpers } from "./sdk/translation";
import { runDeclarative } from "./declarative";
import { createScriptExecutor } from "./scriptExecutor";
import { importExecutionResources } from "./resources";

/** Runs in an extension document. Cross-context callers must use the host bridge. */
export function invokeInstance(
  instance,
  capability,
  input,
  { assets = createAssetStore(), ...options }
) {
  options = serviceInvocationOptions(instance, options);
  const registry = createProviderRegistry({
    resolveInstance: (id) => (id === instance.apiSlug ? instance : undefined),
    createContext: (api, invocation) => {
      validateServiceConfig(
        api.provider,
        api.pluginConfig,
        api.enabledCapabilities ?? supportedCapabilities(api)
      );
      // Execution resources travel with the instance, so missing/uninstalled templates
      // cannot change behavior. Each invocation owns independent asset references.
      const resources = importExecutionResources(
        api.provider.resources,
        assets
      );
      const broker = createTransportBroker(api, {
        signal: invocation.signal,
        assets,
        diagnostic: {
          ...options.diagnostic,
          requestId: invocation.requestId,
          serviceId: api.apiSlug,
          method: capability,
        },
      });
      return {
        ...invocation,
        ...broker,
        assets,
        resources,
        serviceId: api.apiSlug,
        config: projectInstanceConfig(api).config,
        helpers: {
          ...providerHelpers,
          translation: {
            ...providerHelpers.translation,
            ...createTranslationHelpers(invocation.translationInput),
          },
        },
      };
    },
    runners: { declarative: runDeclarative, script: createScriptExecutor() },
  });
  return registry.invoke(instance.apiSlug, capability, input, options);
}
