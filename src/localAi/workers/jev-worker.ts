import * as ort from "onnxruntime-web";
import { readFile } from "../core/opfs";
import type { JevLoadSpec } from "../core/types";
import { LayaTokenizer } from "../core/jev/tokenizer";
import {
  buildSequence,
  collate,
  formatAnswers,
  renderOptions,
  toInternal,
  type AgentConfig,
  type Batch,
  type DecisionQuestions,
  type DecisionResult,
  type DecisionState,
  type InternalQuestion,
  type PreparedItem,
  type TokenizerConfig,
  type TokenizerJson,
} from "../core/jev";
import { ORT_WASM_PATHS } from "./ortAssets";

if (ort.env.wasm) {
  ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
  ort.env.wasm.numThreads = 1;
}

let currentKey = "";
let session: ort.InferenceSession | null = null;
let tokenizer: LayaTokenizer | null = null;
let agentConfig: AgentConfig | null = null;
let loadingPromise: Promise<string> | null = null;
let currentSpec: JevLoadSpec | null = null;
let cachedModelBuf: ArrayBuffer | null = null;

function hasNonFinite(arr: Float32Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return true;
  }
  return false;
}

async function readJsonFromOpfs<T>(path: string): Promise<T> {
  const buf = await readFile(path);
  const text = new TextDecoder("utf-8").decode(buf);
  return JSON.parse(text) as T;
}

async function disposeSession(): Promise<void> {
  const s = session;
  session = null;
  tokenizer = null;
  agentConfig = null;
  currentKey = "";
  currentSpec = null;
  cachedModelBuf = null;
  if (s) {
    try {
      await s.release();
    } catch {
      // 忽略释放异常
    }
  }
}

async function runBatch(
  sess: ort.InferenceSession,
  batch: Batch
): Promise<{
  logits: Float32Array;
  actLogits: Float32Array;
  markers: number;
  actions: number;
}> {
  const feeds: Record<string, ort.Tensor> = {
    input_ids: new ort.Tensor("int64", batch.inputIds, [
      batch.rows,
      batch.length,
    ]),
    attention_mask: new ort.Tensor("int64", batch.attentionMask, [
      batch.rows,
      batch.length,
    ]),
    marker_pos: new ort.Tensor("int64", batch.markerPos, [
      batch.rows,
      batch.markers,
    ]),
    marker_mask: new ort.Tensor("bool", batch.markerMask, [
      batch.rows,
      batch.markers,
    ]),
    qtype: new ort.Tensor("int64", batch.qtype, [batch.rows]),
  };

  try {
    const out = await sess.run(feeds);
    const logitsTensor = out["logits"];
    const actLogitsTensor = out["act_logits"];
    if (!logitsTensor || !actLogitsTensor) {
      throw new Error("ONNX 输出缺少 logits 或 act_logits");
    }
    const logits = new Float32Array(logitsTensor.data as Float32Array);
    const actLogits = new Float32Array(actLogitsTensor.data as Float32Array);
    const markers = Number(logitsTensor.dims[1] ?? batch.markers);
    const actions = Number(actLogitsTensor.dims[1] ?? 2);
    logitsTensor.dispose?.();
    actLogitsTensor.dispose?.();
    return { logits, actLogits, markers, actions };
  } finally {
    for (const t of Object.values(feeds)) {
      t.dispose?.();
    }
  }
}

async function doLoad(spec: JevLoadSpec): Promise<string> {
  const key = `${spec.modelId}:${spec.device}`;
  if (session && tokenizer && agentConfig && currentKey === key) {
    return spec.device;
  }
  await disposeSession();

  self.postMessage({
    type: "progress",
    status: "读取本地分词器与配置 (OPFS)…",
  });

  const [rawCfg, tokJson] = await Promise.all([
    readJsonFromOpfs<AgentConfig>(`${spec.dir}/${spec.configFile}`),
    readJsonFromOpfs<TokenizerJson>(`${spec.dir}/${spec.tokenizerFile}`),
  ]);

  let tokCfg: TokenizerConfig = {};
  if (spec.tokenizerConfigFile) {
    try {
      tokCfg = await readJsonFromOpfs<TokenizerConfig>(
        `${spec.dir}/${spec.tokenizerConfigFile}`
      );
    } catch {
      tokCfg = {};
    }
  }

  tokenizer = new LayaTokenizer(tokJson, tokCfg);
  agentConfig = {
    ...rawCfg,
    temperature: rawCfg.temperature ?? [1, 1, 1],
    temperature_by_options: rawCfg.temperature_by_options ?? {},
  };

  self.postMessage({
    type: "progress",
    status: `读取模型权重 (${spec.modelFile})…`,
  });
  const modelBuf = await readFile(`${spec.dir}/${spec.modelFile}`);

  self.postMessage({
    type: "progress",
    status: `创建 ONNX Session (${spec.device.toUpperCase()})…`,
  });

  const providers: ort.InferenceSession.ExecutionProviderConfig[] =
    spec.device === "webgpu" ? ["webgpu"] : ["wasm"];

  try {
    session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
      executionProviders: providers,
      // 文档 §37：Laya 完整图在 WebGPU 下使用 basic 图优化级别以确保算子兼容与精度一致
      graphOptimizationLevel: spec.device === "webgpu" ? "basic" : "all",
    });
    currentKey = key;
    currentSpec = spec;
    cachedModelBuf = modelBuf;
    return spec.device;
  } catch (err) {
    if (spec.device === "webgpu") {
      self.postMessage({
        type: "progress",
        status: "WebGPU 初始化失败，正在回退到 WASM…",
      });
      session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      currentKey = `${spec.modelId}:wasm`;
      currentSpec = { ...spec, device: "wasm" };
      cachedModelBuf = modelBuf;
      return "wasm";
    }
    throw err;
  }
}

