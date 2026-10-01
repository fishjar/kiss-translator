import { apiTranslate } from "../apis";
import {
  availableApisForScene,
  withScenePrompt,
} from "../config/serviceSelection";
import { resolveApiPromptSettings } from "../config/prompt";

// Service selection and credentials stay in the extension. File parsers only
// consume the translate callback and do not import this module in the web build.
export async function executeFileTranslation(
  text,
  scene,
  setting,
  signal,
  localContext = {}
) {
  const candidates = availableApisForScene(
    scene,
    setting.transApis,
    "translation",
    localContext
  );
  if (!candidates.length) throw new Error("没有可用的翻译接口");
  let lastError;
  for (const candidate of candidates) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    try {
      const apiSetting = resolveApiPromptSettings(
        withScenePrompt(candidate, scene),
        setting.prompts,
        setting.subtitleSetting
      );
      const result = await apiTranslate({
        text,
        fromLang: scene.fromLang,
        toLang: scene.toLang,
        apiSetting,
        textFormat: "text",
        signal,
        translateVariants: setting.translateVariants,
        docInfo: {},
      });
      const translated = result?.trText;
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      if (translated) return { text: translated, serviceId: candidate.apiSlug };
      lastError = new Error(
        `${candidate.apiName || candidate.apiSlug} 返回空结果`
      );
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      lastError = error;
    }
  }
  throw lastError || new Error("全部翻译接口均不可用");
}

export async function translateFileText(...args) {
  return (await executeFileTranslation(...args)).text;
}
