import { providerError } from "../providers/capabilities";

/** Reuse the existing runtime host and scheduler; never create/unload a private model session per task. */
async function request(api, ctx, service, method, payload) {
  const { cacheMode, ...data } = payload;
  const { runtimeHost } = await import("../localAi/runtime/runtimeHostAdapter");
  const { resolveModelTarget } = await import("../localAi/core/modelTarget");
  const target = {
    modelRef: api.modelRef,
    loadSpec: { device: api.device || "wasm" },
  };
  resolveModelTarget(service, target);
  let eventError;
  const result = await runtimeHost.request(
    {
      id: ctx.requestId,
      service,
      method,
      payload: { ...data, ...target },
      options: { cacheMode },
    },
    {
      signal: ctx.signal,
      onProgress: (p) => {
        // Runtime backends report different percentage scales. Byte totals provide
        // an exact normalized fraction; otherwise preserve an indeterminate status.
        void ctx
          .emit({
            type: "progress",
            ...(Number.isFinite(p.loaded) &&
              Number.isFinite(p.total) &&
              p.total > 0 && {
                progress: Math.min(1, Math.max(0, p.loaded / p.total)),
              }),
            ...(p.status && { message: String(p.status) }),
          })
          .catch((error) => {
            eventError = error;
            runtimeHost.cancel(ctx.requestId, error.message);
          });
      },
    }
  );
  if (eventError) throw eventError;
  if (result?.aborted)
    throw providerError("REQUEST_CANCELLED", "Local inference was cancelled.");
  return result;
}

export const localHandlers = {
  async chat(input, api, ctx) {
    const messages = input.messages.map((message) => {
      if (typeof message.content !== "string")
        throw providerError(
          "MODALITY_UNSUPPORTED",
          "The local text model accepts text messages only."
        );
      return message;
    });
    const result = await request(api, ctx, "llm", "chat", {
      messages,
      maxTokens: api.maxTokens || 2048,
      temperature: api.temperature,
    });
    return { text: result.text, reasoning: "" };
  },
  async transcribe(input, api, ctx) {
    const { decodeAudioFile, resampleTo16k } = await import(
      "../localAi/core/recorder"
    );
    const file = ctx.assets.get(input.audio);
    const decoded = await decodeAudioFile(file);
    if (ctx.signal.aborted) throw ctx.signal.reason;
    const result = await request(api, ctx, "asr", "transcribe", {
      audio: resampleTo16k(decoded.audio, decoded.sampleRate),
      language: input.language || "auto",
    });
    return {
      text: result.segments.map((segment) => segment.text).join("\n"),
      segments: result.segments.map(({ start, end, text }) => ({
        start,
        end,
        text,
      })),
    };
  },
  async synthesizeSpeech(input, api, ctx) {
    const result = await request(api, ctx, "tts", "synthesize", {
      text: input.text,
      voice: input.voice || api.voice || "",
      speed: input.speed ?? api.speed ?? 1,
    });
    const { audioToWavBlob } = await import("../localAi/core/recorder");
    const audio = ctx.assets.put(
      audioToWavBlob(result.audio, result.sampleRate)
    );
    return { audio, mimeType: audio.mimeType };
  },
  async recognizeText(input, api, ctx) {
    const { recognizeFileImage } = await import("../localAi/fileOperations");
    const result = await recognizeFileImage(
      ctx.assets.get(input.image),
      {
        groupId: api.modelRef,
        device: api.device,
        prompt: input.prompt,
        maxTokens: api.maxTokens,
        temperature: api.temperature,
        cacheMode: input.cacheMode,
        onProgress: (status) => ctx.emit({ type: "progress", message: status }),
      },
      ctx.signal
    );
    return {
      ...result,
      text:
        typeof result.text === "string"
          ? result.text
          : result.items.map((item) => item.text).join("\n"),
      format: result.isVlm ? "markdown" : "text",
    };
  },
  async parseImage(input, api, ctx) {
    const { resolveOcrVlmPrompt } = await import(
      "../localAi/core/ocrVlmPrompts"
    );
    return localHandlers.recognizeText(
      {
        ...input,
        prompt:
          input.prompt ??
          resolveOcrVlmPrompt(api.modelRef, input.mode || "doc"),
      },
      api,
      ctx
    );
  },
  async analyzeLayout(input, api, ctx) {
    const result = await request(api, ctx, "doc", "analyze", {
      blob: ctx.assets.get(input.image),
      cacheMode: input.cacheMode,
    });
    return {
      regions: result.regions.map(({ type, polygon, order }) => ({
        type,
        poly: polygon,
        order,
      })),
    };
  },
  evaluate(input, api, ctx) {
    return request(api, ctx, "decision", "predict", {
      state: input.state,
      questions: input.questions,
    });
  },
};
