import {
  createServiceInstance,
  mergeSettingFields,
  validateConfig,
} from "./instances";
import {
  enabledApiCapabilities,
  supportedApiCapabilities,
} from "../config/serviceSelection";

const clone = (value) => JSON.parse(JSON.stringify(value));
const secret = (field) => field.isSecret === true || field.type === "password";

/** Copy only compatible values. Changed enum/range constraints require the new default or user input. */
export function copyCompatibleConfig(api, fields) {
  const values = {};
  const skipped = [];
  for (const field of fields) {
    const previous = api.provider.settings?.find(
      (item) => item.key === field.key
    );
    const value = api.pluginConfig?.[field.key];
    if (!previous || value === undefined) continue;
    if (previous.type !== field.type || secret(previous) !== secret(field)) {
      skipped.push(field.key);
      continue;
    }
    try {
      values[field.key] = validateConfig([field], { [field.key]: value })[
        field.key
      ];
    } catch {
      skipped.push(field.key);
    }
  }
  return { values: clone(values), skipped };
}

export function isServiceUpgradeAvailable(api, pack) {
  const source = api.provider?.source;
  if (
    !pack ||
    pack.manifest.id !== source?.pluginId ||
    !pack.manifest.services.some((service) => service.id === source.serviceId)
  )
    return false;
  const previous = source.version?.split(".").map(Number) || [];
  return (
    (pack.manifest.version
      .split(".")
      .map((value, index) => Number(value) - (previous[index] || 0))
      .find((value) => value !== 0) || 0) > 0
  );
}

/** Refresh the plugin snapshot while retaining the instance identity and host settings. */
export function upgradeServiceInstance(api, pack) {
  if (!isServiceUpgradeAvailable(api, pack))
    throw new Error(
      "No newer installed version is available for this service."
    );
  const serviceId = api.provider.source.serviceId;
  const service = pack.manifest.services.find((item) => item.id === serviceId);
  const copied = copyCompatibleConfig(
    api,
    mergeSettingFields(pack.manifest.sharedSettings, service.settings)
  );
  const next = createServiceInstance(
    pack.manifest,
    serviceId,
    pack.implementations[serviceId],
    copied.values,
    api.apiSlug,
    pack.resources,
    []
  );
  const supported = supportedApiCapabilities(next);
  return {
    ...api,
    provider: next.provider,
    pluginConfig: next.pluginConfig,
    enabledCapabilities: enabledApiCapabilities(api).filter((name) =>
      supported.includes(name)
    ),
  };
}
