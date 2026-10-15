/**
 * Edge0/audio8-TTS-0.1B-ONNX-INT8 (ArkTTS 0.1B DualAR + FP16 Codec) 纯函数工具模块
 *
 * 严格移植自官方 `Edge0-AI/Audio8_TTS/onnx_runtime_0_1b_int8/arktts_runtime/{prompt,runtime}.py`：
 * - Slow AR (`slow_ar_int8.onnx`): 24 层 Falcon-H1 混合架构（Attention + Mamba），逐列 `[1, 11, 1]` 推进
 * - Fast AR (`fast_ar_int8.onnx`): 4 层局部 Transformer，逐帧预测 10 个码本 (`[0..4095]`)
 * - Codec Decoder (`codec_decoder_fp16.onnx`): 将 `[1, 10, T]` 码本解码为 44,100 Hz 单声道波形
 */

export const AUDIO8_SAMPLE_RATE = 44100;
export const AUDIO8_NUM_CODEBOOKS = 10;
export const AUDIO8_CODEBOOK_SIZE = 4096;
export const AUDIO8_SEMANTIC_BEGIN_ID = 65537;
export const AUDIO8_SEMANTIC_END_ID = 69632;
export const AUDIO8_IM_END_ID = 4096;
export const AUDIO8_MAX_SEQ_LEN = 2048;
export const AUDIO8_NUM_LAYERS = 24;
export const AUDIO8_N_LOCAL_HEADS = 2;
export const AUDIO8_HEAD_DIM = 64;
export const AUDIO8_NUM_FAST_LAYERS = 4;
export const AUDIO8_FAST_HEAD_DIM = 64;
export const AUDIO8_DEFAULT_REF_TEXT = "至今为止，元气火箭总共发行了两张专辑。";

const CJK_RE =
  /[\u1100-\u11ff\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u3100-\u31ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7a3\ud7b0-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff01-\uff9f]/u;
/* eslint-disable no-control-regex -- audio normalization intentionally matches these control characters */
const LINE_BREAK_RE = /[\r\n\v\f\x1c-\x1e\x85\u2028\u2029]/;
/* eslint-enable no-control-regex */

/**
 * 清理控制字符与多余空白（与官方 `prompt.py:clean_text` 对齐）
 */
export function cleanAudio8Text(text: string): string {
  let filtered = "";
  for (const ch of String(text)) {
    const code = ch.codePointAt(0) ?? 0;
    if (/\s/.test(ch)) {
      filtered += ch;
    } else if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      // 忽略控制字符
      continue;
    } else {
      filtered += ch;
    }
  }
  return filtered
    .replace(/\s+/g, (match, offset: number, fullStr: string) => {
      const left = offset > 0 ? (fullStr[offset - 1] ?? "") : "";
      const right =
        offset + match.length < fullStr.length
          ? (fullStr[offset + match.length] ?? "")
          : "";
      if (LINE_BREAK_RE.test(match) && CJK_RE.test(left) && CJK_RE.test(right)) {
        return "";
      }
      return " ";
    })
    .trim();
}

/**
 * 格式化参考音频文本（自动补齐 `<|speaker:0|>` 前缀）
 */
export function formatAudio8ReferenceText(text: string): string {
  const cleaned = cleanAudio8Text(text);
  return /<\|speaker:\d+\|>/.test(cleaned) ? cleaned : `<|speaker:0|>${cleaned}`;
}

export interface NpyInt64Matrix {
  shape: [number, number];
  data: BigInt64Array;
}

/**
 * 解析 NumPy `.npy` 二进制文件（`<i8` / `int64` 2D 数组，如 `reference_codes.npy` `[10, 110]`）
 */
