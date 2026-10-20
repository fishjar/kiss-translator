import fs from "fs";
import path from "path";
import { Blob as NodeBlob } from "buffer";
import { TextDecoder } from "util";
import { createFile } from "mp4box";
import { remuxAac, cropAacSentence } from "./audioExport";

jest.mock("mp4box", () =>
  jest.requireActual(require.resolve("mp4box").replace(/\.js$/, ".cjs"))
);
const fixture = () =>
  new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/tone.m4a")));
const fragments = () => {
  const bytes = fixture(),
    result = [];
  for (let i = 0; i < bytes.length; i += 2048)
    result.push({
      index: result.length,
      data: bytes.slice(i, i + 2048).buffer,
    });
  return result;
};
const parse = (bytes) => {
  const file = createFile(true),
    samples = [];
  let info;
  file.onReady = (metadata) => {
    info = metadata.audioTracks[0];
    file.setExtractionOptions(info.id, null, { nbSamples: 32 });
    file.start();
  };
  file.onSamples = (_, __, batch) => samples.push(...batch);
  const buffer = bytes.slice().buffer;
  buffer.fileStart = 0;
  file.appendBuffer(buffer);
  file.flush();
  return { info, samples };
};
const originalBlob = globalThis.Blob,
  originalDecoder = globalThis.TextDecoder;
beforeEach(() => {
  globalThis.Blob = NodeBlob;
  globalThis.TextDecoder = TextDecoder;
  globalThis.EncodedAudioChunk = class {
    constructor(options) {
      Object.assign(this, options);
    }
  };
  globalThis.AudioDecoder = class {
    static async isConfigSupported() {
      return { supported: true };
    }
    constructor(callbacks) {
      this.callbacks = callbacks;
      this.queue = [];
    }
    configure(config) {
      this.config = config;
      this.state = "configured";
    }
    decode(chunk) {
      this.queue.push(chunk);
    }
    async flush() {
      for (const chunk of this.queue)
        this.callbacks.output({
          timestamp: chunk.timestamp,
          numberOfFrames: 1024,
          numberOfChannels: this.config.numberOfChannels,
          sampleRate: this.config.sampleRate,
          copyTo: (audio) => audio.fill(0.1),
          close() {},
        });
      this.queue = [];
    }
    close() {
      this.state = "closed";
    }
  };
});
afterEach(() => {
  globalThis.Blob = originalBlob;
  globalThis.TextDecoder = originalDecoder;
  delete globalThis.AudioDecoder;
  delete globalThis.EncodedAudioChunk;
});

test("M4A remux preserves every original AAC sample, sample clock and channel count", async () => {
  const original = parse(fixture());
  const result = await remuxAac(fragments());
  const output = parse(new Uint8Array(await result.blob.arrayBuffer()));
  expect(result.blob.type).toBe("audio/mp4");
  expect(output.info.codec).toBe("mp4a.40.2");
  expect(output.info.audio).toEqual(original.info.audio);
  expect(output.samples).toHaveLength(original.samples.length);
  expect(result.durationSeconds).toBeCloseTo(
    original.info.samples_duration / original.info.timescale,
    5
  );
  output.samples.forEach((sample, i) => {
    expect(sample.data).toEqual(original.samples[i].data);
    expect(sample.duration).toBe(original.samples[i].duration);
    expect(sample.dts).toBe(original.samples[i].dts);
  });
});

test("M4A rejects missing segments, truncated payloads and cancellation", async () => {
  const parts = fragments();
  await expect(
    remuxAac(parts.filter((part) => part.index !== 2))
  ).rejects.toHaveProperty("code", "AUDIO_GAP");
  await expect(remuxAac(parts.slice(0, -1))).rejects.toHaveProperty(
    "code",
    "AUDIO_INCOMPLETE"
  );
  const controller = new AbortController();
  controller.abort();
  await expect(
    remuxAac(parts, { signal: controller.signal })
  ).rejects.toHaveProperty("name", "AbortError");
});

test("sentence WAV crops across fragment/decoder-frame boundaries at the original sample rate", async () => {
  const result = await cropAacSentence(fragments(), 950, 1550);
  const bytes = await result.blob.arrayBuffer(),
    header = new DataView(bytes);
  expect(result.sampleRate).toBe(48000);
  expect(result.channels).toBe(1);
  expect(result.frames).toBe(28800);
  expect(header.getUint32(24, true)).toBe(48000);
  expect(header.getUint16(22, true)).toBe(1);
  expect(header.getUint32(40, true)).toBe(28800 * 2);
  expect(header.getInt16(44, true)).toBe(3277);
});

test("sentence export never invents missing audio or silence beyond the actual media", async () => {
  await expect(cropAacSentence(fragments(), 3900, 6000)).rejects.toHaveProperty(
    "code",
    "AUDIO_RANGE_MISSING"
  );
  await expect(cropAacSentence(fragments(), 1000, 999)).rejects.toHaveProperty(
    "code",
    "INVALID_AUDIO_RANGE"
  );
});
