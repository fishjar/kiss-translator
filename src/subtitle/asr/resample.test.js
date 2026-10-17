import { AsrResampler } from "./resample";
import { AsrPcmPipeline } from "./pcmPipeline";

const signal = (frequency, count) =>
  Float32Array.from({ length: count }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / 48000)
  );
const resample = (input, size) => {
  const resampler = new AsrResampler(48000, 1);
  const parts = [];
  for (let i = 0; i < input.length; i += size)
    parts.push(resampler.push([input.subarray(i, i + size)]));
  parts.push(resampler.finish());
  const output = new Float32Array(
    parts.reduce((sum, part) => sum + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

test("continuous resampling preserves the tail and is independent of input fragment sizes", () => {
  const input = signal(440, 48007);
  const audio = resample(input, 1024);
  expect(audio).toEqual(resample(input, 113));
  expect(audio.length).toBe(Math.ceil(input.length / 3));
  expect([...audio].every(Number.isFinite)).toBe(true);
});

test("downmixing averages channels; low-pass filtering suppresses frequencies above output Nyquist", () => {
  const resampler = new AsrResampler(48000, 2);
  const zero = resampler.push([
    new Float32Array(1024).fill(1),
    new Float32Array(1024).fill(-1),
  ]);
  expect([...zero].every((value) => value === 0)).toBe(true);
  const rms = (audio) =>
    Math.sqrt(
      audio.slice(100, -100).reduce((sum, value) => sum + value * value, 0) /
        (audio.length - 200)
    );
  expect(rms(resample(signal(440, 48000), 1024))).toBeGreaterThan(0.6);
  expect(rms(resample(signal(12000, 48000), 1024))).toBeLessThan(0.01);
});

test("a seek interval uses the global sample grid and never submits decoder preroll or duplicate tail samples", async () => {
  const chunks = [];
  const pipeline = new AsrPcmPipeline(
    1,
    async (chunk) => chunks.push(chunk),
    undefined,
    { startSample: 16001, endSample: 32005 }
  );
  const pcm = signal(440, 144000);
  for (let i = 0; i < pcm.length; i += 1024)
    await pipeline.push({
      channels: [pcm.subarray(i, i + 1024)],
      sampleRate: 48000,
      timestamp: i / 48000,
    });
  await pipeline.finish();
  expect(chunks[0].startSample).toBe(16001);
  expect(chunks[chunks.length - 1].endSample).toBe(32005);
  expect(chunks.reduce((sum, chunk) => sum + chunk.audio.length, 0)).toBe(
    16004
  );
  const full = resample(pcm, 1024).slice(16001, 32005);
  const actual = Float32Array.from(
    chunks.flatMap((chunk) => Array.from(chunk.audio))
  );
  expect(
    Math.max(...actual.map((value, i) => Math.abs(value - full[i])))
  ).toBeLessThan(0.000001);
});

test("the PCM pipeline submits before EOF and waits for ASR before accepting more work", async () => {
  let release;
  const chunks = [];
  const pipeline = new AsrPcmPipeline(1, (chunk) => {
    chunks.push(chunk);
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  let done = false;
  const pending = pipeline
    .push({ channels: [signal(440, 49000)], sampleRate: 48000, timestamp: 5 })
    .then(() => {
      done = true;
    });
  expect(chunks).toHaveLength(1);
  expect(done).toBe(false);
  expect(chunks[0].startSample).toBe(80000);
  release();
  await pending;
  pipeline.onChunk = async (chunk) => chunks.push(chunk);
  await pipeline.finish();
  expect(chunks[chunks.length - 1].endSample).toBe(
    80000 + Math.ceil(49000 / 3)
  );
});

test("missing PCM is rejected rather than concatenated; cancelled tasks cannot submit tails", async () => {
  const onChunk = jest.fn();
  const controller = new AbortController();
  const pipeline = new AsrPcmPipeline(30, onChunk, controller.signal);
  await pipeline.push({
    channels: [signal(440, 1024)],
    sampleRate: 48000,
    timestamp: 0,
  });
  await expect(
    pipeline.push({
      channels: [signal(440, 1024)],
      sampleRate: 48000,
      timestamp: 1,
    })
  ).rejects.toThrow("discontinuous");
  controller.abort();
  expect(pipeline.chunker).toBeUndefined();
  expect(pipeline.resampler).toBeUndefined();
  await expect(pipeline.finish()).rejects.toHaveProperty("name", "AbortError");
  expect(onChunk).not.toHaveBeenCalled();
});