export function parseNpyInt64(buf: ArrayBuffer | Uint8Array): NpyInt64Matrix {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x93 ||
    bytes[1] !== 0x4e || // 'N'
    bytes[2] !== 0x55 || // 'U'
    bytes[3] !== 0x4d || // 'M'
    bytes[4] !== 0x50 || // 'P'
    bytes[5] !== 0x59 // 'Y'
  ) {
    throw new Error("无效的 NumPy (.npy) 文件头");
  }
  const major = bytes[6] ?? 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let headerLen = 0;
  let dataOffset = 0;
  if (major === 1) {
    headerLen = view.getUint16(8, true);
    dataOffset = 10 + headerLen;
  } else {
    headerLen = view.getUint32(8, true);
    dataOffset = 12 + headerLen;
  }
  const headerStr = new TextDecoder("latin1").decode(
    bytes.subarray(dataOffset - headerLen, dataOffset)
  );
  const shapeMatch = headerStr.match(/['"]shape['"]\s*:\s*\(\s*(\d+)\s*,\s*(\d+)\s*,?\s*\)/);
  if (!shapeMatch) {
    throw new Error(`无法解析 .npy shape: ${headerStr}`);
  }
  const rows = parseInt(shapeMatch[1] ?? "0", 10);
  const cols = parseInt(shapeMatch[2] ?? "0", 10);
  const count = rows * cols;
  if (bytes.byteLength - dataOffset < count * 8) {
    throw new Error(`reference_codes.npy 数据长度不足：需要 ${count * 8} 字节`);
  }
  const out = new BigInt64Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = view.getBigInt64(dataOffset + i * 8, true);
  }
  return { shape: [rows, cols], data: out };
}

/**
 * 构造 Audio8 DualAR `[1, 11, promptLen]` 输入矩阵（按行优先存储在 `BigInt64Array(11 * promptLen)` 中）
 */
export function buildAudio8Prompt(
  encodeText: (text: string) => number[],
  targetText: string,
  referenceText: string,
  referenceCodes: NpyInt64Matrix,
  semanticBeginId: number = AUDIO8_SEMANTIC_BEGIN_ID,
  numCodebooks: number = AUDIO8_NUM_CODEBOOKS
): { prompt: BigInt64Array; promptLen: number } {
  const target = cleanAudio8Text(targetText);
  if (!target) {
    throw new Error("合成文本不能为空");
  }
  const [rows, refFrames] = referenceCodes.shape;
  if (rows !== numCodebooks || refFrames <= 0) {
    throw new Error(
      `reference_codes 形状应为 [${numCodebooks}, T>0]，当前为 [${rows}, ${refFrames}]`
    );
  }

  const prefixParts = [
    "<|im_start|>system\n",
    "convert the provided text to speech reference to the following:\n\nText:\n",
    formatAudio8ReferenceText(referenceText),
    "\n\nSpeech:\n",
  ];
  const suffixParts = [
    "<|im_end|>\n",
    "<|im_start|>user\n",
    target,
    "<|im_end|>\n",
    "<|im_start|>assistant\n<|voice|>",
  ];

  const prefix: number[] = [];
  for (const part of prefixParts) {
    prefix.push(...encodeText(part));
  }
  const suffix: number[] = [];
  for (const part of suffixParts) {
    suffix.push(...encodeText(part));
  }

  const promptLen = prefix.length + refFrames + suffix.length;
  const totalRows = numCodebooks + 1; // 11
  const prompt = new BigInt64Array(totalRows * promptLen);
  const semBeginBig = BigInt(semanticBeginId);

  // 第 0 行：prefix + (reference_codes[0] + semantic_begin_id) + suffix
  let col = 0;
  for (const id of prefix) {
    prompt[col++] = BigInt(id);
  }
  const refStart = col;
  for (let t = 0; t < refFrames; t++) {
    prompt[col++] = (referenceCodes.data[t] ?? 0n) + semBeginBig;
  }
  for (const id of suffix) {
    prompt[col++] = BigInt(id);
  }

  // 第 1..10 行：在 [refStart .. refStart + refFrames - 1] 填入 reference_codes[0..9]
  for (let cb = 0; cb < numCodebooks; cb++) {
    const dstRowOffset = (cb + 1) * promptLen + refStart;
    const srcRowOffset = cb * refFrames;
    for (let t = 0; t < refFrames; t++) {
      prompt[dstRowOffset + t] = referenceCodes.data[srcRowOffset + t] ?? 0n;
    }
  }

  return { prompt, promptLen };
}

/**
 * 从 `[1, 11, promptLen]` 的 `prompt` 中提取第 `position` 列（形状 `[1, 11, 1]`）
 */
