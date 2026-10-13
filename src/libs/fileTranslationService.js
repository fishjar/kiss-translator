import { apiTranslate } from "../apis";
import {
  availableApiForScene,
  withScenePrompt,
} from "../config/serviceSelection";
import { resolveApiPromptSettings } from "../config/prompt";
import { validateFileService } from "../fileTranslation/resultCache";

// Service selection and credentials stay in the extension. File parsers only
// consume the translate callback and do not import this module in the web build.
export async function executeFileTranslation(
  text,
  scene,
  setting,
  signal,
  localContext = {}
) {
  const api = availableApiForScene(
    scene,
    setting.transApis,
    "translate",
    localContext
  );
  if (!api) throw new Error("没有可用的翻译接口");
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  if (api.provider?.implementation?.kind !== "native" && api.provider)
    await validateFileService(api, "translate", signal);
  let apiSetting = resolveApiPromptSettings(
    withScenePrompt(api, scene),
    setting.prompts,
    setting.subtitleSetting
  );
  const cacheMode = localContext.cacheMode;
  if (cacheMode) apiSetting = { ...apiSetting,
    ...(api.apiType === "LocalAI" && { cacheMode }) };
  const result = await apiTranslate({
    text,
    fromLang: scene.fromLang,
    toLang: scene.toLang,
    apiSetting,
    textFormat: "text",
    signal,
    translateVariants: setting.translateVariants,
    docInfo: {},
    ...(cacheMode && { cacheMode }),
  });
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  if (api.provider?.implementation?.kind !== "native" && api.provider)
    await validateFileService(api, "translate", signal);
  if (!result?.trText) throw new Error(`${api.apiName || api.apiSlug} 返回空结果`);
  return { text: result.trText, serviceId: api.apiSlug };
}

export async function translateFileText(...args) {
  return (await executeFileTranslation(...args)).text;
}
