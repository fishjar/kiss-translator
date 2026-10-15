import { invokeScene } from "./sceneInvocation";
import { parseAITerms } from "../libs/utils";
import { translationOptions } from "./defaultPrompts";

/** Compatibility with BatchQueue's item generator, preserving stable dispatched indexes. */
export async function* translatePlugin(
  texts,
  {
    apiSetting,
    fromLang,
    toLang,
    glossary,
    signal,
    docInfo,
    textFormat = "text",
    nativeOptions,
    invoke = invokeScene,
  }
) {
  const items = texts.map((text, index) => ({ id: String(index), text }));
  const invocation = invoke(
    apiSetting,
    "translate",
    {
      ...(apiSetting.provider?.implementation?.kind !== "native" &&
        translationOptions(apiSetting)),
      items,
      sourceLanguage: fromLang,
      targetLanguage: toLang,
      glossary: { ...glossary, ...parseAITerms(apiSetting.aiTerms) },
      context: docInfo?.context || docInfo?.summary || "",
      document: {
        title: docInfo?.title || "",
        description: docInfo?.description || "",
        summary: docInfo?.summary || "",
        url: docInfo?.url || "",
      },
      tone: apiSetting.tone || "",
      textFormat,
      systemPrompt:
        (apiSetting.useBatchFetch
          ? apiSetting.systemPrompt
          : apiSetting.nobatchPrompt) ?? undefined,
      userPrompt: apiSetting.useBatchFetch
        ? apiSetting.batchUserPrompt
        : apiSetting.nobatchUserPrompt,
    },
    { signal, nativeOptions, timeoutMs: (apiSetting.httpTimeout || 30) * 1000 }
  );
  const completed = new Map();
  const partials = new Map();
  let failure;
  const result = invocation.result.catch((error) => {
    failure = error;
  });
  try {
    for await (const event of invocation.events) {
      if (!["item.delta", "item.complete"].includes(event.type)) continue;
      const id = items.findIndex((item) => item.id === event.id);
      if (id < 0) throw new Error("Unknown translation item ID.");
      if (event.type === "item.complete") {
        if (completed.has(id))
          throw new Error("Duplicate translation completion.");
        completed.set(id, event.text);
        // A completed row is still a preview until the whole invocation succeeds.
        // Returning a `result` here would let BatchQueue/cache accept a truncated stream.
        yield { id, partialText: event.text, isComplete: false };
      } else if (!completed.has(id)) {
        // Scene renderers consume accumulated text; Provider events carry only the new delta.
        const partialText = (partials.get(id) || "") + event.text;
        partials.set(id, partialText);
        yield { id, partialText, isComplete: false };
      }
    }
    const final = await result;
    if (failure) throw failure;
    const seen = new Set();
    for (const item of final.items || []) {
      const id = items.findIndex((entry) => entry.id === item.id);
      if (id < 0 || seen.has(id) || typeof item.text !== "string")
        throw new Error("Invalid translation result.");
      seen.add(id);
      if (completed.has(id) && completed.get(id) !== item.text)
        throw new Error("Final translation rewrote a completed item.");
    }
    if (seen.size !== items.length)
      throw new Error("Missing translation result.");
    for (const item of final.items) {
      const id = items.findIndex((entry) => entry.id === item.id);
      yield { id, result: [item.text, final.sourceLanguage || ""] };
    }
  } finally {
    invocation.cancel();
  }
}
