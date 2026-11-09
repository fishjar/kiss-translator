/**
 * @file pipelineCore.js
 * @description 图片翻译核心流水线：整合布局分析 (analyzeLayout)、文字识别 (OCR/VLM) 与文本翻译。
 */

import { browser } from "../libs/browser";
import { startLogTask } from "../libs/diagnostics/task";
import { logger } from "../libs/log";
import { createAssetStore } from "../providers/transport";
import { cachedFileResult } from "./resultCache";
import { normalizeSettings } from "../localAi/core/settings";
import {
  supportedApiFeature,
  supportsApiCapability,
  isApiConfigured,
} from "../config/serviceSelection";
import { hasCompleteCoordinates } from "./recognition";
import { invokeBackgroundPlugin } from "../providers/backgroundInvocation";
import { createNativeRegistry } from "../builtin-plugins/runtime";
import { fileError } from "./protocol";
import { prepareImage } from "../localAi/core/inputLimits";
import { executeFileTranslation } from "../libs/fileTranslationService";
import { resolveVlmPrompt } from "../config/prompt";
import { getSettingWithDefault } from "../libs/storage";

async function cropRegionBlob(sourceBlob, [left, top, right, bottom]) {
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const w = Math.max(1, Math.ceil(right - left));
    const h = Math.max(1, Math.ceil(bottom - top));
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, left, top, w, h, 0, 0, w, h);
      return await canvas.convertToBlob({ type: "image/png" });
    }
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, left, top, w, h, 0, 0, w, h);
      return await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("图片区域裁剪失败"))),
          "image/png"
        )
      );
    }
    throw new Error("当前环境不支持 Canvas 裁剪");
  } finally {
    bitmap.close?.();
  }
}

export async function getInputPolicy() {
  try {
    const stored = await browser.storage.local.get("kiss-ai-settings");
    return normalizeSettings(stored?.["kiss-ai-settings"]);
  } catch {
    return normalizeSettings();
  }
}

/**
 * 调用底层图像类服务提供者 (analyzeLayout / recognizeText / parseImage)
 */
export async function invokeImageProvider(
  api,
  capability,
  prepared,
  signal,
  extra = {}
) {
  const assets = createAssetStore();
  try {
    const { cacheMode, onProgress, requireCoordinates, ...extraInput } = extra;
    const input = {
      ...extraInput,
      ...(api.apiType === "LocalAI" && cacheMode && { cacheMode }),
      image: assets.put(prepared.blob),
      imageSize: prepared.size,
    };
    return await cachedFileResult({
      api,
      capability,
      policy: await getInputPolicy(),
      cacheMode,
      signal,
      onProgress,
      validate: (result) => {
        if (capability === "analyzeLayout") return;
        if (
          !result.text?.trim() &&
          !result.items?.some((item) => item.text?.trim())
        )
          throw fileError("INVALID_RESPONSE", "识别返回空结果");
        if (
          (requireCoordinates ??
            supportedApiFeature(api, capability)?.coordinates) &&
          !hasCompleteCoordinates(result.items || [])
        )
          throw fileError(
            "INVALID_RESPONSE",
            "识别服务未返回完整有效的文字坐标"
          );
      },
      input: { ...extraInput, image: prepared.blob, imageSize: prepared.size },
      run: async () => {
        const call =
          api.provider && api.provider.implementation?.kind !== "native"
            ? invokeBackgroundPlugin(api, capability, input, { signal, assets })
            : createNativeRegistry(() => api, { assets }).invoke(
                api.apiSlug,
                capability,
                input,
                { signal }
              );
        const events = (async () => {
          const iterator = call.events[Symbol.asyncIterator]();
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            const status = next.value.message;
            if (status === "CACHE_HIT" || status === "INFERENCE_START")
              onProgress?.({
                type: status === "CACHE_HIT" ? "cache-hit" : "inference",
              });
          }
        })();
        events.catch(() => {});
        try {
          const result = await call.result;
          await events;
          return result;
        } finally {
          call.cancel();
        }
      },
    });
  } finally {
    assets.clear();
  }
}

/**
 * 执行图像文字识别（可选结合布局分析）
 */
