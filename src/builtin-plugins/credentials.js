import { API_SPE_TYPES, OPT_TRANS_DEEPLX } from "../config/api";

const keyIndexes = new Map();
const urlIndexes = new Map();
function pick(apiSlug, value = "", indexes) {
  const values = value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.length) return "";
  const index = ((indexes.get(apiSlug) ?? -1) + 1) % values.length;
  indexes.set(apiSlug, index);
  return values[index];
}

/** Native text/vision/chat share the existing round-robin policy without changing saved config. */
export function selectNativeEndpoint(api) {
  return {
    ...api,
    ...(API_SPE_TYPES.mulkeys.has(api.apiType) && {
      key: pick(api.apiSlug, api.key, keyIndexes),
    }),
    ...(api.apiType === OPT_TRANS_DEEPLX && {
      url: pick(api.apiSlug, api.url, urlIndexes),
    }),
  };
}