async function doPredict(
  state: DecisionState,
  questions: DecisionQuestions
): Promise<DecisionResult> {
  if (!session || !tokenizer || !agentConfig) {
    throw new Error("MODEL_NOT_LOADED: JEV 模型尚未加载");
  }
  const t0 = performance.now();

  const items: PreparedItem[] = [];
  const internal: InternalQuestion[] = [];
  const questionIds = Object.keys(questions);
  if (questionIds.length === 0) {
    throw new Error("INVALID_DECISION_SCHEMA: 至少需要定义一个问题");
  }

  for (const qid of questionIds) {
    const q = toInternal(questions[qid]);
    const item = buildSequence(
      tokenizer,
      state,
      q,
      agentConfig.max_len,
      agentConfig.head_max_len
    );
    if (item.markers.length !== renderOptions(q).length) {
      throw new Error(
        `TOKEN_LIMIT_EXCEEDED: 问题 ${qid} 的候选项超出 token 预算上限`
      );
    }
    items.push(item);
    internal.push(q);
  }

  const batch = collate(items, tokenizer.padTokenId);
  const tTokenize = performance.now();

  let out = await runBatch(session, batch);
  if (
    currentSpec &&
    currentSpec.device === "webgpu" &&
    (hasNonFinite(out.logits) || hasNonFinite(out.actLogits))
  ) {
    self.postMessage({
      type: "progress",
      status: "WebGPU INT8 输出非有限值（NaN/Inf），自动无缝回退至 WASM 重新计算…",
    });
    const modelBuf =
      cachedModelBuf ??
      (await readFile(`${currentSpec.dir}/${currentSpec.modelFile}`));
    const oldSession = session;
    const wasmSession = await ort.InferenceSession.create(
      new Uint8Array(modelBuf),
      {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }
    );
    session = wasmSession;
    currentKey = `${currentSpec.modelId}:wasm`;
    currentSpec = { ...currentSpec, device: "wasm" };
    try {
      await oldSession?.release();
    } catch {
      // 忽略旧会话释放失败
    }
    out = await runBatch(session, batch);
  }
  const tOnnx = performance.now();

  const formatted = formatAnswers({
    config: agentConfig,
    questionIds,
    internal,
    items,
    logits: out.logits,
    actLogits: out.actLogits,
    markers: out.markers,
    actions: out.actions,
  });
  const tEnd = performance.now();

  return {
    ...formatted,
    timing: {
      tokenizeMs: Math.round((tTokenize - t0) * 10) / 10,
      onnxMs: Math.round((tOnnx - tTokenize) * 10) / 10,
      postprocessMs: Math.round((tEnd - tOnnx) * 10) / 10,
      totalMs: Math.round((tEnd - t0) * 10) / 10,
    },
  };
}

let chain = Promise.resolve();

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | ({ type: "load" } & JevLoadSpec)
    | {
        type: "predict";
        id: string;
        state: DecisionState;
        questions: DecisionQuestions;
      }
    | { type: "unload" };

  chain = chain.then(async () => {
    try {
      if (msg.type === "load") {
        const key = `${msg.modelId}:${msg.device}`;
        if (!loadingPromise || currentKey !== key) {
          loadingPromise = doLoad(msg).finally(() => {
            loadingPromise = null;
          });
        }
        const backend = await loadingPromise;
        self.postMessage({ type: "ready", backend });
      } else if (msg.type === "predict") {
        const result = await doPredict(msg.state, msg.questions);
        self.postMessage({ type: "result", id: msg.id, result });
      } else if (msg.type === "unload") {
        await disposeSession();
        self.postMessage({ type: "unloaded" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (msg.type === "predict") {
        self.postMessage({ type: "error", id: msg.id, message });
      } else {
        self.postMessage({ type: "error", message });
      }
    }
  });
};
