import { InferenceCache, inferenceCacheKey, INFERENCE_CACHE_VERSION } from "../localAi/core/inferenceCache";
import { providerCacheSignature } from "../providers/cache";
import { approvedProviderOrigins } from "../providers/grants";
import { validateServiceConfig } from "../providers/instances";
import { isApiAvailableFor } from "../config/serviceSelection";
import { getSettingWithDefault } from "../libs/storage";
import { fileError } from "./protocol";

const cache = new InferenceCache();
export async function validateFileService(api, capability, signal) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  const current = (await getSettingWithDefault()).transApis.find((item) => item.apiSlug === api.apiSlug);
  if (!current || !isApiAvailableFor(current, capability))
    throw fileError("SERVICE_UNAVAILABLE", "所选服务不可用");
  if (current.provider) {
    validateServiceConfig(current.provider, current.pluginConfig, current.enabledCapabilities);
    if (current.provider.implementation?.kind !== "native") await approvedProviderOrigins(current);
  }
  if (await providerCacheSignature(current, capability) !== await providerCacheSignature(api, capability))
    throw fileError("SERVICE_UNAVAILABLE", "服务配置已变化，请重新执行");
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
}

export async function cachedFileResult({ api, capability, input, policy, cacheMode, signal, onProgress, validate, run }) {
  await validateFileService(api, capability, signal);
  // Local inference already owns its cache. Do not duplicate those results here.
  const enabled = api.apiType !== "LocalAI" && policy.inferenceCacheEnabled && cacheMode !== "off";
  const generation = enabled ? await cache.generation() : null;
  let key;
  if (enabled && generation !== null) {
    try {
      key = await inferenceCacheKey({ namespace: "file-interface-v1", version: INFERENCE_CACHE_VERSION,
        config: Object.fromEntries(Object.entries(api).filter(([field]) =>
          !["apiName", "sortOrder", "isDisabled", "cacheMode"].includes(field))), capability, input });
    } catch { /* Storage and digest failures fall back to normal execution. */ }
  }
  const hit = key && cacheMode !== "refresh" ? await cache.get(key, policy) : null;
  if (hit) {
    await validateFileService(api, capability, signal);
    validate?.(hit.value);
    onProgress?.({ type: "cache-hit" });
    return hit.value;
  }
  if (api.apiType !== "LocalAI") onProgress?.({ type: "inference" });
  const result = await run();
  await validateFileService(api, capability, signal);
  validate?.(result);
  if (key && (capability === "analyzeLayout" || result.text?.trim()))
    await cache.put(key, result, generation, policy, signal);
  return result;
}
