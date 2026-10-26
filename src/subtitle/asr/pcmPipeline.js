import { ASR_SAMPLE_RATE, AsrAudioChunker } from "./audioChunks";
import { AsrResampler } from "./resample";

/** Extract an indexed interval without running voice activity detection again. */
class FixedPcmRange {
  constructor(start, end, silent) {
    this.start = start;
    this.audio = new Float32Array(end - start);
    this.length = 0;
    this.silent = silent;
  }
  push(audio) {
    if (this.length + audio.length > this.audio.length)
      throw new Error("PCM exceeds indexed interval.");
    this.audio.set(audio, this.length);
    this.length += audio.length;
    return [];
  }
  *finish() {
    if (this.length !== this.audio.length)
      throw new Error("PCM does not cover indexed interval.");
    yield {
      startSample: this.start,
      endSample: this.start + this.length,
      audio: this.audio,
      silent: this.silent,
    };
  }
}

/** Caller must await each push: at most one ASR chunk plus the retained tail. */
export class AsrPcmPipeline {
  constructor(maxDurationSeconds, onChunk, signal, limits = {}) {
    this.maxDurationSeconds = maxDurationSeconds;
    this.onChunk = onChunk;
    this.signal = signal;
    this.limits = limits;
    this.ended = false;
    this.onAbort = () => this.close();
    signal?.addEventListener("abort", this.onAbort, { once: true });
    if (signal?.aborted) this.close();
  }

  check() {
    if (this.signal?.aborted)
      throw this.signal.reason || new DOMException("Cancelled", "AbortError");
    if (this.ended) throw new Error("ASR PCM pipeline has ended.");
  }

  shortenLimit(maxDurationSeconds) {
    this.maxDurationSeconds = Math.min(
      this.maxDurationSeconds,
      maxDurationSeconds
    );
    this.chunker?.shortenLimit(this.maxDurationSeconds);
  }

  async submit(chunks) {
    for (const chunk of chunks) {
      this.check();
      await this.onChunk(chunk);
      this.check();
    }
  }

  async push({ channels, sampleRate, timestamp }) {
    this.check();
    if (!Number.isFinite(timestamp) || timestamp < 0)
      throw new Error("Invalid PCM timestamp.");
    if (!this.resampler) {
      const startSample =
        this.limits.startSample ?? Math.round(timestamp * ASR_SAMPLE_RATE);
      const phase =
        this.limits.startSample === undefined
          ? 0
          : (startSample / ASR_SAMPLE_RATE - timestamp) * sampleRate;
      if (phase < -0.001)
        throw new Error("PCM starts after the requested interval.");
      this.resampler = new AsrResampler(sampleRate, channels.length, {
        phase: Math.max(0, phase),
        outputLimit:
          this.limits.endSample === undefined
            ? Infinity
            : this.limits.endSample - startSample,
      });
      this.chunker = this.limits.fixedRange
        ? new FixedPcmRange(
            startSample,
            this.limits.endSample,
            this.limits.silent
          )
        : new AsrAudioChunker(this.maxDurationSeconds, startSample, {
            ...this.limits,
            boundaryPaddingSeconds:
              ((this.limits.boundaryPaddingFrames || 0) * channels[0].length) /
              sampleRate,
          });
      this.origin = timestamp;
      this.inputSamples = 0;
    }
    if (
      sampleRate !== this.resampler.rate ||
      Math.abs(timestamp - this.origin - this.inputSamples / sampleRate) >
        1 / sampleRate
    )
      throw new Error("PCM audio is discontinuous; start a new interval.");
    const pcm = this.resampler.push(channels);
    this.inputSamples += channels[0].length;
    await this.submit(this.chunker.push(pcm));
  }

  async finish() {
    try {
      this.check();
      if (this.resampler) {
        await this.submit(this.chunker.push(this.resampler.finish()));
        await this.submit(this.chunker.finish());
      }
    } finally {
      this.close();
    }
  }

  close() {
    this.ended = true;
    this.signal?.removeEventListener("abort", this.onAbort);
    this.resampler = undefined;
    this.chunker = undefined;
  }
}
