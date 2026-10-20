import { AsrResampler } from "./resample";
import { AsrPcmPipeline } from "./pcmPipeline";

test("indexed extraction preserves exact resampled samples without cutting at internal pauses", async () => {
  const audio = Float32Array.from({ length: 32000 }, (_, i) => i < 13000 || i > 26000 ? Math.sin(i / 17) * 0.2 : 0);
  const reference = new AsrResampler(16000, 1);
  const head = reference.push([audio]);
  const tail = reference.finish();
  const expected = new Float32Array(audio.length);
  expected.set(head);
  expected.set(tail, head.length);
  for (const size of [727, 14000]) {
    const output = [];
    const pipeline = new AsrPcmPipeline(30, chunk => output.push(chunk), new AbortController().signal, {
      startSample: 8000, endSample: 30000, fixedRange: true, silent: false,
    });
    for (let i = 0; i < audio.length; i += size)
      await pipeline.push({ channels: [audio.subarray(i, i + size)], sampleRate: 16000, timestamp: i / 16000 });
    await pipeline.finish();
    expect(output).toHaveLength(1);
    expect(output[0].startSample).toBe(8000);
    expect(output[0].endSample).toBe(30000);
    expect(output[0].audio.every((sample, i) => sample === expected[i + 8000])).toBe(true);
    expect(pipeline.chunker).toBeUndefined();
  }
});

test("indexed extraction rejects missing audio and accepts a short final block", async () => {
  const make = callback => new AsrPcmPipeline(30, callback, new AbortController().signal, {
    startSample: 0, endSample: 640, fixedRange: true, silent: true,
  });
  const missing = make(() => {});
  await missing.push({ channels: [new Float32Array(320)], sampleRate: 16000, timestamp: 0 });
  await expect(missing.finish()).rejects.toThrow("does not cover");
  const output = [];
  const complete = make(chunk => output.push(chunk));
  await complete.push({ channels: [new Float32Array(640)], sampleRate: 16000, timestamp: 0 });
  await complete.finish();
  expect(output[0]).toMatchObject({ startSample: 0, endSample: 640, silent: true });
});

test("shortening a suspended chunk iterator preserves its retained tail and all future samples", async () => {
  const audio = Float32Array.from(
    { length: 14 * 16000 + 77 },
    (_, i) => 0.1 + (i % 97) / 1000
  );
  const reference = new AsrResampler(16000, 1);
  const first = reference.push([audio]),
    tail = reference.finish();
  const expected = new Float32Array(first.length + tail.length);
  expected.set(first);
  expected.set(tail, first.length);
  const chunks = [];
  const pipeline = new AsrPcmPipeline(
    8,
    async (chunk) => {
      chunks.push(chunk);
      if (chunks.length === 1) pipeline.shortenLimit(5);
    },
    new AbortController().signal
  );
  await pipeline.push({ channels: [audio], sampleRate: 16000, timestamp: 0 });
  await pipeline.finish();
  let end = 0;
  for (const [index, chunk] of chunks.entries()) {
    expect(chunk.startSample).toBe(end);
    expect(
      chunk.audio.every((value, i) => value === expected[chunk.startSample + i])
    ).toBe(true);
    if (index) expect(chunk.audio.length).toBeLessThanOrEqual(5 * 16000);
    end = chunk.endSample;
  }
  expect(chunks[0].audio.length).toBeGreaterThan(5 * 16000);
  expect(end).toBe(audio.length);
});
