import { builtinPlugins } from "./index";
import { createProviderRegistry } from "../providers/registry";
import { providerError } from "../providers/capabilities";
import { providerHelpers } from "../providers/sdk";
import {
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
} from "../config/apiConstants";
import {
  OPT_LANGS_TO_SPEC,
  OPT_LANGS_FROM_SPEC,
  OPT_LANGS_TO_CODE,
} from "./languageMappings";
import { OPT_LANGS_SPEC_DEFAULT } from "../providers/sdk/languageDictionary";
import { localHandlers } from "./local";
import { speakNative } from "./system-speech";
import { chatNative } from "./chat";
import { recognizeNativeNetworkImage } from "../apis/vision";
import {
  apiGoogleLangdetect,
  apiBaiduLangdetect,
  apiTencentLangdetect,
  apiBaiduSuggest,
} from "./discovery";
import { normalizeLanguageCode } from "../libs/language";
import { createAssetStore } from "../providers/transport";
import { resolveBuiltinCapabilities } from "./capabilities";
import {
  handleNativeTranslate as handleTranslate,
  handleNativeDict as handleDict,
  handleNativeSummarize as handleSummarize,
  handleNativeSubtitle as handleSubtitle,
} from "../apis/trans";

function languageOptions(input, api, nativeOptions = {}) {
  const fromLang = input.sourceLanguage || "auto";
  const toLang = input.targetLanguage || input.language || "zh-CN";
  const langMap = OPT_LANGS_TO_SPEC[api.apiType] || OPT_LANGS_SPEC_DEFAULT;
  const fromMap = OPT_LANGS_FROM_SPEC[api.apiType] || langMap;
  return {
    fromLang,
    toLang,
    // Existing callers may already have converted canonical codes to the
    // vendor's language IDs. Preserve that conversion across the typed boundary.
    from: nativeOptions.from ?? fromMap.get(fromLang),
    to: nativeOptions.to ?? langMap.get(toLang),
    langMap: nativeOptions.langMap || langMap,
  };
}

const handlers = {
  ...localHandlers,
  speak: speakNative,
  async detectLanguage(input, api, ctx) {
    const detector =
      {
        [OPT_TRANS_GOOGLE]: apiGoogleLangdetect,
        [OPT_TRANS_BAIDU]: apiBaiduLangdetect,
        [OPT_TRANS_TENCENT]: apiTencentLangdetect,
      }[api.apiType] || (await import("../apis")).apiBuiltinAIDetect;
    const detected = await detector(input.text, { signal: ctx.signal });
    return {
      language: normalizeLanguageCode(
        OPT_LANGS_TO_CODE[api.apiType]?.get(detected) || detected
      ),
    };
  },
  async suggest(input, _api, ctx) {
    const result = await apiBaiduSuggest(input.text, { signal: ctx.signal });
    return { items: result.map((item) => item.k) };
  },
  async translate(input, api, ctx) {
    if (api.apiType === OPT_TRANS_BUILTINAI) {
      const { apiTranslate } = await import("../apis");
      const result = [];
      let sourceLanguage;
      for (const item of input.items) {
        const { trText, srCode } = await apiTranslate({
          text: item.text,
          fromLang: input.sourceLanguage || "auto",
          toLang: input.targetLanguage,
          apiSetting: api,
          signal: ctx.signal,
          useCache: false,
        });
        result.push({ id: item.id, text: trText });
        sourceLanguage ||= srCode;
      }
      return { items: result, ...(sourceLanguage && { sourceLanguage }) };
    }
    const completed = new Map();
    const partials = new Map();
    const texts = input.items.map((item) => item.text);
    let sourceLanguage;
    for await (const item of handleTranslate(texts, {
      ...ctx.nativeOptions,
      apiSetting: {
        ...api,
        // The instance flag controls host aggregation. A typed multi-item task
        // already contains a batch and must retain its IDs during wire encoding.
        useBatchFetch: input.items.length > 1 || api.useBatchFetch,
        useStream: ctx.options.streaming,
      },
      ...languageOptions(input, api, ctx.nativeOptions),
      glossary: input.glossary,
      docInfo: ctx.nativeOptions?.docInfo || {
        ...input.document,
        context: input.context || "",
        summary: input.document?.summary || input.context || "",
      },
      textFormat: input.textFormat || "text",
      signal: ctx.signal,
    })) {
      const id = input.items[item.id]?.id;
      if (id === undefined)
        throw providerError(
          "INVALID_RESPONSE",
          "Native translation returned an unknown ID."
        );
      if (item.result) {
        completed.set(id, { id, text: item.result[0] });
        sourceLanguage ||= item.result[1];
        if (ctx.options.streaming)
          await ctx.emit({ type: "item.complete", id, text: item.result[0] });
      } else if (typeof item.partialText === "string") {
        // Legacy streams expose cumulative text; the public event contract uses deltas.
        const previous = partials.get(id) || "";
        if (!item.partialText.startsWith(previous))
          throw providerError(
            "INVALID_RESPONSE",
            "Native stream rewrote an emitted prefix."
          );
        await ctx.emit({
          type: "item.delta",
          id,
          text: item.partialText.slice(previous.length),
        });
        partials.set(id, item.partialText);
      }
    }
    return {
      items: input.items.map((item) => completed.get(item.id)).filter(Boolean),
      ...(sourceLanguage && { sourceLanguage }),
    };
  },
  async dictionary(input, api, ctx) {
    let previous = "";
    const onStreamChunk =
      ctx.nativeOptions?.onStreamChunk ||
      (ctx.options.streaming
        ? async ({ markdown }) => {
            try {
              if (!markdown.startsWith(previous))
                throw providerError(
                  "INVALID_RESPONSE",
                  "Dictionary stream rewrote an emitted prefix."
                );
              await ctx.emit({
                type: "text.delta",
                text: markdown.slice(previous.length),
              });
              previous = markdown;
            } catch (error) {
              error.isProviderStreamError = true;
              throw error;
            }
          }
        : undefined);
    const text = await handleDict({
      ...ctx.nativeOptions,
      text: input.text,
      ...languageOptions(input, api, ctx.nativeOptions),
      apiSetting: { ...api, useStream: ctx.options.streaming },
      context: input.context,
      signal: ctx.signal,
      onStreamChunk,
    });
    return { text, format: "markdown" };
  },
  async summarize(input, api, ctx) {
    return {
      text: await handleSummarize({
        ...ctx.nativeOptions,
        transcript: input.text,
        description: ctx.nativeOptions?.description ?? input.context,
        to: input.language,
        prompt: {
          systemPrompt: input.instructions,
          userPrompt: input.userPrompt,
        },
        apiSetting: api,
        signal: ctx.signal,
      }),
    };
  },
  async segmentSubtitle(input, api, ctx) {
    const result = await handleSubtitle({
      ...ctx.nativeOptions,
      events: input.items,
      from: input.sourceLanguage || "auto",
      to: input.targetLanguage,
      apiSetting: {
        ...api,
        useStream: Boolean(ctx.nativeOptions?.onSubtitleChunk && api.useStream),
      },
      docInfo: ctx.nativeOptions?.docInfo || { summary: input.context || "" },
      signal: ctx.signal,
    });
    return {
      groups: result.map((cue) => ({
        ids: input.items.slice(cue._si, cue._ei + 1).map((item) => item.id),
        text: cue.text,
        translation: cue.translation,
      })),
    };
  },
};

