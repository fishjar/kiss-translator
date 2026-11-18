import { providerError } from "./capabilities";

export const IMAGE_JSON_CONTRACT = `Return exactly one valid JSON object, without code fences or explanation. The top-level format must be the literal "text" or "markdown". Original content belongs in text. Translated content belongs in translation, an object with text, targetLanguage (the supplied code), and format ("text" or "markdown"). Never put translations in text. Omit unrequested fields: in particular, do not include layout unless the task explicitly requests it. For an explicit layout request only, layout.regions is an array of objects with unique string id, type, nonnegative integer order, poly (real polygon vertices [x,y] in supplied image pixels), and optional corresponding original text and translation strings. Do not invent coordinates or content. Layout regions are not OCR text-line coordinates.`;

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && Boolean(value.trim());
const locale = (value) =>
  String(value || "")
    .replace(/_/g, "-")
    .toLowerCase();
const format = (value) => ["text", "markdown"].includes(value);

export function isSameImageTranslationLanguage(actual, expected) {
  return locale(actual) === locale(expected);
}

export function validImageTranslation(value, targetLanguage) {
  return (
    object(value) &&
    nonempty(value.text) &&
    format(value.format) &&
    nonempty(value.targetLanguage) &&
    (!targetLanguage ||
      isSameImageTranslationLanguage(value.targetLanguage, targetLanguage))
  );
}

/** Validate independent fields without discarding usable original text. */
export function normalizeImageResult(value, input = {}) {
  if (!object(value) || !format(value.format))
    throw providerError("INVALID_RESPONSE", "Invalid image result format.");
  const result = { ...value };
  if (value.items !== undefined && !Array.isArray(value.items))
    throw providerError("INVALID_RESPONSE", "Invalid image OCR items.");
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((item) => typeof item === "string")
    : [];
  if (value.text !== undefined && typeof value.text !== "string")
    throw providerError("INVALID_RESPONSE", "Invalid image original text.");
  if (
    value.translation !== undefined &&
    !validImageTranslation(value.translation, input.targetLanguage)
  ) {
    delete result.translation;
    warnings.push(
      "Invalid or mismatched image translation; original text retained."
    );
  }
  if (value.layout !== undefined) {
    const ids = new Set();
    const size = input.imageSize;
    const valid =
      object(value.layout) &&
      Array.isArray(value.layout.regions) &&
      value.layout.regions.every((region) => {
        if (
          !object(region) ||
          !nonempty(region.id) ||
          ids.has(region.id) ||
          !nonempty(region.type) ||
          !Number.isInteger(region.order) ||
          region.order < 0 ||
          !Array.isArray(region.poly) ||
          region.poly.length < 3 ||
          !region.poly.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every(Number.isFinite) &&
              p[0] >= 0 &&
              p[1] >= 0 &&
              (!size || (p[0] <= size.width && p[1] <= size.height))
          ) ||
          ["text", "translation"].some(
            (key) =>
              region[key] !== undefined && typeof region[key] !== "string"
          )
        )
          return false;
        ids.add(region.id);
        return (
          Math.abs(
            region.poly.reduce((area, [x, y], i) => {
              const [nx, ny] = region.poly[(i + 1) % region.poly.length];
              return area + x * ny - nx * y;
            }, 0)
          ) > 0
        );
      });
    if (!valid) {
      delete result.layout;
      warnings.push("Invalid image layout ignored.");
    } else {
      const regions = [...value.layout.regions]
        .sort((a, b) => a.order - b.order)
        .map((region) => {
          if (value.translation !== undefined && !result.translation) {
            const { translation, ...original } = region;
            return original;
          }
          return region;
        });
      result.layout = { regions };
      if (!nonempty(result.text))
        result.text = regions
          .map((r) => r.text || "")
          .filter(Boolean)
          .join("\n\n");
      if (
        !result.translation &&
        regions.length &&
        input.targetLanguage &&
        regions.every((r) => nonempty(r.translation))
      )
        result.translation = {
          text: regions.map((r) => r.translation).join("\n\n"),
          targetLanguage: input.targetLanguage,
          format: value.format,
        };
    }
  }
  if (
    !nonempty(result.text) &&
    !result.translation &&
    !result.items?.some((item) => nonempty(item.text)) &&
    !result.layout?.regions.some(
      (r) => nonempty(r.text) || nonempty(r.translation)
    )
  )
    throw providerError(
      "INVALID_RESPONSE",
      "Image result contains neither original text nor a valid translation."
    );
  if (warnings.length) result.warnings = [...new Set(warnings)];
  return result;
}

/** Region boundaries stay separate from OCR text polygons. */
export function imageResultItems(result, targetLanguage) {
  const regions = result.layout?.regions || [];
  if (
    regions.length &&
    (!result.translation || regions.every((r) => nonempty(r.translation)))
  )
    return regions
      .filter((r) => r.text !== undefined || r.translation !== undefined)
      .map((r) => ({
        id: r.id,
        ...(!nonempty(r.text) && !nonempty(r.translation)
          ? { error: "No original text is available for fallback translation." }
          : {}),
        text: r.text || "",
        translation: r.translation || "",
        translationFromImage: Boolean(r.translation?.trim()),
        translationLanguage:
          result.translation?.targetLanguage || targetLanguage,
        poly: null,
        regionPoly: r.poly,
        type: r.type,
        order: r.order,
      }));
  if (result.translation)
    return [
      {
        text: result.text || "",
        translation: result.translation.text,
        translationFromImage: true,
        translationLanguage: result.translation.targetLanguage,
        poly: null,
      },
    ];
  return result.items?.length
    ? result.items
    : (result.text || "")
        .split(/\r?\n/)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ text, poly: null }));
}
