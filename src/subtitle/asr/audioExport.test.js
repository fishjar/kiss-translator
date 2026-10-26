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
});
afterEach(() => {
  globalThis.Blob = originalBlob;
  globalThis.TextDecoder = originalDecoder;
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

test("M4A range crops across fragments, preserves AAC payloads and rebases the sample clock", async () => {
  const original = parse(fixture());
  const result = await cropAacSentence(fragments(), 950, 1550);
  const output = parse(new Uint8Array(await result.blob.arrayBuffer()));
  const selected = original.samples.filter(
    (sample) =>
      (sample.cts + sample.duration) / sample.timescale > 0.95 &&
      sample.cts / sample.timescale < 1.55
  );
  expect(result.blob.type).toBe("audio/mp4");
  expect(output.info.audio).toEqual(original.info.audio);
  expect(output.samples).toHaveLength(selected.length);
  expect(result.startMs).toBeLessThanOrEqual(950);
  expect(result.endMs).toBeGreaterThanOrEqual(1550);
  expect(950 - result.startMs).toBeLessThan(1024 / 48);
  expect(result.endMs - 1550).toBeLessThan(1024 / 48);
  output.samples.forEach((sample, i) => {
    expect(sample.data).toEqual(selected[i].data);
    expect(sample.duration).toBe(selected[i].duration);
    expect(sample.dts).toBe(selected[i].dts - selected[0].dts);
  });
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

test("range export reuses initialization plus later fragmented media without earlier downloads", async () => {
  const full = await remuxAac(fragments());
  const bytes = new Uint8Array(await full.blob.arrayBuffer());
  const parts = [];
  let offset = 0,
    initEnd;
  while (offset < bytes.length) {
    const size = new DataView(bytes.buffer, offset).getUint32(0);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === "moov") initEnd = offset + size;
    if (type === "moof") {
      const mdatOffset = offset + size;
      const mdatSize = new DataView(bytes.buffer, mdatOffset).getUint32(0);
      parts.push({
        index: parts.length + 1,
        data: bytes.slice(offset, mdatOffset + mdatSize).buffer,
      });
      offset = mdatOffset + mdatSize;
    } else offset += size;
  }
  const selected = [
    { index: 0, data: bytes.slice(0, initEnd).buffer },
    ...parts.slice(38, 80),
  ];
  const output = await cropAacSentence(selected, 950, 1550);
  const samples = parse(
    new Uint8Array(await output.blob.arrayBuffer())
  ).samples;
  expect(output.startMs).toBeLessThanOrEqual(950);
  expect(output.endMs).toBeGreaterThanOrEqual(1550);
  expect(samples[0].dts).toBe(0);
  expect(samples.map((sample) => sample.data)).toEqual(
    parse(fixture())
      .samples.filter(
        (sample) =>
          (sample.cts + sample.duration) / sample.timescale > 0.95 &&
          sample.cts / sample.timescale < 1.55
      )
      .map((sample) => sample.data)
  );
  await expect(
    cropAacSentence(
      selected.filter((part) => part.index !== 51),
      950,
      1550
    )
  ).rejects.toHaveProperty("code", "AUDIO_GAP");
});

test("range export bounds its output, handles the beginning/end, and honors cancellation while reading", async () => {
  const original = parse(fixture());
  const last = original.samples.at(-1);
  const end = ((last.cts + last.duration) * 1000) / last.timescale;
  const result = await cropAacSentence(fragments(), 0, end);
  expect(result.startMs).toBe(0);
  expect(result.endMs).toBeCloseTo(end, 5);
  await expect(
    cropAacSentence(fragments(), 0, 1000, { maxBytes: 100 })
  ).rejects.toHaveProperty("code", "AUDIO_EXPORT_TOO_LARGE");
  const controller = new AbortController();
  async function* cancelled() {
    yield fragments()[0];
    controller.abort();
    yield fragments()[1];
  }
  await expect(
    cropAacSentence(cancelled(), 0, 1000, { signal: controller.signal })
  ).rejects.toHaveProperty("name", "AbortError");
  await expect(
    cropAacSentence([{ index: 0, data: new Uint8Array([0]).buffer }], 0, 1000)
  ).rejects.toHaveProperty("code", "AUDIO_INCOMPLETE");
});
