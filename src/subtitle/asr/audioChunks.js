import { asrMaxDurationSeconds } from "../../providers/asrLimits";

export const ASR_SAMPLE_RATE = 16000;
export const ASR_MAX_WAV_BYTES = 8 * 1024 * 1024;
const FRAME_SAMPLES = 320; // 20 ms, independent of downloaded media boundaries.

/** Feed contiguous, resampled mono PCM. Drain each iterator before feeding more. */
export class AsrAudioChunker {
  constructor(
    maxDurationSeconds,
    startSample = 0,
    {
      maxBytes = ASR_MAX_WAV_BYTES,
      maxModelDurationSeconds = Infinity,
      boundaryPaddingSeconds = 0,
    } = {}
  ) {
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes <= 44 ||
      !(maxModelDurationSeconds > 0) ||
      !Number.isFinite(boundaryPaddingSeconds) ||
      boundaryPaddingSeconds < 0
    )
      throw new Error("Invalid ASR input limits.");
    this.limit = Math.min(
      asrMaxDurationSeconds(maxDurationSeconds) * ASR_SAMPLE_RATE,
      Math.floor(
        (Math.min(maxBytes, ASR_MAX_WAV_BYTES) - 44) / 2 / FRAME_SAMPLES
      ) * FRAME_SAMPLES,
      Math.floor((maxModelDurationSeconds * ASR_SAMPLE_RATE) / FRAME_SAMPLES) *
        FRAME_SAMPLES
    );
    if (this.limit < ASR_SAMPLE_RATE)
      throw new Error("ASR input limit is smaller than one second.");
    // Compressed exports include whole AAC frames at both boundaries.
    if (boundaryPaddingSeconds) {
      this.limit =
        Math.floor(
          (this.limit - boundaryPaddingSeconds * ASR_SAMPLE_RATE) /
            FRAME_SAMPLES
        ) * FRAME_SAMPLES;
      if (this.limit < FRAME_SAMPLES)
        throw new Error("ASR input limit cannot fit AAC boundaries.");
    }
    if (!Number.isSafeInteger(startSample) || startSample < 0)
      throw new Error("Invalid audio start sample.");
    this.start = startSample;
    this.buffer = new Float32Array(this.limit);
    this.length = 0;
    this.analyzed = 0;
    this.frames = [];
    this.noise = 0.001;
    this.speech = false;
    this.ended = false;
  }

  shortenLimit(maxDurationSeconds) {
    const limit = Math.min(
      this.limit,
      asrMaxDurationSeconds(maxDurationSeconds) * ASR_SAMPLE_RATE
    );
    if (this.length > limit)
      throw new Error("Cannot shorten a pending audio block.");
    this.limit = limit;
  }

  analyze(end) {
    let sum = 0;
    for (let i = this.analyzed; i < end; i++)
      sum += this.buffer[i] * this.buffer[i];
    const energy = Math.sqrt(sum / (end - this.analyzed));
    const threshold = Math.max(0.006, this.noise * (this.speech ? 2 : 3));
    this.speech = energy >= threshold;
    if (!this.speech)
      this.noise = Math.max(0.0001, this.noise * 0.98 + energy * 0.02);
    this.frames.push({ end, energy, speech: this.speech });
    this.analyzed = end;
  }

  cut(end) {
    const chunk = {
      startSample: this.start,
      endSample: this.start + end,
      audio: this.buffer.slice(0, end),
      silent: !this.frames.some((frame) => frame.end <= end && frame.speech),
    };
    this.buffer.copyWithin(0, end, this.length);
    this.length -= end;
    this.analyzed -= end;
    this.start += end;
    this.frames = this.frames
      .filter((frame) => frame.end > end)
      .map((frame) => ({ ...frame, end: frame.end - end }));
    return chunk;
  }

  boundary() {
    if (this.length >= ASR_SAMPLE_RATE) {
      let silenceStart = this.analyzed;
      for (let i = this.frames.length - 1; i >= 0; i--) {
        if (this.frames[i].speech) break;
        silenceStart = i ? this.frames[i - 1].end : 0;
      }
      if (this.analyzed - silenceStart >= 0.4 * ASR_SAMPLE_RATE) {
        // Keep the second half of the pause intact for the next chunk.
        return Math.max(ASR_SAMPLE_RATE, this.analyzed - 0.2 * ASR_SAMPLE_RATE);
      }
    }
    if (this.length < this.limit) return 0;
    let end = this.limit;
    let energy = Infinity;
    const earliest = Math.max(ASR_SAMPLE_RATE, this.limit - ASR_SAMPLE_RATE);
    for (const frame of this.frames) {
      if (frame.end >= earliest && frame.energy < energy) {
        end = frame.end;
        energy = frame.energy;
      }
    }
    return end;
  }

  *push(audio) {
    if (this.ended) throw new Error("Audio chunker has ended.");
    if (!(audio instanceof Float32Array)) throw new Error("Expected mono PCM.");
    for (const sample of audio)
      if (!Number.isFinite(sample)) throw new Error("Invalid PCM sample.");
    let offset = 0;
    while (offset < audio.length) {
      const count = Math.min(
        FRAME_SAMPLES - (this.length - this.analyzed),
        audio.length - offset,
        this.limit - this.length
      );
      this.buffer.set(audio.subarray(offset, offset + count), this.length);
      offset += count;
      this.length += count;
      if (this.length - this.analyzed === FRAME_SAMPLES) {
        this.analyze(this.length);
        const end = this.boundary();
        if (end) yield this.cut(end);
      }
    }
  }

  *finish() {
    if (this.ended) return;
    this.ended = true;
    if (this.length > this.analyzed) this.analyze(this.length);
    if (this.length) yield this.cut(this.length);
  }
}

/** Independent WAV files, never compressed download fragments. */
export function asrWav(audio) {
  const buffer = new ArrayBuffer(44 + audio.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, ASR_SAMPLE_RATE, true);
  view.setUint32(28, ASR_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, audio.length * 2, true);
  for (let i = 0; i < audio.length; i++) {
    const sample = Math.max(-1, Math.min(1, audio[i]));
    view.setInt16(
      44 + i * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}
