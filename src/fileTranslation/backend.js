import browser from "webextension-polyfill";
import { DEFAULT_FILE_TRANSLATE_SETTING } from "../config/setting";
import { STOKEY_SETTING } from "../config/storage";
import { getAllPrompts, resolveVlmPrompt } from "../config/prompt";
import { recognizeNetworkImage } from "../apis/vision";
import { prepareImage } from "../localAi/core/inputLimits";
import {
  getSettingWithDefault,
  normalizeStoredSetting,
  saveEdit,
} from "../libs/storage";
import { executeFileTranslation } from "../libs/fileTranslationService";
import { isApiAvailableFor, supportsVlmApi } from "../config/serviceSelection";
import {
  ALL_OCR_MODELS,
  OCR_GROUPS,
  recognizeFileImage,
} from "../localAi/fileOperations";
import { runtimeHost } from "../localAi/runtime/runtimeHostAdapter";
import { normalizeSettings } from "../localAi/core/settings";
import {
  FILE_CHANNEL,
  FILE_PROTOCOL,
  IMAGE_CHUNK_BYTES,
  fileError,
  isFileBridgePage,
  serializeFileError,
} from "./protocol";

const SCENES = Object.keys(DEFAULT_FILE_TRANSLATE_SETTING);
const EXTRA_FIELDS = ["apiSlug", "ocrApiSlug", "ocrApiSlugs"];
const API_FIELDS = [
  "apiSlug",
  "apiName",
  "apiType",
  "sourceType",
  "capabilities",
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
    if (![...Object.keys(defaults), ...EXTRA_FIELDS].includes(key))
      throw fileError("INVALID_INPUT", `不能修改设置字段 ${key}`);
    if (key === "apiSlugs" || key === "ocrApiSlugs") {
      if (
        !Array.isArray(value) ||
        value.length > 100 ||
        value.some((item) => typeof item !== "string" || item.length > 200)
      )
        throw fileError("INVALID_INPUT", "服务列表无效");
    } else if (key === "readerPreferences") {
      if (
        !value ||
        Array.isArray(value) ||
        typeof value !== "object" ||
        Object.keys(value).some(
          (field) => !["fontSize", "fontFamily", "themeId"].includes(field)
        ) ||
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
  if (
    !setting.transApis?.some(
      (api) => api.sourceType === "local" && !api.isDisabled
    )
  )
    return [];
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

export async function getFileContext(signal) {
  const setting = await getSettingWithDefault();
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
  const ocrInstalled = (id) => {
    const group = OCR_GROUPS.find((item) => item.id === id);
    return group
      ? installed.has(group.detId) && installed.has(group.recId)
      : installed.has(id);
  };
  return {
    uiLang: setting.uiLang,
    scenes: Object.fromEntries(
      SCENES.map((kind) => {
        const scene = pick(setting.fileTranslateSetting[kind] || {}, [
          ...Object.keys(DEFAULT_FILE_TRANSLATE_SETTING[kind]),
          ...EXTRA_FIELDS,
        ]);
        if (scene.readerPreferences)
          scene.readerPreferences = pick(scene.readerPreferences, [
            "fontSize",
            "fontFamily",
            "themeId",
          ]);
        return [kind, scene];
      })
    ),
    services: setting.transApis.map((api) => ({
      ...pick(api, API_FIELDS),
      translationAvailable: isApiAvailableFor(api, "translation", {
        installedModels: installed,
      }),
      ocrAvailable:
        !api.isDisabled &&
        (api.capabilities || []).some((cap) => ["ocr", "vlm"].includes(cap)) &&
        (api.sourceType === "local"
          ? ocrInstalled(api.modelRef)
          : api.sourceType === "network" &&
            api.capabilities.includes("vlm") &&
            supportsVlmApi(api)),
    })),
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
    })),
    ocrModels: ALL_OCR_MODELS,
    modelError,
    limits: {
      maxImageFileMB: limits.maxImageFileMB,
      imageChunkBytes: IMAGE_CHUNK_BYTES,
    },
  };
}

export async function executeFileMethod(method, params, signal, uploads) {
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
        transApis: setting.transApis.filter((api) =>
          (scene.apiSlugs || [scene.apiSlug]).includes(api.apiSlug)
        ),
      },
      signal
    ).catch((error) => {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      return [];
    });
    return executeFileTranslation(params.text, scene, setting, signal, {
      installedModels: new Set(
        records
          .filter((record) => record.state === "installed")
          .map((record) => record.manifest.id)
      ),
    });
  }
  if (method === "recognizeImage") {
    const upload = uploads.get(params.uploadId);
    if (!upload || upload.received !== upload.size)
      throw fileError("INVALID_INPUT", "图片上传未完成");
    uploads.delete(params.uploadId);
    clearTimeout(upload.timer);
    const setting = await getSettingWithDefault();
    const api = setting.transApis.find(
      (item) =>
        item.apiSlug === params.serviceId &&
        !item.isDisabled &&
        (item.capabilities || []).some((cap) => ["ocr", "vlm"].includes(cap))
    );
    if (!api)
      throw fileError("SERVICE_UNAVAILABLE", "请选择已配置的图片识别服务");
    const scene = setting.fileTranslateSetting.image;
    const patch = params.scene ? validateScenePatch("image", params.scene) : {};
    const prompt = resolveVlmPrompt(
      setting.prompts,
      (patch.vlmPromptSlug ?? scene?.vlmPromptSlug) || api.vlmPromptSlug
    );
    const file = new Blob(upload.chunks, { type: upload.type });
    if (api.sourceType === "local" && api.modelRef) {
      return recognizeFileImage(
        file,
        {
          groupId: api.modelRef,
          device: api.device || "webgpu",
          prompt,
          maxTokens: api.maxTokens,
          temperature: api.temperature,
        },
        signal
      );
    }
    if (
      api.sourceType === "network" &&
      api.capabilities.includes("vlm") &&
      supportsVlmApi(api)
    ) {
      const prepared = await prepareImage(file, await inputSettings(), signal);
      const result = await recognizeNetworkImage(
        prepared.blob,
        api,
        prompt,
        signal
      );
      return {
        ...result,
        inputAdjustments: prepared.adjustment ? [prepared.adjustment] : [],
      };
    }
    throw fileError("SERVICE_UNAVAILABLE", "该服务尚未接入图片识别");
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
            capabilities: ["translation", "ocr", "settings"],
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
        const mimeType = params.type === "image/jpg" ? "image/jpeg" : params.type;
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
      try {
        const result = await execute(
          message.method,
          params,
          controller.signal,
          uploads
        );
        if (controller.signal.aborted)
          throw new DOMException("已取消", "AbortError");
        send({ type: "response", requestId: id, result });
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
