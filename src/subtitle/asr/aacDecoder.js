import { createFile } from "mp4box";

/** Sequential MP4 demuxing. Await append() to propagate PCM backpressure upstream. */
export class IncrementalAacDecoder {
  constructor(onAudio, signal) {
    if (typeof globalThis.AudioDecoder !== "function")
      throw Object.assign(
        new Error("AAC incremental decoding is unavailable in this browser."),
        { code: "AAC_UNSUPPORTED" }
      );
    this.onAudio = onAudio;
    this.signal = signal;
    this.file = createFile(true);
    this.offset = 0;
    this.output = [];
    this.closed = false;
    this.file.onError = () => {
      this.error = new Error("Invalid MP4 audio.");
    };
    this.file.onReady = (info) => {
      if (info.audioTracks.length !== 1 || info.videoTracks.length)
        throw new Error("Expected one isolated audio track.");
      this.track = info.audioTracks[0];
      if (!this.track.codec.startsWith("mp4a.40."))
        throw new Error("Expected AAC audio.");
      const entry = this.file.getTrackById(this.track.id).mdia.minf.stbl.stsd
        .entries[0];
      const description = entry.esds?.esd.descs
        .find((item) => item.tag === 4)
        ?.descs.find((item) => item.tag === 5)?.data;
      if (!description) throw new Error("AAC configuration is missing.");
      this.config = {
        codec: this.track.codec,
        sampleRate: this.track.audio.sample_rate,
        numberOfChannels: this.track.audio.channel_count,
        description,
      };
      this.file.setExtractionOptions(this.track.id, null, { nbSamples: 32 });
    };
    this.file.onSamples = (_, __, samples) => {
      this.file.stop();
      this.pending = samples;
    };
    this.abort = () => this.close();
    signal?.addEventListener("abort", this.abort, { once: true });
    if (signal?.aborted) this.close();
  }

  check() {
    if (this.signal?.aborted)
      throw this.signal.reason || new DOMException("Cancelled", "AbortError");
    if (this.error) throw this.error;
    if (this.closed) throw new Error("AAC decoder is closed.");
  }

  async pump() {
    this.check();
    if (!this.config) return;
    if (!this.decoder) {
      const support = await globalThis.AudioDecoder.isConfigSupported(
        this.config
      );
      this.check();
      if (!support.supported)
        throw Object.assign(new Error("AAC codec is unsupported."), {
          code: "AAC_UNSUPPORTED",
        });
      this.decoder = new globalThis.AudioDecoder({
        output: (data) => {
          try {
            const channels = Array.from(
              { length: data.numberOfChannels },
              (_, planeIndex) => {
                const audio = new Float32Array(data.numberOfFrames);
                data.copyTo(audio, { planeIndex, format: "f32-planar" });
                return audio;
              }
            );
            this.output.push({
              channels,
              sampleRate: data.sampleRate,
              timestamp: data.timestamp / 1e6,
            });
          } catch (error) {
            this.error = error;
          } finally {
            data.close();
          }
        },
        error: () => {
          this.error = new Error("AAC decode failed.");
        },
      });
      this.decoder.configure(this.config);
    }
    while (true) {
      this.check();
      this.file.start();
      this.file.stop();
      const samples = this.pending;
      this.pending = undefined;
      if (!samples?.length) break;
      for (const sample of samples) {
        if (
          this.previousEnd !== undefined &&
          Math.abs(sample.cts - this.previousEnd) > 1
        )
          throw new Error("Audio contains missing or duplicate samples.");
        this.previousEnd = sample.cts + sample.duration;
        this.decoder.decode(
          new globalThis.EncodedAudioChunk({
            type: "key",
            timestamp: Math.round((sample.cts / sample.timescale) * 1e6),
            duration: Math.round((sample.duration / sample.timescale) * 1e6),
            data: sample.data,
          })
        );
      }
      await this.decoder.flush();
      this.check();
      const frames = this.output;
      this.output = [];
      for (const frame of frames) {
        this.check();
        await this.onAudio(frame);
      }
      this.check();
      this.file.releaseUsedSamples(
        this.track.id,
        samples[samples.length - 1].number + 1
      );
      for (const mdat of this.file.mdats) mdat.stream?.cleanBuffers();
    }
  }

  async append(bytes) {
    this.check();
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.byteLength > 16 * 1024 * 1024
    )
      throw new Error("Invalid MP4 download fragment.");
    const buffer = bytes.slice().buffer;
    buffer.fileStart = this.offset;
    this.offset += buffer.byteLength;
    try {
      this.file.appendBuffer(buffer);
      await this.pump();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  async finish() {
    this.check();
    try {
      this.file.flush();
      await this.pump();
      if (this.previousEnd === undefined)
        throw new Error("No AAC samples were decoded.");
      const track = this.file.getTrackById(this.track.id);
      if (track.nextSample !== track.samples.length)
        throw new Error("AAC audio is incomplete.");
    } finally {
      this.close();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.signal?.removeEventListener("abort", this.abort);
    this.file.stop();
    if (this.decoder?.state !== "closed") this.decoder?.close();
    this.pending = undefined;
    this.output = [];
    this.file = undefined;
  }
}
