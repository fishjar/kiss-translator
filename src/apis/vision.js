import { genTransReq } from "./trans";
import { fetchData } from "../libs/fetch";
import { supportsVlmApi } from "../config/serviceSelection";
import { OPT_TRANS_GEMINI, OPT_TRANS_CLAUDE } from "../config/api";

export async function recognizeNetworkImage(file, api, prompt, signal) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  if (api?.provider) {
    const { invokeScene } = await import("../providers/sceneInvocation");
    const { createAssetStore } = await import("../providers/transport");
    const assets = createAssetStore();
    const call = invokeScene(
      api,
      "parseImage",
      { image: assets.put(file), prompt, mode: "doc" },
      { signal, assets }
    );
    try {
      const result = await call.result;
      if (typeof result?.text !== "string")
        throw new Error("Invalid OCR result.");
      return {
        ...result,
        items:
          result.items ||
          result.text
            .split(/\r?\n/)
            .filter(Boolean)
            .map((text) => ({ text, poly: null })),
      };
    } finally {
      call.cancel();
      assets.clear();
    }
  }
  return recognizeNativeNetworkImage(file, api, prompt, signal);
}

/** Compiled native implementation, separate from the external Provider entry. */
export async function recognizeNativeNetworkImage(file, api, prompt, signal) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  if (!supportsVlmApi(api) || api.sourceType !== "network")
    throw new Error("该接口尚未接入视觉解析");
  if (!prompt?.trim()) throw new Error("视觉解析提示词不能为空");
  const mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!mimeType) throw new Error("图片类型不能为空");
  if (
    api.apiType === OPT_TRANS_CLAUDE &&
    !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
  )
    throw new Error("Claude 不支持该图片格式");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const [input, init] = await genTransReq({
    ...api,
    useStream: false,
    useContext: false,
    useBatchFetch: false,
    vlmPrompt: prompt,
    imageData: { type: mimeType, base64: btoa(binary) },
  });
  const res = await fetchData(input, init, {
    useCache: false,
    usePool: true,
    fetchInterval: api.fetchInterval,
    fetchLimit: api.fetchLimit,
    httpTimeout: api.httpTimeout,
    signal,
  });
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  if (res?.error) throw new Error(res.error.message || "视觉解析失败");
  const text =
    api.apiType === OPT_TRANS_GEMINI
      ? (res?.candidates?.[0]?.content?.parts || [])
          .filter((p) => !p.thought)
          .map((p) => p.text || "")
          .join("")
      : api.apiType === OPT_TRANS_CLAUDE
        ? (res?.content || [])
            .filter((p) => p.type === "text")
            .map((p) => p.text || "")
            .join("")
        : res?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new Error("视觉解析返回空结果");
  return {
    text,
    items: text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => ({ text: line, poly: null })),
    isVlm: true,
  };
}