export function extractAudio8PromptColumn(
  prompt: BigInt64Array,
  promptLen: number,
  position: number,
  numCodebooks: number = AUDIO8_NUM_CODEBOOKS
): BigInt64Array {
  const totalRows = numCodebooks + 1;
  const col = new BigInt64Array(totalRows);
  for (let r = 0; r < totalRows; r++) {
    col[r] = prompt[r * promptLen + position] ?? 0n;
  }
  return col;
}

/**
 * Top-K + Top-P + Temperature 采样（与 `runtime.py:_sample` 对齐）
 */
export function sampleAudio8Token(
  logits: Float32Array,
  temperature: number = 0.7,
  topP: number = 0.9,
  topK: number = 50,
  rng: () => number = Math.random
): number {
  const n = logits.length;
  if (n === 0) throw new Error("logits 为空");

  const temp = Math.max(temperature, 1e-5);
  const pThresh = Math.min(Math.max(topP, 1e-5), 1.0);
  const kLimit = Math.min(Math.max(Math.trunc(topK), 1), n);

  // 取前 kLimit 个最大值索引（避免对 4096 全排序的开销）
  const indices = new Int32Array(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  indices.sort((a, b) => (logits[b] ?? -Infinity) - (logits[a] ?? -Infinity));

  const topIndices = indices.subarray(0, kLimit);
  const maxLogit = logits[topIndices[0] ?? 0] ?? 0;

  // 先在原始尺度计算 cumulative probabilities 用于 top-p 截断
  const rawProbs = new Float64Array(kLimit);
  let rawSum = 0;
  for (let i = 0; i < kLimit; i++) {
    const val = logits[topIndices[i] ?? 0] ?? -Infinity;
    const p = Math.exp(val - maxLogit);
    rawProbs[i] = p;
    rawSum += p;
  }

  let cumProb = 0;
  let keptCount = 1;
  for (let i = 0; i < kLimit; i++) {
    cumProb += (rawProbs[i] ?? 0) / (rawSum || 1);
    if (i > 0 && cumProb > pThresh) {
      break;
    }
    keptCount = i + 1;
  }

  // 在保留的候选集上按 temperature 缩放并采样
  const scaledProbs = new Float64Array(keptCount);
  const maxScaled = (logits[topIndices[0] ?? 0] ?? 0) / temp;
  let scaledSum = 0;
  for (let i = 0; i < keptCount; i++) {
    const val = (logits[topIndices[i] ?? 0] ?? -Infinity) / temp;
    const p = Math.exp(val - maxScaled);
    scaledProbs[i] = p;
    scaledSum += p;
  }

  const r = rng() * scaledSum;
  let acc = 0;
  for (let i = 0; i < keptCount; i++) {
    acc += scaledProbs[i] ?? 0;
    if (r <= acc) {
      return topIndices[i] ?? 0;
    }
  }
  return topIndices[keptCount - 1] ?? 0;
}

/**
 * 采样 Slow AR 语义 token（包含首帧禁止 EOS 与 10-token 重复抑制，对齐 `runtime.py:_sample_semantic`）
 */
export function sampleAudio8Semantic(
  logits: Float32Array,
  previous: readonly number[],
  semanticBeginId: number = AUDIO8_SEMANTIC_BEGIN_ID,
  semanticEndId: number = AUDIO8_SEMANTIC_END_ID,
  imEndId: number = AUDIO8_IM_END_ID,
  codebookSize: number = AUDIO8_CODEBOOK_SIZE,
  temperature: number = 0.7,
  topP: number = 0.9,
  topK: number = 50,
  rng: () => number = Math.random
): number {
  const expected = codebookSize + 1;
  const values = new Float32Array(logits.subarray(0, expected));
  if (previous.length === 0) {
    // 首帧禁止采样 EOS，保证至少生成一帧有效语音
    values[expected - 1] = -Infinity;
  }

  const normalIndex = sampleAudio8Token(values, temperature, topP, topK, rng);
  const highIndex = sampleAudio8Token(values, 1.0, 0.9, topK, rng);
  const normal =
    normalIndex === expected - 1 ? imEndId : semanticBeginId + normalIndex;
  const high =
    highIndex === expected - 1 ? imEndId : semanticBeginId + highIndex;

  if (
    normal >= semanticBeginId &&
    normal <= semanticEndId &&
    previous.includes(normal)
  ) {
    return high;
  }
  return normal;
}

/**
 * 原地更新 Slow AR 的 KV Cache：`cache[:, :, :, position, :] = delta`
 * - `cache` 形状: `[24, 1, 2, 2048, 64]`
 * - `delta` 形状: `[24, 1, 2, 64]`
 */
export function updateSlowCacheSlice(
  cache: Float32Array,
  delta: Float32Array,
  position: number,
  numLayers: number = AUDIO8_NUM_LAYERS,
  nLocalHeads: number = AUDIO8_N_LOCAL_HEADS,
  maxSeqLen: number = AUDIO8_MAX_SEQ_LEN,
  headDim: number = AUDIO8_HEAD_DIM
): void {
  const slices = numLayers * nLocalHeads; // 48
  for (let s = 0; s < slices; s++) {
    const srcOffset = s * headDim;
    const dstOffset = (s * maxSeqLen + position) * headDim;
    cache.set(delta.subarray(srcOffset, srcOffset + headDim), dstOffset);
  }
}

/**
 * 原地更新 Fast AR 单层 KV Cache：`cache[:, :, position, :] = delta`
 * - `cache` 形状: `[1, 2, 10, 64]`
 * - `delta` 形状: `[1, 2, 1, 64]`
 */
export function updateFastCacheSlice(
  cache: Float32Array,
  delta: Float32Array,
  position: number,
  nLocalHeads: number = AUDIO8_N_LOCAL_HEADS,
  numCodebooks: number = AUDIO8_NUM_CODEBOOKS,
  headDim: number = AUDIO8_FAST_HEAD_DIM
): void {
  for (let h = 0; h < nLocalHeads; h++) {
    const srcOffset = h * headDim;
    const dstOffset = (h * numCodebooks + position) * headDim;
    cache.set(delta.subarray(srcOffset, srcOffset + headDim), dstOffset);
  }
}

interface ProtoField {
  fn: number;
  wt: number;
  v: number | Uint8Array;
}

function encodeVarint(val: number): Uint8Array {
  const bytes: number[] = [];
  let v = BigInt(val);
  while (v >= 0x80n) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return new Uint8Array(bytes);
}

function readVarint(b: Uint8Array, o: number): [number, number] {
  let res = 0n;
  let shift = 0n;
  let idx = o;
  while (idx < b.length) {
    const byte = b[idx++] ?? 0;
    res |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7n;
  }
  return [Number(res), idx];
}

function readProtoFields(b: Uint8Array): ProtoField[] {
  const out: ProtoField[] = [];
  let o = 0;
  while (o < b.length) {
    const [tag, o1] = readVarint(b, o);
    o = o1;
    const fn = tag >>> 3;
    const wt = tag & 7;
    if (wt === 0) {
      const [v, o2] = readVarint(b, o);
      o = o2;
      out.push({ fn, wt, v });
    } else if (wt === 2) {
      const [len, o2] = readVarint(b, o);
      o = o2 + len;
      out.push({ fn, wt, v: b.subarray(o2, o2 + len) });
    } else if (wt === 1) {
      out.push({ fn, wt, v: b.subarray(o, o + 8) });
      o += 8;
    } else if (wt === 5) {
      out.push({ fn, wt, v: b.subarray(o, o + 4) });
      o += 4;
    } else {
      break;
    }
  }
  return out;
}

function encodeProtoFields(fields: ProtoField[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  for (const f of fields) {
    const tagBytes = encodeVarint((f.fn << 3) | f.wt);
    chunks.push(tagBytes);
    totalLen += tagBytes.length;
    if (f.wt === 0) {
      const valBytes = encodeVarint(f.v as number);
      chunks.push(valBytes);
      totalLen += valBytes.length;
    } else if (f.wt === 2) {
      const payload = f.v as Uint8Array;
      const lenBytes = encodeVarint(payload.length);
      chunks.push(lenBytes, payload);
      totalLen += lenBytes.length + payload.length;
    } else {
      const payload = f.v as Uint8Array;
      chunks.push(payload);
      totalLen += payload.length;
    }
  }
  const res = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    res.set(c, offset);
    offset += c.length;
  }
  return res;
}

function patchBf16TensorProto(tpBuf: Uint8Array): Uint8Array {
  const fs = readProtoFields(tpBuf);
  let dt = 0;
  for (const f of fs) {
    if (f.fn === 2 && f.wt === 0) dt = f.v as number;
  }
  // ONNX TensorProto.DataType: BFLOAT16 = 16, FLOAT = 1
  if (dt !== 16) return tpBuf;
  for (const f of fs) {
    if (f.fn === 2 && f.wt === 0) {
      f.v = 1;
    } else if (f.fn === 9 && f.wt === 2) {
      const raw = f.v as Uint8Array;
      const fp32 = new Uint8Array(raw.length * 2);
      // Little-endian BFLOAT16 (2 bytes) -> Little-endian FLOAT32 (4 bytes: [0, 0, b0, b1])
      for (let i = 0; i < raw.length; i += 2) {
        fp32[i * 2 + 2] = raw[i] ?? 0;
        fp32[i * 2 + 3] = raw[i + 1] ?? 0;
      }
      f.v = fp32;
    }
  }
  return encodeProtoFields(fs);
}

function patchTypeProtoBf16(buf: Uint8Array): Uint8Array {
  const fs = readProtoFields(buf);
  let changed = false;
  for (const f of fs) {
    if (f.fn === 1 && f.wt === 2) {
      const tfs = readProtoFields(f.v as Uint8Array);
      for (const tf of tfs) {
        if (tf.fn === 1 && tf.wt === 0 && tf.v === 16) {
          tf.v = 1;
          changed = true;
        }
      }
      if (changed) {
        f.v = encodeProtoFields(tfs);
      }
    }
  }
  return changed ? encodeProtoFields(fs) : buf;
}

/**
 * 将 ONNX GraphProto 中的 `BFLOAT16` (data_type=16) 常量/初始值张量无损转换为 `FLOAT` (data_type=1)。
 *
 * 背景：`fast_ar_int8.onnx` 中 `/Constant_4`（RoPE 旋转位置表 `[10, 32, 2]`）为 BFLOAT16 并在下游紧跟 `Cast(to=FLOAT)`，
 * 而 `onnxruntime-web` 的 WASM CPU 后端未注册 `Cast(BFloat16 -> Float)` 算子（报错 `Could not find an implementation for Cast(13)`）。
 * 在加载前将该常量直接提升为 FP32 后，下游 `Cast(Float -> Float)` 自动退化并被图优化器折叠消除。
 */
export function patchOnnxBf16ToFp32(onnxBytes: Uint8Array): Uint8Array {
  const top = readProtoFields(onnxBytes);
  const dec = new TextDecoder();
  for (const f of top) {
    if (f.fn === 7 && f.wt === 2) {
      const gfs = readProtoFields(f.v as Uint8Array);
      for (const gf of gfs) {
        if (gf.fn === 5 && gf.wt === 2) {
          gf.v = patchBf16TensorProto(gf.v as Uint8Array);
        } else if (gf.fn === 1 && gf.wt === 2) {
          const nfs = readProtoFields(gf.v as Uint8Array);
          let op = "";
          for (const nf of nfs) {
            if (nf.fn === 4 && nf.wt === 2) {
              op = dec.decode(nf.v as Uint8Array);
            }
          }
          if (op === "Constant") {
            for (const nf of nfs) {
              if (nf.fn === 5 && nf.wt === 2) {
                const afs = readProtoFields(nf.v as Uint8Array);
                for (const af of afs) {
                  if (af.fn === 5 && af.wt === 2) {
                    af.v = patchBf16TensorProto(af.v as Uint8Array);
                  }
                }
                nf.v = encodeProtoFields(afs);
              }
            }
            gf.v = encodeProtoFields(nfs);
          }
        }
        // GraphProto.input (11), output (12), value_info (13): ValueInfoProto 中 TypeProto 的 elem_type
        else if (
          (gf.fn === 11 || gf.fn === 12 || gf.fn === 13) &&
          gf.wt === 2
        ) {
          const vfs = readProtoFields(gf.v as Uint8Array);
          for (const vf of vfs) {
            if (vf.fn === 2 && vf.wt === 2) {
              vf.v = patchTypeProtoBf16(vf.v as Uint8Array);
            }
          }
          gf.v = encodeProtoFields(vfs);
        }
      }
      f.v = encodeProtoFields(gfs);
    }
  }
  return encodeProtoFields(top);
}