export async function executeImageRecognition({
  imageBlob,
  recognitionService,
  layoutApiSlug,
  vlmPromptSlug,
  selectedRegions = null,
  signal,
  onProgress,
  setting: customSetting,
}) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  if (!imageBlob || !(imageBlob instanceof Blob)) {
    throw new Error("无效的图片数据");
  }

  const setting = customSetting || (await getSettingWithDefault());
  const apis = setting.transApis || [];

  if (!recognitionService?.apiSlug || !recognitionService?.capability) {
    throw new Error("未配置文本识别服务");
  }

  const recApi = apis.find((a) => a.apiSlug === recognitionService.apiSlug);
  if (!recApi || recApi.isDisabled) {
    throw new Error("所选文本识别服务不存在或已禁用");
  }

  const policy = await getInputPolicy();
  const prepared = await prepareImage(imageBlob, policy, signal);

  const sx = prepared.original.width / prepared.size.width;
  const sy = prepared.original.height / prepared.size.height;
  let layoutResult = Array.isArray(selectedRegions)
    ? {
        imageSize: prepared.size,
        regions: selectedRegions
          .filter((r) => r.enabled !== false)
          .map((r) => ({
            ...r,
            polygon: (r.polygon || r.poly || []).map(([x, y]) => [
              x / sx,
              y / sy,
            ]),
            bbox: r.bbox?.map((v, i) => v / (i % 2 === 0 ? sx : sy)),
          })),
      }
    : null;
  // 1. 若配置了布局服务，先分析版面
  if (layoutApiSlug && !layoutResult) {
    const layoutApi = apis.find((a) => a.apiSlug === layoutApiSlug);
    if (
      layoutApi &&
      !layoutApi.isDisabled &&
      supportsApiCapability(layoutApi, "analyzeLayout")
    ) {
      onProgress?.({ stage: "layout", message: "image_stage_layout" });
      try {
        const rawLayout = await invokeImageProvider(
          layoutApi,
          "analyzeLayout",
          prepared,
          signal,
          { onProgress }
        );
        if (rawLayout?.regions?.length) {
          layoutResult = {
            imageSize: prepared.size,
            regions: rawLayout.regions.map((region) => ({
              type: region.type,
              order: region.order,
              polygon: region.poly || region.polygon || [],
              bbox: (region.poly || region.polygon || []).reduce(
                ([left, top, right, bottom], [x, y]) => [
                  Math.min(left, x),
                  Math.min(top, y),
                  Math.max(right, x),
                  Math.max(bottom, y),
                ],
                [Infinity, Infinity, -Infinity, -Infinity]
              ),
            })),
          };
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new Error(`版面布局分析失败: ${err?.message || err}`);
      }
    }
  }

  // 2. 文字识别 (OCR 或 VLM)
  const capability = recognitionService.capability;
  let prompt;
  if (capability === "parseImage") {
    const slug = vlmPromptSlug || recApi.vlmPromptSlug || "";
    if (slug) prompt = resolveVlmPrompt(setting.prompts, slug, recApi);
    else if (
      recApi.apiType !== "LocalAI" &&
      (!recApi.provider || recApi.provider.implementation?.kind === "native")
    )
      prompt = resolveVlmPrompt(setting.prompts, "");
  }

  // 空选区表示用户不识别任何区域，不应退回整图识别。
  const noSelection =
    Array.isArray(selectedRegions) &&
    !selectedRegions.some((region) => region.enabled !== false);
  if (layoutResult) {
    layoutResult.regions = layoutResult.regions.flatMap((region) => {
      const bounds = region.bbox;
      if (!bounds || bounds.length !== 4 || !bounds.every(Number.isFinite))
        return [];
      const bbox = [
        Math.max(0, bounds[0]),
        Math.max(0, bounds[1]),
        Math.min(prepared.size.width, bounds[2]),
        Math.min(prepared.size.height, bounds[3]),
      ];
      if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) return [];
      const [left, top, right, bottom] = bbox;
      return [
        {
          ...region,
          bbox,
          polygon:
            region.polygon?.length >= 3
              ? region.polygon
              : [
                  [left, top],
                  [right, top],
                  [right, bottom],
                  [left, bottom],
                ],
        },
      ];
    });
  }

  let recognized;
  let rawItems = [];
  const recognitionErrors = [];
  const sourceLayout = layoutResult?.regions.length
    ? {
        imageSize: prepared.original,
        regions: layoutResult.regions.map((r) => ({
          ...r,
          polygon: r.polygon.map(([x, y]) => [x * sx, y * sy]),
          bbox: r.bbox?.map((v, i) => v * (i % 2 === 0 ? sx : sy)),
        })),
      }
    : null;
  const progressLayout = Array.isArray(selectedRegions)
    ? { imageSize: prepared.original, regions: selectedRegions }
    : sourceLayout;
  const totalRegions = noSelection ? 0 : layoutResult?.regions.length || 1;
  const reportRecognition = (current) =>
    onProgress?.({
      stage: "recognize",
      message: "image_stage_recognize",
      current,
      total: totalRegions,
      items: rawItems.map((item) => ({
        ...item,
        original: item.text,
        translation: "",
      })),
      recognitionErrors: [...recognitionErrors],
      ...(current === 0 && progressLayout ? { layout: progressLayout } : {}),
    });
  reportRecognition(0);

  // 所有识别服务均按选中的布局区域依次裁剪识别。
  if (noSelection || layoutResult?.regions.length) {
    let firstRegionError;
    let completedRegions = 0;
    for (const region of layoutResult.regions) {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      const [left, top, right, bottom] = region.bbox;
      try {
        const cropBlob = await cropRegionBlob(prepared.blob, [
          left,
          top,
          right,
          bottom,
        ]);
        const cropPrepared = await prepareImage(cropBlob, policy, signal);
        const cropResult = await invokeImageProvider(
          recApi,
          capability,
          cropPrepared,
          signal,
          {
            prompt,
            onProgress,
            requireCoordinates: false,
          }
        );
        if (signal?.aborted) throw new DOMException("已取消", "AbortError");
        const cropText =
          cropResult.text?.trim() ||
          (cropResult.items || [])
            .map((item) => item.text?.trim())
            .filter(Boolean)
            .join("\n");
        if (cropText) {
          rawItems.push({
            text: cropText,
            poly: region.polygon.map(([x, y]) => [x * sx, y * sy]),
            type: region.type,
            order: region.order,
          });
        }
      } catch (cropErr) {
        if (signal?.aborted) throw cropErr;
        firstRegionError ||= cropErr;
        recognitionErrors.push({
          order: region.order ?? completedRegions,
          error: cropErr?.message || String(cropErr),
        });
        logger
          .child("image-translate")
          .warn("region.recognition.failed", cropErr);
      }
      reportRecognition(++completedRegions);
    }
    if (!rawItems.length && firstRegionError) throw firstRegionError;
    recognized = {
      text: rawItems.map((i) => i.text).join("\n\n"),
      items: rawItems,
    };
  } else {
    recognized = await invokeImageProvider(
      recApi,
      capability,
      prepared,
      signal,
      {
        prompt,
        onProgress,
      }
    );

    rawItems = (
      recognized.items?.length
        ? recognized.items
        : (recognized.text || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((text) => ({ text, poly: null }))
    ).map((item) => ({
      ...item,
      poly: item.poly?.map(([x, y]) => [x * sx, y * sy]) || null,
    }));
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    reportRecognition(1);
  }

  // 3. 将布局和识别结果映射回原图坐标
  const finalResult = {
    ...recognized,
    items: rawItems,
    text: recognized.text || rawItems.map((i) => i.text).join("\n\n"),
    imageSize: prepared.original,
  };

  const effectiveLayout =
    sourceLayout ||
    (rawItems.some((i) => i.poly?.length >= 3)
      ? {
          regions: rawItems
            .filter((i) => i.poly?.length >= 3)
            .map((item, idx) => ({
              order: idx,
              type: "text",
              polygon: item.poly,
              bbox: item.poly.reduce(
                ([l, t, r, b], [x, y]) => [
                  Math.min(l, x),
                  Math.min(t, y),
                  Math.max(r, x),
                  Math.max(b, y),
                ],
                [Infinity, Infinity, -Infinity, -Infinity]
              ),
            })),
        }
      : null);

  return {
    text: finalResult.text || "",
    recognitionErrors,
    items: (finalResult.items || []).filter((item) => item.text?.trim()),
    imageSize: prepared.original,
    layout: Array.isArray(selectedRegions)
      ? { imageSize: prepared.original, regions: selectedRegions }
      : effectiveLayout,
  };
}

