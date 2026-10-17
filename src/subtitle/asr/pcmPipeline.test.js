import { AsrResampler } from "./resample";
import { AsrPcmPipeline } from "./pcmPipeline";

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
