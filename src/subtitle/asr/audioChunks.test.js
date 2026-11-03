import { AsrAudioChunker, ASR_SAMPLE_RATE, asrWav } from "./audioChunks";

const pcm = (...parts) => {
  const result = new Float32Array(
    parts.reduce((size, part) => size + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
const tone = (seconds, amplitude = 0.2) =>
  Float32Array.from(
    { length: seconds * ASR_SAMPLE_RATE },
    (_, i) => amplitude * Math.sin((i * 2 * Math.PI * 220) / ASR_SAMPLE_RATE)
  );
const collect = (audio, size, limit = 3) => {
  const chunker = new AsrAudioChunker(limit);
  const chunks = [];
  for (let offset = 0; offset < audio.length; offset += size)
    chunks.push(...chunker.push(audio.subarray(offset, offset + size)));
  chunks.push(...chunker.finish());
  return chunks;
};

test("pause boundaries and retained tails do not depend on downloaded fragment sizes", () => {
  const audio = pcm(tone(1.4), new Float32Array(8000), tone(2.4));
  const chunks = collect(audio, 177);
  expect(chunks.map((chunk) => chunk.endSample)).toEqual(
    collect(audio, 12347).map((chunk) => chunk.endSample)
  );
  expect(chunks[0].endSample / ASR_SAMPLE_RATE).toBeCloseTo(1.6);
  expect(pcm(...chunks.map((chunk) => chunk.audio))).toEqual(audio);
  chunks.forEach((chunk, i) => {
    expect(chunk.startSample).toBe(i ? chunks[i - 1].endSample : 0);
    expect(chunk.audio.length).toBeLessThanOrEqual(3 * ASR_SAMPLE_RATE);
  });
});

test.each([1, 2, 30, 300])(
  "continuous speech strictly respects %s seconds",
  (limit) => {
    const chunks = collect(tone(limit + 0.1), 1103, limit);
    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every((chunk) => chunk.audio.length <= limit * ASR_SAMPLE_RATE)
    ).toBe(true);
    expect(chunks.reduce((size, chunk) => size + chunk.audio.length, 0)).toBe(
      (limit + 0.1) * ASR_SAMPLE_RATE
    );
  }
);

test("silence is covered without becoming an ASR request; EOF preserves a partial frame", () => {
  const chunks = collect(new Float32Array(32101), 173);
  expect(chunks.every((chunk) => chunk.silent)).toBe(true);
  expect(chunks[chunks.length - 1].endSample).toBe(32101);
  const short = collect(tone(0.1), 5);
  expect(short).toHaveLength(1);
  expect(short[0].silent).toBe(false);
});

test("the default is 30 seconds; invalid limits and discontinuous identities are not repaired", () => {
  expect(new AsrAudioChunker().limit).toBe(20 * ASR_SAMPLE_RATE);
  for (const limit of [0, 301, 1.1, NaN, "30", null])
    expect(() => new AsrAudioChunker(limit)).toThrow();
  expect(() => new AsrAudioChunker(30, -1)).toThrow();
  const chunker = new AsrAudioChunker(1, 16000);
  expect([...chunker.push(tone(1))][0].startSample).toBe(16000);
  [...chunker.finish()];
  expect([...chunker.finish()]).toEqual([]);
  expect(() => [...chunker.push(tone(1))]).toThrow("ended");
});

test("model and file budgets split below the configured maximum rather than truncate", () => {
  const model = new AsrAudioChunker(300, 0, { maxModelDurationSeconds: 30 });
  expect(model.limit).toBe(30 * ASR_SAMPLE_RATE);
  const file = new AsrAudioChunker(300, 0, { maxBytes: 65536 });
  expect(file.limit * 2 + 44).toBeLessThanOrEqual(65536);
  const input = tone(4);
  const chunks = [...file.push(input), ...file.finish()];
  expect(pcm(...chunks.map((chunk) => chunk.audio))).toEqual(input);
  expect(() => new AsrAudioChunker(30, 0, { maxBytes: 1000 })).toThrow(
    "smaller than one second"
  );
});

test("WAV has exact PCM16/16kHz/mono headers and clipped signed samples", async () => {
  const blob = asrWav(new Float32Array([-2, -0.5, 0, 0.5, 2]));
  expect(blob.type).toBe("audio/wav");
  const bytes = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(blob);
  });
  const view = new DataView(bytes);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint16(34, true)).toBe(16);
  expect(view.getUint32(40, true)).toBe(10);
  expect(
    Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true))
  ).toEqual([-32768, -16384, 0, 16384, 32767]);
});