/**
 * 执行段落文本翻译
 */
export async function executeItemsTranslation({
  items = [],
  scene,
  setting: customSetting,
  signal,
  onProgress,
}) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  const setting = customSetting || (await getSettingWithDefault());

  onProgress?.({
    stage: "translate",
    message: "image_stage_translate",
    current: 0,
    total: items.length,
  });

  const translatedItems = [];
  let completed = 0;

  for (const item of items) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const sourceText = item.text || item.original || "";
    if (!sourceText.trim()) {
      translatedItems.push({
        ...item,
        original: sourceText,
        translation: "",
      });
      continue;
    }

    try {
      const { text: trText } = await executeFileTranslation(
        sourceText,
        scene,
        setting,
        signal,
        {
          onTerminologyWarning: (missingTableIds) =>
            onProgress?.({
              stage: "translate",
              message: "terminology_missing_help",
              missingTableIds,
            }),
        }
      );
      completed++;
      onProgress?.({
        stage: "translate",
        message: "image_stage_translate",
        current: completed,
        total: items.length,
      });
      translatedItems.push({
        ...item,
        original: sourceText,
        translation: trText || "",
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      translatedItems.push({
        ...item,
        original: sourceText,
        translation: "",
        error: err.message,
      });
    }
  }

  return translatedItems;
}

/**
 * 单独执行版面布局分析
 */
