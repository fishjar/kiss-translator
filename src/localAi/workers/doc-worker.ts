import * as ort from "onnxruntime-web";
import { readFile } from "../core/opfs";
import { decodeLayout, type DocLoadSpec } from "../core/docLayout";
import { ORT_WASM_PATHS } from "./ortAssets";
import { docOpenCv, docPixels, docPolygon } from "../core/docVision";

ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
ort.env.wasm.numThreads = 1;
let session: ort.InferenceSession | null = null;
let backend = "wasm";
self.onmessage = async ({ data }) => {
  const id = data.id;
  try {
    if (data.type === "load") {
      const spec = data.spec as DocLoadSpec;
      await session?.release();
      session = null;
      self.postMessage({ id, type: "progress", status: "读取 DOC 权重…" });
      const model = await readFile(`${spec.dir}/${spec.modelFile}`);
      const weights = await readFile(`${spec.dir}/${spec.dataFile}`);
      // External location must match the location embedded in the ONNX graph.
      session = await ort.InferenceSession.create(model, {
        executionProviders: [spec.device],
        externalData: [{ path: spec.dataFile, data: new Uint8Array(weights) }],
      });
      backend = spec.device;
      self.postMessage({ id, type: "result", result: { backend } });
    } else if (data.type === "analyze") {
      if (!session) throw new Error("MODEL_UNLOADED: 请先加载 DOC 模型");
      const start = performance.now(),
        bitmap = await createImageBitmap(data.blob);
      const width = bitmap.width,
        height = bitmap.height;
      if (width * height > 24000000) {
        bitmap.close();
        throw new Error("页面图像超过 2400 万像素，请降低分辨率");
      }
      self.postMessage({ id, type: "progress", status: "初始化文档图像处理…" });
      const { cv } = await docOpenCv();
      const canvas = new OffscreenCanvas(width, height),
        ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, width, height).data,
        values = docPixels(cv, pixels, width, height);
      canvas.width = canvas.height = 0;
      const input = new ort.Tensor("float32", values, [1, 3, 800, 800]);
      let out: ort.InferenceSession.OnnxValueMapType | undefined;
      try {
        self.postMessage({ id, type: "progress", status: "DOC 布局推理…" });
        out = await session.run({ pixel_values: input });
        self.postMessage({
          id,
          type: "progress",
          status: "DOC 掩码与阅读顺序…",
        });
        const tensors = await Promise.all(
          ["logits", "pred_boxes", "out_masks", "order_logits"].map(
            async (name) => {
              if (!out![name]) throw new Error(`缺少模型输出 ${name}`);
              return (await out![name].getData()) as Float32Array;
            }
          )
        );
        const regions = decodeLayout(
          tensors[0],
          tensors[1],
          tensors[2],
          tensors[3],
          width,
          height,
          300,
          200,
          0.5,
          (...args) => docPolygon(cv, ...args)
        );
        self.postMessage({
          id,
          type: "result",
          result: {
            regions,
            readingOrder: regions.map((r) => r.id),
            imageSize: { width, height },
            backend,
            elapsedMs: performance.now() - start,
          },
        });
      } finally {
        input.dispose();
        if (out) for (const t of Object.values(out)) t.dispose();
      }
    }
  } catch (e) {
    self.postMessage({
      id,
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
