import { describe, expect, it, vi } from "vitest";
import {
  CATALOG,
  KOKORO_VOICE_SHA,
  PIPER_VOICES,
  getCatalogModel,
} from "../catalog";
import { fileUrl, MIRROR_BASES } from "../types";

describe("catalog", () => {
  it("每个模型都有文件且 size 与文件总和一致", () => {
    for (const m of CATALOG) {
      expect(m.files.length).toBeGreaterThan(0);
      const total = m.files.reduce((s, f) => s + f.size, 0);
      expect(m.size).toBe(total);
      for (const f of m.files) {
        expect(f.size).toBeGreaterThan(0);
        expect(f.path.length).toBeGreaterThan(0);
      }
    }
  });

  it("模型 id 唯一", () => {
    const ids = CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("覆盖 asr / ocr / llm / decision 任务", () => {
    const tasks = CATALOG.map((m) => m.task);
    for (const t of ["asr", "ocr-detection", "ocr-recognition", "llm", "decision"]) {
      expect(tasks).toContain(t);
    }
  });

  it("getCatalogModel 按 id 查找", () => {
    expect(getCatalogModel("whisper-base-timestamped")?.task).toBe("asr");
    expect(getCatalogModel("glm-ocr-onnx-q4")?.task).toBe("ocr-vlm");
    expect(getCatalogModel("glm-ocr-onnx-q4")?.backend).toEqual(["webgpu", "wasm"]);
    expect(getCatalogModel("paddleocr-vl-1.6-onnx-q8")?.task).toBe("ocr-vlm");
    expect(getCatalogModel("paddleocr-vl-1.6-q4")?.task).toBe("ocr-vlm");
    expect(getCatalogModel("audio8-tts-0.1b-int8")?.task).toBe("tts");
    expect(getCatalogModel("piper-en_US-lessac-medium")).toBeUndefined();
    expect(getCatalogModel("laya-multilingual-int8")?.task).toBe("decision");
    expect(getCatalogModel("nope")).toBeUndefined();
  });

  it("所有模型文件均带合法 sha256（64 位小写十六进制）", () => {
    const re = /^[0-9a-f]{64}$/;
    let count = 0;
    for (const m of CATALOG) {
      for (const f of m.files) {
        expect(f.sha256, `${m.id} / ${f.path} 缺少 sha256`).toMatch(re);
        count++;
      }
    }
    expect(count).toBe(156);
  });

  it("kokoro 音色哈希表与音色列表一一对应", () => {
    for (const f of getCatalogModel("kokoro-82m")!.files) {
      if (f.path.startsWith("voices/")) {
        const id = f.path.replace("voices/", "").replace(".bin", "");
        expect(KOKORO_VOICE_SHA[id], `缺少 ${id} 哈希`).toMatch(
          /^[0-9a-f]{64}$/
        );
      }
    }
  });

  it("已移除 Piper en_US-lessac-medium 并注册 Audio8 TTS 0.1B ONNX INT8", () => {
    expect(PIPER_VOICES.length).toBe(0);
    const m = getCatalogModel("audio8-tts-0.1b-int8");
    expect(m).toBeDefined();
    expect(m!.task).toBe("tts");
    expect(m!.runtime).toBe("onnx");
    expect(m!.source).toBe("Edge0/audio8-TTS-0.1B-ONNX-INT8");
    expect(m!.files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        "slow_ar_int8.onnx",
        "slow_ar_int8.onnx.data",
        "fast_ar_int8.onnx",
        "fast_ar_int8.onnx.data",
        "codec_decoder_fp16.onnx",
        "codec_decoder_fp16.onnx.data",
        "reference_codes.npy",
        "tokenizer/tokenizer.json",
      ])
    );
  });

  it("Whisper int8 QDQ 模型仅声明支持 webgpu 后端，SenseVoice 支持 wasm 与 webgpu", () => {
    const whisperModels = CATALOG.filter(
      (m) => m.task === "asr" && m.runtime === "transformers"
    );
    expect(whisperModels.length).toBeGreaterThan(0);
    for (const m of whisperModels) {
      expect(m.backend, `${m.id} 不应包含 wasm`).toEqual(["webgpu"]);
    }
    const sv = getCatalogModel("sensevoice-small");
    expect(sv?.runtime).toBe("onnx");
    expect(sv?.backend).toEqual(["wasm", "webgpu"]);
    expect(sv?.modelscopeSource).toBe("iic/SenseVoiceSmall-onnx");
  });
});

describe("fileUrl", () => {
  it("web 模式走 Vite 代理", () => {
    // 测试环境无 chrome.runtime → 代理形式
    expect(fileUrl("hf-mirror", "a/b", "x/y.onnx")).toBe(
      `/proxy/${new URL(MIRROR_BASES["hf-mirror"]).host}/a/b/resolve/main/x/y.onnx`
    );
    expect(fileUrl("huggingface", "a/b", "x/y.onnx")).toBe(
      `/proxy/${new URL(MIRROR_BASES.huggingface).host}/a/b/resolve/main/x/y.onnx`
    );
    // ModelScope 布局不同：/models/<source>/resolve/master/<path>
    expect(fileUrl("modelscope", "a/b", "x/y.onnx")).toBe(
      `/proxy/${new URL(MIRROR_BASES.modelscope).host}/models/a/b/resolve/master/x/y.onnx`
    );
  });

  it("扩展模式走镜像绝对地址", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "test-id" } });
    vi.resetModules();
    const { fileUrl: extFileUrl, MIRROR_BASES: extBases } = await import("../types");
    expect(extFileUrl("hf-mirror", "a/b", "x/y.onnx")).toBe(
      `${extBases["hf-mirror"]}/a/b/resolve/main/x/y.onnx`
    );
    expect(extFileUrl("modelscope", "a/b", "x/y.onnx")).toBe(
      `${extBases.modelscope}/models/a/b/resolve/master/x/y.onnx`
    );
    vi.unstubAllGlobals();
  });
});
