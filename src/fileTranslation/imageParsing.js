import { resolveVlmPrompt, resolveVlmPromptDefinition } from "../config/prompt";
import { resolveTerminology } from "../libs/terminologyStorage";
import { imageResultItems } from "../providers/imageResult";

export async function buildImageParseInput({
  api,
  capability,
  setting,
  promptSlug,
  scene,
  mode = "doc",
}) {
  if (capability !== "parseImage") return {};
  const slug = mode === "doc" ? promptSlug || api.vlmPromptSlug || "" : "";
  const definition = resolveVlmPromptDefinition(setting.prompts, slug, api);
  let prompt;
  if (slug) prompt = resolveVlmPrompt(setting.prompts, slug, api);
  else if (
    api.apiType !== "LocalAI" &&
    (!api.provider || api.provider.implementation?.kind === "native")
  )
    prompt =
      mode === "table"
        ? "Extract the table as HTML. Preserve all cell contents and spans. Do not translate or explain."
        : mode === "formula"
          ? "Extract the formula as LaTeX. Do not translate or explain."
          : resolveVlmPrompt(setting.prompts, "");
  return {
    ...(prompt && { prompt }),
    ...(mode === "doc" &&
      scene && {
        protocol: definition?.protocol,
        sourceLanguage: scene.fromLang || "auto",
        targetLanguage: scene.toLang,
        glossary: (await resolveTerminology(scene, api)).glossary,
      }),
  };
}

export function mapImageResult(result, prepared, input) {
  const extended =
    input.protocol === "image-json" || result.translation || result.layout;
  const sx = prepared.original.width / prepared.size.width;
  const sy = prepared.original.height / prepared.size.height;
  const points = (poly) => poly?.map(([x, y]) => [x * sx, y * sy]);
  const items = extended
    ? imageResultItems(result, input.targetLanguage)
    : result.items?.length
      ? result.items
      : (result.text || "")
          .split(/\r?\n/)
          .filter((text) => text.trim())
          .map((text) => ({ text, poly: null }));
  return {
    ...result,
    items: items.map((item) => ({
      ...item,
      poly: points(item.poly) || null,
      regionPoly: points(item.regionPoly),
      format: result.format,
    })),
    ...(result.layout && {
      layout: {
        regions: result.layout.regions.map((r) => ({
          ...r,
          poly: points(r.poly),
        })),
      },
    }),
    imageSize: prepared.original,
  };
}
