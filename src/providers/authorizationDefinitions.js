import { createServiceInstance } from "./instances";
import { providerPluginId } from "./grants";

export function packageDefinitions(pack) {
  return pack.manifest.services.map((service) =>
    createServiceInstance(
      pack.manifest,
      service.id,
      pack.implementations[service.id],
      {},
      "authorization-preview",
      pack.resources
    )
  );
}
export function summarizeAuthorization(definitions) {
  const origins = new Set();
  const fields = new Map();
  const fieldTranslations = {};
  const services = new Map();
  const versions = new Set();
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
    if (provider.source?.version) versions.add(provider.source.version);
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
    versions: [...versions],
  };
}
export function authorizationGroups(packages, instances) {
  const groups = new Map();
  const add = (instance, installedName) => {
    const id = providerPluginId(instance);
    const source = instance.provider.source;
    if (!groups.has(id))
      groups.set(id, {
        id,
        name: installedName || source.pluginName || id,
        ...(source.pluginNameI18n && { nameI18n: source.pluginNameI18n }),
        definitions: [],
        instanceCount: 0,
      });
    groups.get(id).definitions.push(instance);
    return groups.get(id);
  };
  for (const pack of packages)
    for (const instance of packageDefinitions(pack))
      add(instance, pack.manifest.name);
  for (const instance of instances) {
    if (instance.provider && instance.provider.implementation.kind !== "native")
      add(instance).instanceCount++;
  }
  return [...groups.values()].map(({ definitions, ...group }) => ({
    ...group,
    ...summarizeAuthorization(definitions),
  }));
}