/** The whitelist is compiled from real built-ins; synced flags cannot grant arbitrary native entry access. */
export function createNativeRegistry(
  resolveInstance,
  { assets = createAssetStore(), nativeOptions } = {}
) {
  const definitions = new Map(
    builtinPlugins.map((pack) => [pack.services[0].id, pack.services[0]])
  );
  const registry = createProviderRegistry({
    resolveInstance: async (id) => {
      const api = await resolveInstance(id);
      const definition = definitions.get(api?.apiType);
      if (api?.provider && api.provider.apiVersion !== "1")
        throw providerError(
          "SDK_VERSION_UNSUPPORTED",
          "Unsupported native snapshot version."
        );
      if (
        !definition ||
        api.provider?.source?.external ||
        (api.provider &&
          (api.provider.implementation.kind !== "native" ||
            api.provider.implementation.entry !== definition.id))
      )
        throw providerError(
          "NATIVE_ACCESS_DENIED",
          "Unknown or mismatched native provider."
        );
      // Old settings acquire a descriptor in memory; reads never persist migrations or change scene IDs.
      const capabilities = await resolveBuiltinCapabilities(api);
      return {
        ...api,
        provider: {
          ...JSON.parse(JSON.stringify(definition)),
          capabilities,
          apiVersion: "1",
          source: { external: false },
        },
      };
    },
    createContext: (_api, invocation) => ({
      ...invocation,
      helpers: providerHelpers,
      assets,
      nativeOptions,
    }),
  });
  for (const [id, definition] of definitions)
    registry.registerNative(
      id,
      Object.fromEntries(
        Object.entries(
          id === OPT_TRANS_LOCALAI
            ? handlers
            : {
                ...handlers,
                chat: chatNative,
                parseImage: async (input, api, ctx) => {
                  return {
                    ...(await recognizeNativeNetworkImage(
                      ctx.assets.get(input.image),
                      api,
                      input.prompt,
                      ctx.signal
                    )),
                    format: "markdown",
                  };
                },
              }
        ).filter(([name]) => definition.capabilities[name])
      )
    );
  return registry;
}
