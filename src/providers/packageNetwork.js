import { mergeSettingFields } from "./instances";

// Display stored declarations even when the current host cannot run the plugin.
export function packageDefinitions(pack) {
  return pack.manifest.services.map((service) => ({
    provider: {
      id: service.id,
      name: service.name,
      nameI18n: service.nameI18n,
      capabilities: service.capabilities,
      settings: mergeSettingFields(
        pack.manifest.sharedSettings,
        service.settings
      ),
      permissions: pack.manifest.permissions,
    },
  }));
}
export function summarizePackageNetwork(definitions) {
  const origins = new Set();
  const fields = new Map();
  const fieldTranslations = {};
  const services = new Map();
  for (const { provider } of definitions) {
    (provider.permissions?.network || []).forEach((origin) =>
      origins.add(origin)
    );
    for (const key of provider.permissions?.endpointFields || []) {
      const field = provider.settings?.find((item) => item.key === key);
      if (!fields.has(key)) fields.set(key, field?.label || key);
      if (field?.labelI18n)
        fieldTranslations[fields.get(key)] = field.labelI18n;
    }
    if (!services.has(provider.id))
      services.set(provider.id, {
        id: provider.id,
        name: provider.name,
        ...(provider.nameI18n && { nameI18n: provider.nameI18n }),
        capabilities: new Set(),
      });
    Object.keys(provider.capabilities || {}).forEach((name) =>
      services.get(provider.id).capabilities.add(name)
    );
  }
  return {
    origins: [...origins],
    endpointFields: [...new Set(fields.values())],
    ...(Object.keys(fieldTranslations).length && {
      endpointFieldI18n: fieldTranslations,
    }),
    services: [...services.values()].map((service) => ({
      ...service,
      capabilities: [...service.capabilities],
    })),
  };
}
