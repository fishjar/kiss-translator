import { env } from "@huggingface/transformers";
// webgpu bundle 使用 asyncify 版 wasm（非 jsep）
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";

export const ORT_WASM_PATHS = { wasm: wasmUrl, mjs: mjsUrl };

let currentDir = "";
let opfsIndex: Map<string, FileSystemFileHandle> | null = null;
let initialized = false;

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  map: Map<string, FileSystemFileHandle>
): Promise<void> {
  for await (const entry of dir.values()) {
    if (entry.kind === "file") {
      map.set(prefix + entry.name, entry);
    } else {
      await walk(entry, prefix + entry.name + "/", map);
    }
  }
}

export async function buildOpfsIndex(
  dir: string
): Promise<Map<string, FileSystemFileHandle>> {
  const map = new Map<string, FileSystemFileHandle>();
  try {
    const root = await navigator.storage.getDirectory();
    let d = root;
    for (const part of dir.split("/").filter(Boolean)) {
      d = await d.getDirectoryHandle(part, { create: false });
    }
    await walk(d, "", map);
  } catch (e) {
    console.warn("[ortOpfsBridge] OPFS 索引失败", dir, e);
  }
  return map;
}

// 切换当前 OPFS 模型目录并失效缓存索引（每次 worker load 新模型时调用）
export function setOpfsModelDir(dir: string): void {
  currentDir = dir;
  opfsIndex = null;
}

export async function getCurrentOpfsIndex(): Promise<
  Map<string, FileSystemFileHandle>
> {
  if (!opfsIndex) {
    opfsIndex = await buildOpfsIndex(currentDir);
  }
  return opfsIndex;
}

// 统一初始化 transformers.js 的 ORT WASM 路径、扩展 CSP 兼容开关（useWasmCache=false）与 OPFS env.fetch 桥接
export function initTransformersOpfsBridge(): void {
  if (initialized) return;
  initialized = true;

  env.useBrowserCache = false;
  // useWasmCache 默认 true：transformers 会预取 .mjs 并把 wasmPaths.mjs 换成 blob: URL，
  // 扩展 CSP（script-src 'self' 'wasm-unsafe-eval'）拒绝 import(blob:) → 加载必失败。
  // 关闭后 ORT 直接 import 同源 ?url 资产，无需 blob。
  env.useWasmCache = false;
  const ortWasm = env.backends.onnx.wasm;
  if (ortWasm) {
    ortWasm.wasmPaths = ORT_WASM_PATHS;
    ortWasm.numThreads = 1;
  }

  const nativeFetch = self.fetch.bind(self);
  // 覆盖 env.fetch（transformers 加载模型/tokenizer 均走它；直接补丁 self.fetch
  // 无效——env.js 在模块加载时就绑定了原始 fetch 引用）
  env.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const mark = "/resolve/";
    if (url.includes(mark)) {
      const idx = await getCurrentOpfsIndex();
      const rel = decodeURIComponent(
        url.slice(url.indexOf(mark) + mark.length)
      ).replace(/^main\//, "");
      const handle = idx.get(rel);
      if (!handle) {
        // 配置文件（如可选的 added_tokens.json / chat_template.jinja）若本地未收录，
        // 对非必需探测返回 404，对核心权重/配置缺失由调用方统一捕获报错，避免在 fetch 内提前 post error 导致双重报错
        return new Response(`local model file missing: ${rel}`, {
          status: 404,
          statusText: `本地模型缺少文件：${rel}（请到模型中心下载）`,
        });
      }
      const file = await handle.getFile();
      const buf = await file.arrayBuffer();
      return new Response(buf);
    }
    return nativeFetch(input, init);
  }) as typeof self.fetch;
}
