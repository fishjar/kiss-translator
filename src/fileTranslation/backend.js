import {
  readTableDirectory,
  resolveTerminology,
  loadTerminologySnapshot,
} from "../libs/terminologyStorage";
import { sha256 } from "../libs/utils";
import { startLogTask } from "../libs/diagnostics/task";
import {
  enabledApiCapabilities,
  supportedApiFeature,
  projectApiCapabilities,
} from "../config/serviceSelection";
import browser from "webextension-polyfill";
import { DEFAULT_FILE_TRANSLATE_SETTING } from "../config/setting";
import { STOKEY_SETTING } from "../config/storage";
import { resolveIconColorHex } from "../styles/m3";
import {
  getAllPrompts,
  resolveVlmPrompt,
  resolveApiPromptSettings,
} from "../config/prompt";
import { providerCacheSignature } from "../providers/cache";
import { prepareImage } from "../localAi/core/inputLimits";
import {
  getSettingWithDefault,
  normalizeStoredSetting,
  saveEdit,
} from "../libs/storage";
import { executeFileTranslation } from "../libs/fileTranslationService";
import { isApiAvailableFor } from "../config/serviceSelection";
import { ALL_OCR_MODELS } from "../localAi/fileOperations";
import { runtimeHost } from "../localAi/runtime/runtimeHostAdapter";
import { cachedFileResult } from "./resultCache";
import { normalizeSettings } from "../localAi/core/settings";
import { CATALOG, DOC_MODEL_ID } from "../localAi/core/catalog";
import { hasCompleteCoordinates } from "./recognition";
import { createNativeRegistry } from "../builtin-plugins/runtime";
import { createAssetStore } from "../providers/transport";
import { invokeBackgroundPlugin } from "../providers/backgroundInvocation";
import {
  FILE_CHANNEL,
  FILE_PROTOCOL,
  IMAGE_CHUNK_BYTES,
  fileError,
  isFileBridgePage,
  serializeFileError,
} from "./protocol";

const SCENES = Object.keys(DEFAULT_FILE_TRANSLATE_SETTING);
const EXTRA_FIELDS = [
  "apiSlug",
  "layoutApiSlug",
  "terms",
  "aiTerms",
  "termsList",
];
const API_FIELDS = [
  "apiSlug",
  "apiName",
  "apiType",
  "sourceType",
  "enabledCapabilities",
  "isDisabled",
  "modelRef",
  "device",
  "vlmPromptSlug",
];
const pick = (value, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]])
  );

export function validateScenePatch(kind, patch) {
  if (
    !SCENES.includes(kind) ||
    !patch ||
    Array.isArray(patch) ||
    typeof patch !== "object"
  )
    throw fileError("INVALID_INPUT", "文件类型或设置补丁无效");
  const defaults = DEFAULT_FILE_TRANSLATE_SETTING[kind];
  for (const [key, value] of Object.entries(patch)) {
    if (
      ![
        ...Object.keys(defaults),
        ...EXTRA_FIELDS,
        "terms",
        "aiTerms",
        "termsList",
      ].includes(key)
    )
      throw fileError("INVALID_INPUT", `不能修改设置字段 ${key}`);
    if (key === "termsList") {
      if (
        !Array.isArray(value) ||
        value.some((id) => typeof id !== "string" || !id)
      )
        throw fileError("INVALID_INPUT", "Invalid terminology references");
    } else if (key === "terms" || key === "aiTerms") {
      if (typeof value !== "string")
        throw fileError("INVALID_INPUT", "Invalid inline terminology");
    } else if (key === "recognitionService") {
      if (
        value !== null &&
        (!value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.keys(value).some(
            (field) => !["apiSlug", "capability"].includes(field)
          ) ||
          typeof value.apiSlug !== "string" ||
          !value.apiSlug ||
          value.apiSlug.length > 200 ||
          !["recognizeText", "parseImage"].includes(value.capability))
      )
        throw fileError("INVALID_INPUT", "识别服务选择无效");
    } else if (key === "readerPreferences") {
      if (
        !value ||
        Array.isArray(value) ||
        typeof value !== "object" ||
        Object.keys(value).some(
          (field) =>
            !["pageWidth", "fontSize", "fontFamily", "themeId"].includes(field)
        ) ||
        (value.pageWidth !== undefined &&
          (!Number.isFinite(value.pageWidth) ||
            value.pageWidth < 560 ||
            value.pageWidth > 1400)) ||
        (value.fontSize !== undefined &&
          (!Number.isFinite(value.fontSize) ||
            value.fontSize < 8 ||
            value.fontSize > 72)) ||
        ["fontFamily", "themeId"].some(
          (field) =>
            value[field] !== undefined &&
            (typeof value[field] !== "string" || value[field].length > 200)
        )
      )
        throw fileError("INVALID_INPUT", "阅读设置无效");
    } else if (typeof value !== "string" || value.length > 200)
      throw fileError("INVALID_INPUT", `设置字段 ${key} 无效`);
  }
  return patch;
}

