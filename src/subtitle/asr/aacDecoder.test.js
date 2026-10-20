import fs from "fs";
import path from "path";
import { TextDecoder } from "util";
import { IncrementalAacDecoder } from "./aacDecoder";

// Jest 27 ignores package export conditions; load the same pinned parser's CJS build.
jest.mock("mp4box", () =>
  jest.requireActual(require.resolve("mp4box").replace(/\.js$/, ".cjs"))
);

const fixture = () =>
  new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/tone.m4a")));

beforeEach(() => {
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
      this.state = "unconfigured";
      this.queue = [];
    }
    configure() {
      this.state = "configured";
    }
    decode(chunk) {
      this.queue.push(chunk);
    }
    async flush() {
      expect(this.queue.length).toBeLessThanOrEqual(32);
      for (const chunk of this.queue)
        this.callbacks.output({
          timestamp: chunk.timestamp,
          numberOfFrames: 1024,
          numberOfChannels: 1,
          sampleRate: 48000,
          copyTo: (output) => output.fill(0.1),
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
  delete globalThis.TextDecoder;
  delete globalThis.AudioDecoder;
  delete globalThis.EncodedAudioChunk;
});

test("real MP4 samples are extracted before EOF and released in bounded decoder batches", async () => {
  const bytes = fixture();
  let fed = 0,
    first,
    frames = 0;
  const decoder = new IncrementalAacDecoder(async () => {
    first ??= fed;
    frames++;
  });
  for (let i = 0; i < bytes.length; i += 1024) {
    const part = bytes.subarray(i, i + 1024);
    fed += part.length;
    await decoder.append(part);
  }
  await decoder.finish();
  expect(first).toBeLessThan(bytes.length);
  expect(frames).toBe(189);
  expect(decoder.closed).toBe(true);
  expect(decoder.file).toBeUndefined();
  expect(decoder.decoder.state).toBe("closed");
});

test("PCM consumer backpressure holds append; abort prevents later callbacks", async () => {
  const controller = new AbortController();
  let release;
  const onAudio = jest.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const decoder = new IncrementalAacDecoder(onAudio, controller.signal);
  let finished = false;
  const pending = decoder.append(fixture()).finally(() => {
    finished = true;
  });
  pending.catch(() => {});
  for (let i = 0; i < 20 && !release && !finished; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (finished) await pending;
  expect(typeof release).toBe("function");
  expect(finished).toBe(false);
  controller.abort();
  release();
  await expect(pending).rejects.toHaveProperty("name", "AbortError");
  expect(onAudio).toHaveBeenCalledTimes(1);
  expect(decoder.closed).toBe(true);
});

test("unsupported codecs and empty audio fail explicitly", async () => {
  globalThis.AudioDecoder.isConfigSupported = async () => ({
    supported: false,
  });
  const decoder = new IncrementalAacDecoder(jest.fn());
  await expect(decoder.append(fixture())).rejects.toThrow("unsupported");
  expect(decoder.closed).toBe(true);
  const empty = new IncrementalAacDecoder(jest.fn());
  await expect(empty.finish()).rejects.toThrow("No AAC");
  expect(empty.closed).toBe(true);
});

test("a truncated final media payload is never accepted as complete", async () => {
  const decoder = new IncrementalAacDecoder(async () => {});
  await decoder.append(fixture().slice(0, -1000));
  await expect(decoder.finish()).rejects.toThrow("incomplete");
  expect(decoder.closed).toBe(true);
});
