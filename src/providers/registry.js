import {
  getCapabilityDescriptor,
  supportsProviderCapability,
  providerError,
  usesStreaming,
} from "./capabilities";
import { createInvocation } from "./invocation";
import { withDefaultPromptInput } from "./defaultPrompts";
import {
  validateInput,
  validateResult,
  validateEvent,
  checkPayloadBudget,
} from "./validation";

/** Native handlers are statically registered; external snapshots never resolve native code. */
export function createProviderRegistry({
  resolveInstance,
  createContext,
  runners = {},
}) {
  const native = new Map();
  return {
    registerNative(id, handlers) {
      if (native.has(id))
        throw providerError(
          "DUPLICATE_PROVIDER",
          `Provider already registered: ${id}`
        );
      native.set(id, handlers);
    },
    invoke(serviceId, capability, input, options = {}) {
      return createInvocation(async (invocation) => {
        const instance = await resolveInstance(serviceId);
        if (invocation.signal.aborted) throw invocation.signal.reason;
        if (
          instance?.enabledCapabilities !== undefined &&
          (!Array.isArray(instance.enabledCapabilities) ||
            !instance.enabledCapabilities.includes(capability))
        )
          throw providerError(
            "CAPABILITY_DISABLED",
            `Capability is disabled: ${capability}`
          );
        if (!supportsProviderCapability(instance, capability)) {
          throw providerError(
            "SERVICE_UNAVAILABLE",
            `Service does not support ${capability}: ${serviceId}`
          );
        }
        const descriptor = getCapabilityDescriptor(instance, capability);
        if (["recognizeText", "parseImage"].includes(capability) &&
            !(descriptor.taskModes || ["doc"]).includes(input.mode || "doc"))
          throw providerError("TASK_UNSUPPORTED", "Selected service does not support this image task.");
        if (
          capability === "translate" &&
          input.items?.length > 1 &&
          !descriptor.batch?.supported
        ) {
          throw providerError(
            "BATCH_UNSUPPORTED",
            "This capability only accepts one item per invocation."
          );
        }
        if (
          descriptor.batch?.maxItems &&
          input.items?.length > descriptor.batch.maxItems
        ) {
          throw providerError(
            "INPUT_LIMIT_EXCEEDED",
            "Batch item limit exceeded."
          );
        }
        const streaming =
          options.streaming !== "disabled" &&
          usesStreaming(instance, capability);
        if (
          options.streaming === "required" &&
          !descriptor.outputModes?.includes("stream")
        ) {
          throw providerError(
            "STREAM_UNSUPPORTED",
            "This capability does not support streaming."
          );
        }
        input = withDefaultPromptInput(instance, capability, input);
        validateInput(capability, input);
        if (capability === "chat") {
          const modalities = descriptor.inputModalities || ["text"];
          for (const message of input.messages) {
            const parts =
              typeof message.content === "string"
                ? [{ type: "text" }]
                : message.content;
            if (parts.some((part) => !modalities.includes(part.type)))
              throw providerError(
                "MODALITY_UNSUPPORTED",
                "Selected service/model does not accept this input modality."
              );
          }
        }
        const snapshot = instance.provider;
        let eventBytes = 0;
        const ctx = await createContext(instance, {
          ...invocation,
          emit: async (event) => {
            validateEvent(capability, event, input);
            eventBytes += checkPayloadBudget(event);
            if (eventBytes > 8 * 1024 * 1024)
              throw providerError(
                "RESOURCE_BUDGET_EXCEEDED",
                "Event output exceeds 8 MiB."
              );
            await invocation.emit(event);
          },
          options: { streaming: options.streaming === "required" || streaming },
          translationInput: capability === "translate" ? input : undefined,
        });
        if (invocation.signal.aborted) throw invocation.signal.reason;
        if (snapshot.implementation.kind === "native") {
          if (snapshot.source?.external)
            throw providerError(
              "NATIVE_ACCESS_DENIED",
              "External providers cannot use native handlers."
            );
          const handler = native.get(snapshot.implementation.entry)?.[
            descriptor.handler
          ];
          if (typeof handler !== "function")
            throw providerError(
              "HANDLER_MISSING",
              "Native handler is not registered."
            );
          // Built-ins call the original function directly, never a script runner.
          return validateResult(
            capability,
            await handler(input, instance, ctx),
            input,
            descriptor
          );
        }
        const runner = runners[snapshot.implementation.kind];
        if (!runner)
          throw providerError(
            "RUNNER_UNAVAILABLE",
            "Provider runner is not available."
          );
        const result = validateResult(
          capability,
          await runner(snapshot, descriptor.handler, input, ctx),
          input,
          descriptor
        );
        if (capability === "synthesizeSpeech") {
          const blob = ctx.assets?.get(result.audio);
          if (
            blob &&
            (blob.type || "application/octet-stream") !== result.audio.mimeType
          )
            throw providerError(
              "INVALID_RESPONSE",
              "Audio MIME type does not match its task asset."
            );
        }
        return result;
      }, options);
    },
  };
}
