import { validateInputFile } from "./inputFiles";

export interface RecordingResult {
  audio: Float32Array;
  sampleRate: number;
  duration: number;
}

export interface DecodedAudio {
  audio: Float32Array;
  sampleRate: number;
  duration: number;
}

// 解码本地音频文件为单声道浮点波形（原始采样率，交给 resampleTo16k 处理）。
export async function decodeAudioFile(file: File): Promise<DecodedAudio> {
  await validateInputFile(file, "audio");
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      channels.push(buffer.getChannelData(c));
    }
    const len = buffer.length;
    const mono = new Float32Array(len);
    if (channels.length === 1) {
      mono.set(channels[0]!);
    } else {
      for (let i = 0; i < len; i++) {
        let sum = 0;
        for (const ch of channels) sum += ch[i] ?? 0;
        mono[i] = sum / channels.length;
      }
    }
    return { audio: mono, sampleRate: buffer.sampleRate, duration: buffer.duration };
  } finally {
    void ctx.close();
  }
}

export class MicRecorder {
  private stream: MediaStream;
  private ctx: AudioContext;
  private node: ScriptProcessorNode;
  private chunks: Float32Array[] = [];
  private startedAt = 0;

  private constructor(
    stream: MediaStream,
    ctx: AudioContext,
    node: ScriptProcessorNode
  ) {
    this.stream = stream;
    this.ctx = ctx;
    this.node = node;
  }

  static async start(): Promise<MicRecorder> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const ctx = new AudioContext();
    await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const rec = new MicRecorder(stream, ctx, node);
    node.onaudioprocess = (e: AudioProcessingEvent) => {
      rec.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    src.connect(node);
    node.connect(ctx.destination);
    rec.startedAt = performance.now();
    return rec;
  }

  get elapsedSeconds(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  stop(): RecordingResult {
    this.node.disconnect();
    this.node.onaudioprocess = null;
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const audio = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) {
      audio.set(c, off);
      off += c.length;
    }
    this.chunks = [];
    return {
      audio,
      sampleRate: this.ctx.sampleRate,
      duration: this.elapsedSeconds,
    };
  }
}

export function resampleTo16k(
  audio: Float32Array,
  fromRate: number
): Float32Array {
  if (fromRate === 16000) return audio;
  const ratio = fromRate / 16000;
  const outLen = Math.floor(audio.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, audio.length - 1);
    const frac = pos - i0;
    out[i] = (audio[i0] ?? 0) * (1 - frac) + (audio[i1] ?? 0) * frac;
  }
  return out;
}

function writeStr(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

// 将单声道浮点波形编码为 16bit PCM WAV Blob（用于录音回放）。
export function audioToWavBlob(audio: Float32Array, sampleRate: number): Blob {
  const blockAlign = 2;
  const dataSize = audio.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i] ?? 0));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
