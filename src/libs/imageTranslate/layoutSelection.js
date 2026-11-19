// The overlay shares these arrays locally. Keep their source out of request payloads.
export const automaticLayoutRegions = new WeakMap();

export function isStaleAutomaticLayout(regions, recognitionService) {
  const source = automaticLayoutRegions.get(regions);
  return Boolean(
    source &&
      (source.apiSlug !== recognitionService?.apiSlug ||
        source.capability !== recognitionService?.capability)
  );
}
