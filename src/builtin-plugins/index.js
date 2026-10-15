import { DEFAULT_API_LIST, OPT_TRANS_BAIDU } from "../config/api";
import { getBuiltinServiceDefinition } from "./definitions";
import { validateBuiltinSettingChanges } from "./fields";
import { resolveBuiltinCapabilities } from "./capabilities";

// Register saved Baidu records without putting them back into the default list.
const builtinPresets = DEFAULT_API_LIST.some(
  (preset) => preset.apiType === OPT_TRANS_BAIDU
)
  ? DEFAULT_API_LIST
  : [...DEFAULT_API_LIST, { apiType: OPT_TRANS_BAIDU }];

/** Compiled manifests; capability/field declarations are owned by native modules. */
export const builtinPlugins = builtinPresets.map((preset) => ({
  manifestVersion: 1,
  apiVersion: "1",
  id: "builtin:" + preset.apiType,
  name: preset.apiType,
  services: [getBuiltinServiceDefinition(preset.apiType)],
  presets: [preset],
}));

export function createBuiltinInstance(apiType, apiSlug, apiName) {
  const plugin = builtinPlugins.find((item) => item.services[0].id === apiType);
  if (!plugin) throw new Error(`Unknown built-in provider: ${apiType}`);
  const defaults = JSON.parse(JSON.stringify(plugin.presets[0]));
  validateBuiltinSettingChanges({}, defaults);
  return {
    ...defaults,
    apiSlug,
    apiName,
    isDisabled: false,
    sortOrder: 0,
    enabledCapabilities: Object.keys(resolveBuiltinCapabilities(defaults)),
    provider: {
      ...JSON.parse(JSON.stringify(plugin.services[0])),
      apiVersion: "1",
      source: {
        pluginId: plugin.id,
        serviceId: apiType,
        version: "1",
        external: false,
      },
    },
  };
}

/** Runtime projection only: preserve every saved override and the existing scene ID. */
export function withBuiltinProvider(api) {
  if (!api || api.provider) return api;
  if (!builtinPlugins.some((plugin) => plugin.services[0].id === api.apiType))
    return api;
  return {
    ...api,
    provider: createBuiltinInstance(api.apiType, api.apiSlug, api.apiName)
      .provider,
  };
}
