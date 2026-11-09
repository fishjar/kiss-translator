import {
  supportedApiFeature,
  supportsApiCapability,
} from "../config/serviceSelection";

export const RECOGNITION_CAPABILITIES = ["recognizeText", "parseImage"];

export function recognitionFeature(api, capability) {
  if (!api || api.isDisabled || !RECOGNITION_CAPABILITIES.includes(capability))
    return undefined;
  if (api.recognitionFeatures) return api.recognitionFeatures[capability];
  return supportsApiCapability(api, capability)
    ? supportedApiFeature(api, capability)
    : undefined;
}

export function recognitionOptions(
  services,
  selection,
  i18n,
  preferVlm = false
) {
  const options = [
    { value: "", label: i18n("recognition_service_select", "请选择识别服务") },
  ];
  const capabilities = preferVlm
    ? [...RECOGNITION_CAPABILITIES].reverse()
    : RECOGNITION_CAPABILITIES;
  for (const capability of capabilities) {
    const entries = services.filter((api) =>
      recognitionFeature(api, capability)
    );
    if (!entries.length) continue;
    options.push({ groupLabel: capability === "parseImage" ? "VLM" : "OCR" });
    for (const api of entries) {
      const feature = recognitionFeature(api, capability);
      options.push({
        value: JSON.stringify({ apiSlug: api.apiSlug, capability }),
        label: `${api.apiName || api.apiSlug} · ${
          feature.coordinates
            ? i18n("recognition_with_coordinates", "带文字坐标")
            : i18n("recognition_text_only", "仅文本输出")
        }${
          feature.available === false
            ? ` (${i18n("api_unavailable_here", "当前不可用")})`
            : ""
        }`,
      });
    }
  }
  const selected = selection ? JSON.stringify(selection) : "";
  if (selected && !options.some((option) => option.value === selected))
    options.push({
      value: selected,
      label: `${selection.apiSlug} (${i18n("api_unavailable_here", "当前不可用")})`,
    });
  return options;
}

export function hasCompleteCoordinates(items, textField = "text") {
  const nonempty = items.filter((item) => item[textField]?.trim());
  return (
    nonempty.length > 0 &&
    nonempty.every((item) => {
      const poly = item.poly;
      if (
        !Array.isArray(poly) ||
        poly.length < 3 ||
        !poly.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            point.every(Number.isFinite)
        )
      )
        return false;
      const area = poly.reduce((sum, [x, y], index) => {
        const [nx, ny] = poly[(index + 1) % poly.length];
        return sum + x * ny - nx * y;
      }, 0);
      return Math.abs(area) > 0;
    })
  );
}