export async function executeImageLayout({
  imageBlob,
  layoutApiSlug,
  signal,
  onProgress,
  setting: customSetting,
}) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  if (!imageBlob || !(imageBlob instanceof Blob)) {
    throw new Error("无效的图片数据");
  }

  const setting = customSetting || (await getSettingWithDefault());
  const apis = setting.transApis || [];
  const layoutApi = apis.find(
    (a) =>
      !a.isDisabled &&
      isApiConfigured(a) &&
      supportsApiCapability(a, "analyzeLayout") &&
      (layoutApiSlug ? a.apiSlug === layoutApiSlug : true)
  );

  if (!layoutApi) {
    throw new Error("未配置或未找到可用的界面分析服务");
  }

  const policy = await getInputPolicy();
  const prepared = await prepareImage(imageBlob, policy, signal);

  onProgress?.({ stage: "layout", message: "image_stage_layout" });
  const rawLayout = await invokeImageProvider(
    layoutApi,
    "analyzeLayout",
    prepared,
    signal,
    { onProgress }
  );

  const sx = prepared.original.width / prepared.size.width;
  const sy = prepared.original.height / prepared.size.height;

  const regions = (rawLayout?.regions || []).map((region, index) => {
    const poly = region.poly || region.polygon || [];
    const scaledPoly = poly.map(([x, y]) => [x * sx, y * sy]);
    const bbox = scaledPoly.length
      ? scaledPoly.reduce(
          ([left, top, right, bottom], [x, y]) => [
            Math.min(left, x),
            Math.min(top, y),
            Math.max(right, x),
            Math.max(bottom, y),
          ],
          [Infinity, Infinity, -Infinity, -Infinity]
        )
      : [0, 0, 0, 0];

    return {
      type: region.type || "text",
      order: region.order ?? index,
      polygon: scaledPoly,
      bbox,
      enabled: true,
    };
  });

  return {
    imageSize: prepared.original,
    regions,
  };
}

/**
 * 完整图片翻译流水线调度入口
 */
export async function executeImagePipeline(options) {
  const task = startLogTask("image-translate", {
    ...(options.taskId && { taskId: options.taskId }),
  });
  try {
    const result = await executeImagePipelineInternal({
      ...options,
      onProgress: (progress) => {
        if (progress.stage) task.stage(progress.stage);
        options.onProgress?.(progress);
      },
    });
    task.finish(undefined, { count: result.items?.length });
    return result;
  } catch (error) {
    task.finish(error);
    throw error;
  }
}

async function executeImagePipelineInternal({
  imageBlob,
  scene,
  setting: customSetting,
  signal,
  onProgress,
  action = "all",
  items: existingItems = [],
  selectedRegions = null,
}) {
  const setting = customSetting || (await getSettingWithDefault());

  // 1. 仅分析版面布局
  if (action === "layout") {
    const layout = await executeImageLayout({
      imageBlob,
      layoutApiSlug: scene?.layoutApiSlug,
      signal,
      onProgress,
      setting,
    });
    return { layout };
  }

  // 2. 仅翻译已有文本
  if (action === "translate") {
    const translatedItems = await executeItemsTranslation({
      items: existingItems,
      scene,
      setting,
      signal,
      onProgress,
    });
    return {
      items: translatedItems,
      originalText: translatedItems.map((i) => i.original).join("\n\n"),
      translatedText: translatedItems.map((i) => i.translation).join("\n\n"),
    };
  }

  // 3. 执行识别（action 为 "recognize" 或 "all"）
  const recognized = await executeImageRecognition({
    imageBlob,
    recognitionService: scene.recognitionService,
    layoutApiSlug: action === "recognize" ? null : scene.layoutApiSlug,
    vlmPromptSlug: scene.vlmPromptSlug,
    selectedRegions,
    signal,
    onProgress,
    setting,
  });

  const rawItems = recognized.items || [];

  const baseItems = rawItems.map((item) => ({
    ...item,
    original: item.text,
    translation: "",
  }));
  const originalText = baseItems.map((item) => item.original).join("\n\n");

  if (action === "recognize" || !baseItems.length) {
    return {
      items: baseItems,
      originalText,
      translatedText: "",
      recognitionErrors: recognized.recognitionErrors,
      layout: recognized.layout,
    };
  }

  // 识别完成，先推送识别出的原文项供前端即时呈现
  onProgress?.({
    stage: "recognize_done",
    message: "image_stage_recognize_done",
    items: baseItems,
    layout: recognized.layout,
  });

  // 4. 识别后继续翻译
  const translatedItems = await executeItemsTranslation({
    items: baseItems,
    scene,
    setting,
    signal,
    onProgress,
  });

  return {
    items: translatedItems,
    originalText,
    translatedText: translatedItems.map((i) => i.translation).join("\n\n"),
    layout: recognized.layout,
    recognitionErrors: recognized.recognitionErrors,
    hasError:
      Boolean(recognized.recognitionErrors?.length) ||
      translatedItems.some((i) => Boolean(i.error)),
  };
}
