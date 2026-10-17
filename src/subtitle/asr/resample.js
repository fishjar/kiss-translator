import { ASR_SAMPLE_RATE } from "./audioChunks";

const RADIUS = 16;
const sinc = (value) =>
  value === 0 ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);

/** Continuous low-pass downmix/resampling; filter history never becomes ASR overlap. */
export class AsrResampler {
  constructor(
    sampleRate,
    channels,
    { phase = 0, outputLimit = Infinity } = {}
  ) {
    if (
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      !Number.isInteger(channels) ||
      channels < 1 ||
      channels > 8
    )
      throw new Error("Unsupported PCM format.");
    this.rate = sampleRate;
    if (
      !Number.isFinite(phase) ||
      phase < 0 ||
      (outputLimit !== Infinity &&
        (!Number.isSafeInteger(outputLimit) || outputLimit < 0))
    )
      throw new Error("Invalid resampling interval.");
    this.phase = phase;
    this.outputLimit = outputLimit;
    this.channels = channels;
    this.cutoff = Math.min(1, ASR_SAMPLE_RATE / sampleRate) * 0.95;
    this.buffer = new Float32Array(0);
    this.base = 0;
    this.total = 0;
    this.next = 0;
    this.ended = false;
  }

  push(channels) {
    if (this.ended) throw new Error("Resampler has ended.");
    if (
      !Array.isArray(channels) ||
      channels.length !== this.channels ||
      channels.some(
        (channel) =>
          !(channel instanceof Float32Array) ||
          channel.length !== channels[0].length
      )
    )
      throw new Error("Invalid PCM channels.");
    const length = channels[0].length;
    if (this.next >= this.outputLimit) {
      this.total += length;
      return new Float32Array(0);
    }
    const audio = new Float32Array(this.buffer.length + length);
    audio.set(this.buffer);
    for (let i = 0; i < length; i++) {
      let value = 0;
      for (const channel of channels) {
        if (!Number.isFinite(channel[i]))
          throw new Error("Invalid PCM sample.");
        value += channel[i] / this.channels;
      }
      audio[this.buffer.length + i] = value;
    }
    this.total += length;
    this.buffer = audio;
    return this.drain(false);
  }

  drain(final) {
    const until = final ? this.total : Math.max(0, this.total - RADIUS);
    const count = Math.max(
      0,
      Math.min(
        this.outputLimit,
        Math.ceil(((until - this.phase) * ASR_SAMPLE_RATE) / this.rate)
      ) - this.next
    );
    const output = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const position = this.phase + (this.next++ * this.rate) / ASR_SAMPLE_RATE;
      const center = Math.floor(position);
      let value = 0,
        gain = 0;
      for (let j = center - RADIUS + 1; j <= center + RADIUS; j++) {
        const distance = position - j;
        const weight =
          this.cutoff *
          sinc(distance * this.cutoff) *
          (0.5 + 0.5 * Math.cos((Math.PI * distance) / RADIUS));
        if (j >= 0 && j < this.total)
          value += this.buffer[j - this.base] * weight;
        gain += weight;
      }
      output[i] = value / gain;
    }
    const keep = Math.min(
      this.total,
      Math.max(
        this.base,
        Math.floor(this.phase + (this.next * this.rate) / ASR_SAMPLE_RATE) -
          RADIUS
      )
    );
    this.buffer = this.buffer.slice(keep - this.base);
    this.base = keep;
    if (this.next >= this.outputLimit) {
      this.buffer = new Float32Array(0);
      this.base = this.total;
    }
    return output;
  }

  finish() {
    if (this.ended) return new Float32Array(0);
    this.ended = true;
    const audio = this.drain(true);
    this.buffer = new Float32Array(0);
    return audio;
  }
}
