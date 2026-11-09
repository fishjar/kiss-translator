import {
  DEFAULT_API_LIST,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_SYSTEM_TTS,
} from "./api";
import { resolveBuiltinCapabilities } from "../builtin-plugins/capabilities";

/** Installed settings keep their own list; these instances are only initial defaults. */
export function defaultServices(client = process.env.REACT_APP_CLIENT) {
  if (!["chrome", "edge", "firefox"].includes(client)) return DEFAULT_API_LIST;
  const local = DEFAULT_API_LIST.find(
    (api) => api.apiType === OPT_TRANS_LOCALAI
  );
  const instances = [
    ["LocalAI-JEV", "LocalAI JEV", "laya-multilingual-int8", "webgpu"],
    ["LocalAI-ASR", "LocalAI ASR", "whisper-small-timestamped", "webgpu"],
    ["LocalAI-OCR", "LocalAI OCR", "ppocr-v6-medium", "webgpu"],
    ["LocalAI-VLM", "LocalAI VLM", "paddleocr-vl-1.6-onnx-q8", "webgpu"],
    ["LocalAI-Translation", "LocalAI 翻译", "hy-mt2-1.8b", "webgpu"],
    ["LocalAI-Layout", "LocalAI 版面分析", "pp-doclayout-v3-onnx", "wasm"],
  ].map(([apiSlug, apiName, modelRef, device]) => {
    const api = {
      ...local,
      apiSlug,
      apiName,
      modelRef,
      device,
      isDisabled: false,
      sortOrder: 0,
    };
    return {
      ...api,
      enabledCapabilities: Object.keys(resolveBuiltinCapabilities(api)),
    };
  });
  return DEFAULT_API_LIST.flatMap((api) => {
    if (api.apiType === OPT_TRANS_LOCALAI) return instances;
    return api.apiType === OPT_TRANS_SYSTEM_TTS
      ? [
          {
            ...api,
            isDisabled: false,
            sortOrder: 0,
            enabledCapabilities: ["speak"],
          },
        ]
      : [api];
  });
}