async function modelRecords(setting, signal) {
  const result = await runtimeHost.request(
    { id: crypto.randomUUID(), service: "model", method: "init", payload: {} },
    { signal }
  );
  return result.records || [];
}

async function inputSettings() {
  const stored = await browser.storage.local.get("kiss-ai-settings");
  return normalizeSettings(stored["kiss-ai-settings"]);
}

// Both image scenes use the same bounded broker path. Keeping it static avoids
// Webpack's document-based lazy chunk loader in the MV3 background worker.
async function invokeImageProvider(
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
      policy: await inputSettings(),
      cacheMode,
      signal,
      onProgress,
      validate: (result) => {
        if (capability === "analyzeLayout") return;
        if (!result.text?.trim())
          throw fileError("INVALID_RESPONSE", "识别返回空结果");
        if (
          (requireCoordinates ||
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

export async function getFileContext(signal) {
  const setting = await getSettingWithDefault();
  const promptSignature = await sha256(
    JSON.stringify(getAllPrompts(setting.prompts))
  );
  const translationSignatures = new Map(
    await Promise.all(
      setting.transApis.map(async (api) => [
        api.apiSlug,
        await providerCacheSignature(
          resolveApiPromptSettings(
            api,
            setting.prompts,
            setting.subtitleSetting
          ),
          "translate",
          { promptSignature }
        ),
      ])
    )
  );
  let records = [],
    modelError = "";
  try {
    records = await modelRecords(setting, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    modelError = error.message;
  }
  const limits = await inputSettings();
  const installed = new Set(
    records
      .filter((record) => record.state === "installed")
      .map((record) => record.manifest.id)
  );
  return {
    uiLang: setting.uiLang,
    // 扩展→页面 iconColor 预接线（PR #17 评审闭环）：权威设置值经归一
    // 后随既有 getContext 通道搭载，与 uiLang 同形；旧值/非法值已由
    // resolveIconColorHex 回落默认档，页面侧无需二次清洗。
    iconColor: resolveIconColorHex(setting.iconColor),
    terminologyDirectory: await readTableDirectory(),
    terminologySignatures: Object.fromEntries(
      await Promise.all(
        SCENES.map(async (kind) => {
          const scene = setting.fileTranslateSetting[kind] || {};
          const api =
            setting.transApis.find((api) => api.apiSlug === scene.apiSlug) ||
            {};
          return [
            kind,
            await sha256((await resolveTerminology(scene, api)).signature),
          ];
        })
      )
    ),
    scenes: Object.fromEntries(
      SCENES.map((kind) => {
        const scene = pick(setting.fileTranslateSetting[kind] || {}, [
          ...Object.keys(DEFAULT_FILE_TRANSLATE_SETTING[kind]),
          ...EXTRA_FIELDS,
        ]);
        if (scene.readerPreferences)
          scene.readerPreferences = pick(scene.readerPreferences, [
            "pageWidth",
            "fontSize",
            "fontFamily",
            "themeId",
          ]);
        return [kind, scene];
      })
    ),
    services: await Promise.all(
      setting.transApis.map(async (api) => ({
        ...pick(api, API_FIELDS),
        translationSignature: translationSignatures.get(api.apiSlug),
        provider: {
          apiVersion: 1,
          ...(api.provider?.defaultPrompts && {
            id: api.provider.id,
            source:
              api.provider.source &&
              pick(api.provider.source, ["pluginId", "serviceId"]),
            defaultPrompts: Object.fromEntries(
              Object.entries(api.provider.defaultPrompts).map(
                ([slot, prompts]) => [
                  slot,
                  prompts.map((prompt) =>
                    pick(prompt, [
                      "id",
                      "name",
                      "nameI18n",
                      "description",
                      "descriptionI18n",
                      "protocol",
                    ])
                  ),
                ]
              )
            ),
          }),
          implementation: {
            kind: projectApiCapabilities(api).provider?.implementation?.kind,
          },
          capabilities: Object.fromEntries(
            enabledApiCapabilities(api).map((cap) => [
              cap,
              supportedApiFeature(api, cap),
            ])
          ),
        },
        translationAvailable: isApiAvailableFor(api, "translate", {
          installedModels: installed,
        }),
        layoutAvailable: isApiAvailableFor(api, "analyzeLayout", {
          installedModels: installed,
        }),
        enabledCapabilities: enabledApiCapabilities(api),
        recognitionFeatures: Object.fromEntries(
          ["recognizeText", "parseImage"]
            .filter((cap) => enabledApiCapabilities(api).includes(cap))
            .map((cap) => [
              cap,
              {
                coordinates:
                  supportedApiFeature(api, cap)?.coordinates === true,
                taskModes: supportedApiFeature(api, cap)?.taskModes || ["doc"],
                available: isApiAvailableFor(api, cap, {
                  installedModels: installed,
                }),
              },
            ])
        ),
        recognitionSignature: await sha256(
          JSON.stringify([
            api.apiType,
            api.modelRef,
            api.device,
            api.model,
            api.provider?.source?.version,
            api.provider?.capabilities,
            api.provider?.defaultPrompts,
            api.vlmPromptSlug,
            api.maxTokens,
            api.temperature,
            promptSignature,
            Object.fromEntries(
              (api.provider?.settings || [])
                .filter((field) => field.type !== "password" && !field.isSecret)
                .map((field) => [field.key, api.pluginConfig?.[field.key]])
            ),
          ])
        ),
      }))
    ),
    prompts: getAllPrompts(setting.prompts).map((prompt) =>
      pick(prompt, ["slug", "name", "nameKey", "category"])
    ),
    styles: (setting.customStyles || []).map((style) =>
      pick(style, ["styleSlug", "styleName", "styleCode"])
    ),
    models: records.map((record) => ({
      id: record.manifest.id,
      name: record.manifest.name,
      state: record.state,
      task: record.manifest.task,
      backend: record.manifest.backend,
    })),
    ocrModels: ALL_OCR_MODELS,
    modelError,
    limits: {
      maxImageFileMB: limits.maxImageFileMB,
      imageChunkBytes: IMAGE_CHUNK_BYTES,
    },
  };
}

export async function executeFileMethod(
  method,
  params,
  signal,
  uploads = new Map(),
  onProgress
) {
  if (method === "analyzeLayout") {
    if (method === "analyzeLayout" && params.serviceId) {
      const api = (await getSettingWithDefault()).transApis.find(
        (item) => item.apiSlug === params.serviceId
      );
      if (!isApiAvailableFor(api, "analyzeLayout"))
        throw fileError("SERVICE_UNAVAILABLE", "所选版面服务不可用");
      if (api.provider && api.provider.implementation?.kind !== "native") {
        const upload = uploads.get(params.uploadId);
        if (!upload || upload.received !== upload.size)
          throw fileError("INVALID_INPUT", "图片上传未完成");
        uploads.delete(params.uploadId);
        clearTimeout(upload.timer);
        const prepared = await prepareImage(
          new Blob(upload.chunks, { type: upload.type }),
          await inputSettings(),
          signal
        );
        const result = await invokeImageProvider(
          api,
          "analyzeLayout",
          prepared,
          signal,
          { cacheMode: params.cacheMode, onProgress }
        );
        return {
          imageSize: prepared.size,
          regions: result.regions.map((region) => ({
            type: region.type,
            order: region.order,
            polygon: region.poly,
            // Valid polygons may have many points; avoid spreading them as call arguments.
            bbox: region.poly.reduce(
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
      // Existing native models retain their scheduler/session ownership.
      params = {
        ...params,
        modelId: api.modelRef,
        device: api.device || "wasm",
      };
    }
    const modelId = params.modelId || DOC_MODEL_ID;
    const model = CATALOG.find(
      (m) => m.id === modelId && m.task === "doc-layout"
    );
    if (!model || !model.backend.includes(params.device))
      throw fileError("INVALID_INPUT", "文档模型或计算后端无效");
    const upload = uploads.get(params.uploadId);
    if (!upload || upload.received !== upload.size)
      throw fileError("INVALID_INPUT", "图片上传未完成");
    uploads.delete(params.uploadId);
    clearTimeout(upload.timer);
    const file = new Blob(upload.chunks, { type: upload.type });
    // This complete-result bridge needs no client state observer. Reuse the
    // shared runtime directly; never add a per-page listener or unload its model.
    return runtimeHost.request(
      {
        id: crypto.randomUUID(),
        service: "doc",
        method: "analyze",
        options: { cacheMode: params.cacheMode },
        payload: {
          blob: file,
          modelRef: modelId,
          loadSpec: { device: params.device },
        },
      },
      { signal }
    );
  }

  if (method === "decideDocumentStructure") {
    const model = CATALOG.find(
      (m) => m.id === params.modelId && m.task === "decision"
    );
    if (
      !model ||
      !params.state ||
      typeof params.state !== "object" ||
      !Array.isArray(params.candidates) ||
      params.candidates.length < 2 ||
      params.candidates.length > 6 ||
      params.candidates.some(
        (c) => typeof c !== "string" || !c.trim() || c.length > 100
      ) ||
      JSON.stringify(params.state).length > 12000
    )
      throw fileError("INVALID_INPUT", "文档判断输入无效");
    return runtimeHost.request(
      {
        id: crypto.randomUUID(),
        service: "decision",
        method: "predict",
        options: { cacheMode: params.cacheMode },
        payload: {
          modelRef: model.id,
          state: params.state,
          questions: {
            structure: {
              type: "choice",
              instructions:
                "Choose the document structure best supported by the given evidence. Do not generate document content.",
              criteria: params.candidates,
            },
          },
        },
      },
      { signal }
    );
  }
  if (method === "getContext") return getFileContext(signal);
  if (method === "patchScene") {
    const patch = validateScenePatch(params.kind, params.patch);
    const result = await saveEdit(STOKEY_SETTING, (raw) => {
      const setting = normalizeStoredSetting(raw);
      const scenes = setting.fileTranslateSetting;
      const previous = scenes[params.kind];
      const scene = {
        ...previous,
        ...patch,
        ...(patch.readerPreferences
          ? {
              readerPreferences: {
                ...previous.readerPreferences,
                ...patch.readerPreferences,
              },
            }
          : {}),
      };
      return {
        ...setting,
        fileTranslateSetting: { ...scenes, [params.kind]: scene },
      };
    });
    return result.value.fileTranslateSetting[params.kind];
  }
  if (method === "openSettings") {
    const paths = {
      services: "/apis",
      prompts: "/prompts",
      models: "/local-ai",
      appearance: "/styles",
    };
    if (!Object.prototype.hasOwnProperty.call(paths, params.page || "services"))
      throw fileError("INVALID_INPUT", "不支持的设置页面");
    await browser.tabs.create({
      url: browser.runtime.getURL(
        `options.html#${paths[params.page || "services"]}`
      ),
    });
    return null;
  }
  if (method === "translateText") {
    if (
      typeof params.text !== "string" ||
      !params.text.trim() ||
      params.text.length > 100000
    )
      throw fileError("INVALID_INPUT", "待翻译文本为空或超过 100000 字符");
    const patch = validateScenePatch(params.kind, params.scene);
    const setting = await getSettingWithDefault();
    const scene = { ...setting.fileTranslateSetting[params.kind], ...patch };
    const records = await modelRecords(
      {
        transApis: setting.transApis.filter(
          (api) => scene.apiSlug === api.apiSlug
        ),
      },
      signal
    ).catch((error) => {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      return [];
    });
    const terminologyTaskId = params.terminologyTaskId || crypto.randomUUID();
    if (!uploads.terminologySnapshots) uploads.terminologySnapshots = new Map();
    return executeFileTranslation(params.text, scene, setting, signal, {
      getTerminologyTables: async (selectedScene, selectedApi) => {
        const key = `${terminologyTaskId}:${params.kind}:${selectedApi.apiSlug}`;
        if (!uploads.terminologySnapshots.has(key)) {
          if (uploads.terminologySnapshots.size >= 32)
            uploads.terminologySnapshots.delete(
              uploads.terminologySnapshots.keys().next().value
            );
          uploads.terminologySnapshots.set(
            key,
            loadTerminologySnapshot([selectedScene, selectedApi])
          );
        }
        return uploads.terminologySnapshots.get(key);
      },
      onTerminologyWarning: (missingTableIds) =>
        onProgress?.({ type: "terminology-warning", missingTableIds }),
      cacheMode: params.cacheMode,
      installedModels: new Set(
        records
          .filter((record) => record.state === "installed")
          .map((record) => record.manifest.id)
      ),
    });
  }
  if (method === "recognizeImage") {
    const capability = params.capability;
    const mode = params.taskMode || "doc";
    if (
      !["recognizeText", "parseImage"].includes(capability) ||
      !["doc", "table", "formula"].includes(mode) ||
      (params.requireCoordinates !== undefined &&
        typeof params.requireCoordinates !== "boolean")
    )
      throw fileError("INVALID_INPUT", "识别能力或任务无效");
    const setting = await getSettingWithDefault();
    const api = setting.transApis.find(
      (item) => item.apiSlug === params.serviceId
    );
    const requirements = {
      taskMode: mode,
      coordinates: params.requireCoordinates === true,
    };
    const records =
      api?.apiType === "LocalAI" ? await modelRecords(setting, signal) : [];
    if (
      !isApiAvailableFor(api, capability, {
        requirements,
        ...(api?.apiType === "LocalAI" && {
          installedModels: new Set(
            records
              .filter((r) => r.state === "installed")
              .map((r) => r.manifest.id)
          ),
        }),
      })
    )
      throw fileError(
        "SERVICE_UNAVAILABLE",
        "所选识别服务不可用，或不支持当前任务/坐标要求"
      );
    const upload = uploads.get(params.uploadId);
    if (!upload || upload.received !== upload.size)
      throw fileError("INVALID_INPUT", "图片上传未完成");
    uploads.delete(params.uploadId);
    clearTimeout(upload.timer);
    const prepared = await prepareImage(
      new Blob(upload.chunks, { type: upload.type }),
      await inputSettings(),
      signal
    );
    const promptSlug =
      params.promptSlug || (mode === "doc" ? api.vlmPromptSlug : "");
    let prompt;
    if (capability === "parseImage") {
      if (promptSlug)
        prompt = resolveVlmPrompt(setting.prompts, promptSlug, api);
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
    }
    const result = await invokeImageProvider(
      api,
      capability,
      prepared,
      signal,
      {
        mode,
        requireCoordinates: params.requireCoordinates,
        cacheMode: params.cacheMode,
        onProgress,
        ...(prompt && { prompt }),
      }
    );
    if (!result.text?.trim())
      throw fileError("INVALID_RESPONSE", "识别返回空结果");
    if (
      (params.requireCoordinates ||
        supportedApiFeature(api, capability)?.coordinates) &&
      !hasCompleteCoordinates(result.items || [])
    )
      throw fileError("INVALID_RESPONSE", "识别服务未返回完整有效的文字坐标");
    const sx = prepared.original.width / prepared.size.width;
    const sy = prepared.original.height / prepared.size.height;
    return {
      ...result,
      items: (result.items?.length
        ? result.items
        : result.text
            .split(/\r?\n/)
            .filter(Boolean)
            .map((text) => ({ text, poly: null }))
      ).map((item) => ({
        ...item,
        poly: item.poly?.map(([x, y]) => [x * sx, y * sy]) || null,
      })),
      imageSize: prepared.original,
      serviceId: api.apiSlug,
      capability,
      inputAdjustments: [
        ...(result.inputAdjustments || []),
        ...(prepared.adjustment ? [prepared.adjustment] : []),
      ],
    };
  }
  throw fileError("UNKNOWN_METHOD", "不支持的文件翻译接口");
}

// Each port owns its requests and temporary uploads. No public dispatch into the
// extension's unrestricted internal message handler is permitted here.
export function attachFileSession(port, execute = executeFileMethod) {
  const sessionId = crypto.randomUUID();
  const pending = new Map(),
    uploads = new Map(),
    seen = new Set();
  let ready = false,
    closed = false,
    pendingOtherRequests = 0;
  const send = (value) => {
    if (!closed) {
      try {
        port.postMessage(value);
      } catch {
        close();
      }
    }
  };
  const dropUpload = (id) => {
    clearTimeout(uploads.get(id)?.timer);
    uploads.delete(id);
  };
  const touchUpload = (id, upload) => {
    clearTimeout(upload.timer);
    upload.timer = setTimeout(() => dropUpload(id), 60000);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    pending.forEach((controller) => controller.abort());
    pending.clear();
    [...uploads.keys()].forEach(dropUpload);
    uploads.terminologySnapshots?.clear();
    browser.storage.onChanged.removeListener(changed);
    modelChannel?.close();
    port.onMessage.removeListener(receive);
    port.onDisconnect.removeListener(close);
  };
  const changed = (_changes, area) => {
    if (area === "local" && ready) send({ type: "contextChanged", sessionId });
  };
  let modelChannel;
  if (typeof BroadcastChannel !== "undefined") {
    modelChannel = new BroadcastChannel("kiss-ai-runtime-rpc");
    modelChannel.onmessage = ({ data }) => {
      if (ready && ["model-broadcast", "service-state"].includes(data?.kind))
        send({ type: "contextChanged", sessionId });
    };
  }
  const receive = async (message) => {
    const id = message?.requestId;
    if (typeof id !== "string" || id.length > 200) return;
    try {
      if (seen.has(id)) throw fileError("DUPLICATE_REQUEST", "重复请求");
      seen.add(id);
      if (seen.size > 100000) {
        close();
        port.disconnect();
        return;
      }
      if (message.method === "handshake") {
        if (message.protocolVersion !== FILE_PROTOCOL)
          throw fileError(
            "INCOMPATIBLE_PROTOCOL",
            "扩展与网页协议不兼容，请更新扩展"
          );
        ready = true;
        send({
          type: "response",
          requestId: id,
          result: {
            sessionId,
            protocolVersion: FILE_PROTOCOL,
            extensionVersion: browser.runtime.getManifest().version,
            extensionId: browser.runtime.id,
            development: process.env.REACT_APP_FILE_BRIDGE_DEV === "true",
            capabilities: [
              "translation",
              "ocr",
              "settings",
              "doc",
              "doc-decision",
            ],
            imageChunkBytes: IMAGE_CHUNK_BYTES,
          },
        });
        return;
      }
      if (!ready || message.sessionId !== sessionId)
        throw fileError("INVALID_SESSION", "文件翻译会话无效");
      const params = message.params || {};
      if (message.method === "ping") {
        send({ type: "response", requestId: id, result: null });
        return;
      }
      if (message.method === "cancel") {
        pending.get(params.requestId)?.abort();
        if (params.uploadId) dropUpload(params.uploadId);
        send({ type: "response", requestId: id, result: null });
        return;
      }
      if (message.method === "uploadBegin") {
        const limits = await inputSettings();
        const mimeType =
          params.type === "image/jpg" ? "image/jpeg" : params.type;
        if (
          !Number.isSafeInteger(params.size) ||
          params.size <= 0 ||
          params.size > limits.maxImageFileMB * 1024 ** 2 ||
          !["image/png", "image/jpeg", "image/webp"].includes(mimeType) ||
          uploads.size >= 1
        )
          throw fileError(
            "INPUT_LIMIT_EXCEEDED",
            "图片大小、格式或上传状态无效"
          );
        if (closed) return;
        const uploadId = crypto.randomUUID();
        const upload = {
          size: params.size,
          type: mimeType,
          chunks: [],
          received: 0,
          sequence: 0,
        };
        uploads.set(uploadId, upload);
        touchUpload(uploadId, upload);
        send({ type: "response", requestId: id, result: { uploadId } });
        return;
      }
      if (message.method === "uploadChunk") {
        const upload = uploads.get(params.uploadId);
        if (
          !upload ||
          params.sequence !== upload.sequence ||
          typeof params.data !== "string" ||
          params.data.length > Math.ceil(IMAGE_CHUNK_BYTES / 3) * 4 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(params.data)
        )
          throw fileError("INVALID_INPUT", "图片分块无效");
        const decoded = atob(params.data);
        if (
          !decoded.length ||
          decoded.length > IMAGE_CHUNK_BYTES ||
          upload.received + decoded.length > upload.size
        )
          throw fileError("INPUT_LIMIT_EXCEEDED", "图片分块超过限制");
        upload.chunks.push(
          Uint8Array.from(decoded, (char) => char.charCodeAt(0))
        );
        upload.received += decoded.length;
        upload.sequence++;
        touchUpload(params.uploadId, upload);
        send({ type: "response", requestId: id, result: null });
        return;
      }
      // 翻译请求交给内部服务队列调度，不占用其他业务请求的限额。
      const isTranslation = message.method === "translateText";
      if (!isTranslation && pendingOtherRequests >= 64)
        throw fileError("BUSY", "请求过多，请稍后再试");
      const controller = new AbortController();
      pending.set(id, controller);
      if (!isTranslation) pendingOtherRequests++;
      const task = [
        "translateText",
        "recognizeImage",
        "analyzeLayout",
        "decideDocumentStructure",
      ].includes(message.method)
        ? startLogTask("file-translate", {
            taskId: `${sessionId}:${id}`,
            requestId: id,
            method: message.method,
          })
        : null;
      try {
        const result = await execute(
          message.method,
          params,
          controller.signal,
          uploads,
          (progress) => {
            if (progress.stage) task?.stage(progress.stage);
            if (!controller.signal.aborted)
              send({ type: "progress", requestId: id, sessionId, progress });
          }
        );
        if (controller.signal.aborted)
          throw new DOMException("已取消", "AbortError");
        task?.finish();
        send({ type: "response", requestId: id, result });
      } catch (error) {
        task?.finish(error);
        throw error;
      } finally {
        pending.delete(id);
        if (!isTranslation) pendingOtherRequests--;
      }
    } catch (error) {
      send({
        type: "response",
        requestId: id,
        error: serializeFileError(error),
      });
    }
  };
  browser.storage.onChanged.addListener(changed);
  port.onMessage.addListener(receive);
  port.onDisconnect.addListener(close);
  return close;
}

export function installFileTranslationBackend() {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== FILE_CHANNEL) return;
    if (
      port.sender?.frameId !== 0 ||
      !port.sender?.tab ||
      !isFileBridgePage(port.sender.url)
    ) {
      port.disconnect();
      return;
    }
    attachFileSession(port);
  });
}
