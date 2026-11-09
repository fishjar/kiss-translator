/** Sync only menu/model metadata. Executable files and credentials stay out of the index. */
export function packageServiceCatalog(manifest) {
  return manifest.services.map(
    ({ id, name, nameI18n, capabilities, modelField, models }) => ({
      id,
      name,
      ...(nameI18n && { nameI18n: { ...nameI18n } }),
      capabilities: JSON.parse(JSON.stringify(capabilities)),
      ...(modelField && { modelField }),
      ...(models && {
        modelField: modelField || "model",
        models: JSON.parse(JSON.stringify(models)),
      }),
    })
  );
}
