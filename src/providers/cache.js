import { getCacheDigest } from "../libs/cacheDigest";
import { projectApiCapabilities } from "../config/serviceSelection";
import { usesStreaming } from "./capabilities";

/** Snapshot/config/task changes invalidate the cache, without exposing credentials in its URL. */
export function providerCacheSignature(api, capability, context) {
  const runtimeConfig = Object.fromEntries(
    Object.entries(api).filter(
      ([key]) =>
        ![
          "apiName",
          "sortOrder",
          "isDisabled",
          "provider",
          "pluginConfig",
          "cacheMode",
        ].includes(key)
    )
  );
  return getCacheDigest(
    JSON.stringify([
      capability,
      api.provider,
      api.pluginConfig,
      runtimeConfig,
      usesStreaming(projectApiCapabilities(api), capability),
      context,
    ]),
    "provider-cache-v2"
  );
}
