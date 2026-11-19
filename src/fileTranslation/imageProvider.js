import { browser } from "../libs/browser";
import { createAssetStore } from "../providers/transport";
import { cachedFileResult } from "./resultCache";
import { normalizeSettings } from "../localAi/core/settings";
import { supportedApiFeature } from "../config/serviceSelection";
import { hasCompleteCoordinates } from "./recognition";
import { invokeBackgroundPlugin } from "../providers/backgroundInvocation";
import { createNativeRegistry } from "../builtin-plugins/runtime";
import { fileError } from "./protocol";
import { normalizeImageResult } from "../providers/imageResult";

export async function getInputPolicy() {
  try {
    const stored = await browser.storage.local.get("kiss-ai-settings");
    return normalizeSettings(stored?.["kiss-ai-settings"]);
  } catch {
    return normalizeSettings();
  }
}

/**
 * 调用底层图像类服务提供者 (analyzeLayout / recognizeText / parseImage)
 */
export async function invokeImageProvider(
  api,
  capability,
  prepared,
  signal,
  extra = {}
) {
  const assets = createAssetStore();
  try {
    const { cacheMode, onProgress, requireCoordinates, ...extraInput } = extra;
    const input = {
      ...extraInput,
      ...(api.apiType === "LocalAI" && cacheMode && { cacheMode }),
      image: assets.put(prepared.blob),
      imageSize: prepared.size,
    };
    return await cachedFileResult({
      api,
      capability,
      policy: await getInputPolicy(),
      cacheMode,
      signal,
      onProgress,
      validate: (result) => {
        if (capability === "analyzeLayout") return;
        if (
          !result.translation?.text?.trim() &&
          !result.layout?.regions?.some(
            (r) => r.text?.trim() || r.translation?.trim()
          ) &&
          !result.text?.trim() &&
          !result.items?.some((item) => item.text?.trim())
        )
          throw fileError("INVALID_RESPONSE", "识别返回空结果");
        if (
          (requireCoordinates ??
            supportedApiFeature(api, capability)?.coordinates) &&
          !hasCompleteCoordinates(result.items || [])
        )
          throw fileError(
            "INVALID_RESPONSE",
            "识别服务未返回完整有效的文字坐标"
          );
      },
      input: { ...extraInput, image: prepared.blob, imageSize: prepared.size },
      run: async () => {
        const call =
          api.provider && api.provider.implementation?.kind !== "native"
            ? invokeBackgroundPlugin(api, capability, input, { signal, assets })
            : createNativeRegistry(() => api, { assets }).invoke(
                api.apiSlug,
                capability,
                input,
                { signal }
              );
        const events = (async () => {
          const iterator = call.events[Symbol.asyncIterator]();
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            const status = next.value.message;
            if (status === "CACHE_HIT" || status === "INFERENCE_START")
              onProgress?.({
                type: status === "CACHE_HIT" ? "cache-hit" : "inference",
              });
          }
        })();
        events.catch(() => {});
        try {
          const result = await call.result;
          await events;
          return capability === "parseImage" &&
            (extraInput.protocol === "image-json" ||
              result.translation ||
              result.layout)
            ? normalizeImageResult(result, {
                ...extraInput,
                imageSize: prepared.size,
              })
            : result;
        } finally {
          call.cancel();
        }
      },
    });
  } finally {
    assets.clear();
  }
}
