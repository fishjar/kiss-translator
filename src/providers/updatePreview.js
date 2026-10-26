import { mergeSettingFields } from "./instances";
import { copyCompatibleConfig } from "./upgrade";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const delta = (before = [], after = []) => ({
  added: after.filter((value) => !before.includes(value)),
  removed: before.filter((value) => !after.includes(value)),
});
const fieldShape = ({
  type,
  isSecret,
  required,
  min,
  max,
  options,
  optionsSource,
}) => ({
  type,
  secret: isSecret === true || type === "password",
  required: required === true,
  min,
  max,
  options,
  optionsSource,
});
const listChanges = (before = [], after = [], key = "id") => {
  const beforeIds = before.map((item) => item[key]);
  const afterIds = after.map((item) => item[key]);
  return {
    ...delta(beforeIds, afterIds),
    changed: after
      .filter(
        (item) =>
          beforeIds.includes(item[key]) &&
          !same(
            before.find((old) => old[key] === item[key]),
            item
          )
      )
      .map((item) => item[key]),
  };
};

// URLs can contain credentials or signed queries. Only the public location is displayed.
export function packageSourceLabel(source) {
  const raw = source?.repoUrl || source?.url;
  if (!raw) return source?.kind || "?";
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}${/^[a-f0-9]{40}$/.test(source.commitSha || "") ? ` @ ${source.commitSha}` : ""}`;
  } catch {
    return source?.kind || "?";
  }
}

export function previewPackageUpdate(previous, incoming) {
  const source = [
    packageSourceLabel(previous?.source),
    packageSourceLabel(incoming.source),
  ];
  if (!previous?.manifest?.services) return { incomplete: true, source };
  const before = previous.manifest,
    after = incoming.manifest;
  const capabilities = (manifest) =>
    manifest.services.flatMap((service) =>
      Object.keys(service.capabilities || {}).map(
        (name) => `${service.id}/${name}`
      )
    );
  return {
    incomplete: false,
    source,
    network: delta(before.permissions?.network, after.permissions?.network),
    endpoints: delta(
      before.permissions?.endpointFields,
      after.permissions?.endpointFields
    ),
    services: delta(
      before.services.map((service) => service.id),
      after.services.map((service) => service.id)
    ),
    capabilities: delta(capabilities(before), capabilities(after)),
  };
}

export function previewServiceUpdate(api, manifest, service) {
  const before = api.provider;
  const previousFields = before.settings || [];
  const fields = mergeSettingFields(manifest.sharedSettings, service.settings);
  const skipped = copyCompatibleConfig(api, fields).skipped;
  // Removed fields are not copied either, and should be explained before creation.
  for (const field of previousFields)
    if (
      !fields.some((next) => next.key === field.key) &&
      api.pluginConfig?.[field.key] !== undefined
    )
      skipped.push(field.key);
  const secrets = [...previousFields, ...fields]
    .filter((field) => field.isSecret || field.type === "password")
    .flatMap((field) => [api.pluginConfig?.[field.key], field.defaultValue])
    .filter((value) => typeof value === "string" && value);
  const redact = (value) =>
    JSON.stringify(
      value
        ? Object.fromEntries(
            Object.entries(value).map(([key, text]) => [
              key,
              secrets.reduce(
                (text, secret) => text.split(secret).join("[REDACTED]"),
                text
              ),
            ])
          )
        : null,
      null,
      2
    );
  const prompts = [
    ...new Set([
      ...Object.keys(before.defaultPrompts || {}),
      ...Object.keys(service.defaultPrompts || {}),
    ]),
  ]
    .filter(
      (slot) =>
        !same(before.defaultPrompts?.[slot], service.defaultPrompts?.[slot])
    )
    .map((slot) => ({
      slot,
      before: redact(before.defaultPrompts?.[slot]),
      after: redact(service.defaultPrompts?.[slot]),
    }));
  return {
    fields: listChanges(
      previousFields.map((field) => ({
        key: field.key,
        ...fieldShape(field),
      })),
      fields.map((field) => ({ key: field.key, ...fieldShape(field) })),
      "key"
    ),
    fieldDetails: fields
      .filter((field) => {
        const old = previousFields.find((item) => item.key === field.key);
        return !old || !same(fieldShape(old), fieldShape(field));
      })
      .map((field) => {
        const display = (value) =>
          value
            ? {
                type: value.type,
                secret: value.isSecret === true || value.type === "password",
                required: value.required === true,
                min: value.min,
                max: value.max,
              }
            : null;
        return {
          key: field.key,
          before: display(
            previousFields.find((item) => item.key === field.key)
          ),
          after: display(field),
        };
      }),
    models: listChanges(before.models, service.models),
    prompts,
    skipped: [...new Set(skipped)],
  };
}
