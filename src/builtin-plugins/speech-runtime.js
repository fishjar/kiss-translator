import { createProviderRegistry } from "../providers/registry";
import { providerError } from "../providers/capabilities";
import { OPT_TRANS_SYSTEM_TTS } from "../config/apiConstants";
import { speakNative } from "./system-speech";

/** Only compiled system speech runs here; no Offscreen, model runtime or interpreter is loaded. */
export function invokeBackgroundSpeech(instance, capability, input, options) {
  const registry = createProviderRegistry({
    resolveInstance: () => {
      if (
        instance.apiType !== OPT_TRANS_SYSTEM_TTS ||
        instance.provider?.source?.external ||
        (instance.provider &&
          (instance.provider.apiVersion !== 1 ||
            instance.provider.implementation.kind !== "native" ||
            instance.provider.implementation.entry !== OPT_TRANS_SYSTEM_TTS))
      )
        throw providerError(
          "NATIVE_ACCESS_DENIED",
          "Invalid system speech instance."
        );
      return {
        ...instance,
        provider: {
          apiVersion: 1,
          implementation: { kind: "native", entry: OPT_TRANS_SYSTEM_TTS },
          capabilities: {
            speak: { handler: "speak", outputModes: ["complete"] },
          },
        },
      };
    },
    createContext: (_instance, ctx) => ctx,
  });
  registry.registerNative(OPT_TRANS_SYSTEM_TTS, { speak: speakNative });
  return registry.invoke(instance.apiSlug, capability, input, options);
}
