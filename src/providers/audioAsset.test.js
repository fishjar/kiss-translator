import { Blob as NodeBlob } from "buffer";
import { audioAsset, validateResponseAudio } from "./audioAsset";

const options = { encoding: "pcm_s16le", sampleRate: 24000, channels: 1 };
const originalBlob = global.Blob;
beforeAll(() => {
  global.Blob = NodeBlob;
});
afterAll(() => {
  global.Blob = originalBlob;
});

test("PCM becomes a playable WAV with unchanged samples and correct timing", async () => {
  const samples = Uint8Array.of(0, 0, 255, 127, 0, 128);
  const blob = audioAsset(
    samples,
    "audio/pcm; rate=24000; channels=1",
    options
  );
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  expect(blob.type).toBe("audio/wav");
  expect(blob.size).toBe(50);
  expect(view.getUint32(0)).toBe(0x52494646);
  expect(view.getUint32(4, true)).toBe(42);
  expect(view.getUint32(8)).toBe(0x57415645);
  expect(view.getUint16(20, true)).toBe(1);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(24000);
  expect(view.getUint32(28, true)).toBe(48000);
  expect(view.getUint16(32, true)).toBe(2);
  expect(view.getUint16(34, true)).toBe(16);
  expect(view.getUint32(40, true)).toBe(samples.length);
  expect(new Uint8Array(bytes, 44)).toEqual(samples);
  const existing = audioAsset(bytes, "audio/wav", options);
  expect(new Uint8Array(await existing.arrayBuffer())).toEqual(
    new Uint8Array(bytes)
  );
});

test.each([
  null,
  { ...options, encoding: "mp3" },
  { ...options, sampleRate: 0 },
  { ...options, sampleRate: 24000.5 },
  { ...options, channels: 0 },
  { ...options, channels: 1.5 },
])("invalid PCM parameters reject: %j", (value) => {
  expect(() => validateResponseAudio(value)).toThrow("PCM");
});

test("big-endian L16 is rejected instead of being relabeled as little-endian WAV", () => {
  expect(() =>
    audioAsset(
      Uint8Array.of(0x7f, 0xff),
      "audio/L16; rate=24000; channels=1",
      options
    )
  ).toThrow("PCM");
});

test("empty, misaligned and non-PCM responses reject; ordinary MP3 is unchanged", async () => {
  for (const [bytes, mime] of [
    [new Uint8Array(), "audio/pcm"],
    [Uint8Array.of(1), "audio/pcm"],
    [Uint8Array.of(1, 2), "application/json"],
    [Uint8Array.of(1, 2), "audio/wav"],
  ])
    expect(() => audioAsset(bytes, mime, options)).toThrow("PCM");
  expect(() =>
    audioAsset(Uint8Array.of(1, 2), "audio/pcm", { ...options, channels: 2 })
  ).toThrow("PCM");
  const mp3 = Uint8Array.of(73, 68, 51, 0);
  const blob = audioAsset(mp3, "audio/mpeg");
  expect(blob.type).toBe("audio/mpeg");
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(mp3);
});

test("WAV allows an odd-sized additional chunk and preserves all bytes", async () => {
  const original = new Uint8Array(
    await audioAsset(Uint8Array.of(1, 2), "audio/pcm", options).arrayBuffer()
  );
  const bytes = new Uint8Array(original.length + 10);
  bytes.set(original.subarray(0, 36));
  bytes.set([74, 85, 78, 75, 1, 0, 0, 0, 42, 0], 36);
  bytes.set(original.subarray(36), 46);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  expect(
    new Uint8Array(await audioAsset(bytes, "audio/wav", options).arrayBuffer())
  ).toEqual(bytes);
});

test("WAV rejects inconsistent lengths, missing chunks and invalid PCM format", async () => {
  const original = new Uint8Array(
    await audioAsset(Uint8Array.of(1, 2), "audio/pcm", options).arrayBuffer()
  );
  const invalid = [];
  for (const [offset, value] of [
    [4, 0],
    [12, 0],
    [36, 0],
    [40, 100],
    [40, 0],
    [24, 0],
    [28, 1],
    [32, 0],
  ]) {
    const bytes = original.slice();
    new DataView(bytes.buffer).setUint32(offset, value, true);
    invalid.push(bytes);
  }
  const truncated = original.slice(0, -1);
  new DataView(truncated.buffer).setUint32(4, truncated.length - 8, true);
  invalid.push(truncated);
  const fake = new Uint8Array(44);
  fake.set(original.subarray(0, 12));
  new DataView(fake.buffer).setUint32(4, fake.length - 8, true);
  invalid.push(fake);
  const odd = original.slice();
  new DataView(odd.buffer).setUint32(40, 1, true);
  invalid.push(odd);
  for (const bytes of invalid)
    expect(() => audioAsset(bytes, "audio/wav", options)).toThrow("WAV");
});
