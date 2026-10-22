import { asrChunkDurationSeconds, asrSupportsTimestamps } from "./timing";
import { AsrAudioChunker } from "./audioChunks";

test.each([true, false, undefined])(
  "declaration selects the duration ceiling: %s",
  (timestamps) => {
    const service = {
      asrMaxDurationSeconds: 30,
      provider: { capabilities: { transcribe: { timestamps } } },
    };
    expect(asrChunkDurationSeconds(service)).toBe(
      timestamps === true ? 30 : 10
    );
    expect(
      asrChunkDurationSeconds({ ...service, asrMaxDurationSeconds: 2 })
    ).toBe(2);
  }
);

test.each([10, 5, 2, 1])(
  "continuous speech retains every sample without overlap at %s seconds",
  (limit) => {
    const audio = Float32Array.from(
      { length: 16000 * 13 + 73 },
      (_, i) => 0.1 + (i % 100) / 1000
    );
    const chunker = new AsrAudioChunker(
      asrChunkDurationSeconds({ asrMaxDurationSeconds: limit })
    );
    const chunks = [];
    for (let i = 0; i < audio.length; i += 3173)
      chunks.push(...chunker.push(audio.subarray(i, i + 3173)));
    chunks.push(...chunker.finish());
    let offset = 0;
    for (const chunk of chunks) {
      expect(chunk.startSample).toBe(offset);
      expect(chunk.endSample - chunk.startSample).toBeLessThanOrEqual(
        limit * 16000
      );
      expect(chunk.audio).toEqual(
        audio.slice(chunk.startSample, chunk.endSample)
      );
      offset = chunk.endSample;
    }
    expect(offset).toBe(audio.length);
  }
);

test.each([true, false, undefined])(
  "external overrides take precedence over declaration %s even for localhost",
  (timestamps) => {
    const service = {
      apiType: "Plugin",
      sourceType: "local",
      url: "http://localhost:9000",
      provider: {
        implementation: { kind: "script" },
        capabilities: { transcribe: { timestamps } },
      },
    };
    expect(
      asrChunkDurationSeconds({ ...service, asrTimestampSupport: "supported" })
    ).toBe(30);
    expect(
      asrChunkDurationSeconds({
        ...service,
        asrTimestampSupport: "unsupported",
      })
    ).toBe(10);
    expect(
      asrChunkDurationSeconds(
        { ...service, asrTimestampSupport: "supported" },
        true
      )
    ).toBe(10);
  }
);

test("local capability ignores overrides and is resolved from the selected model", () => {
  expect(
    asrSupportsTimestamps({
      apiType: "LocalAI",
      modelRef: "sensevoice-small",
      asrTimestampSupport: "unsupported",
    })
  ).toBe(true);
  expect(
    asrChunkDurationSeconds({
      apiType: "LocalAI",
      modelRef: "whisper-base-timestamped",
      asrTimestampSupport: "unsupported",
    })
  ).toBe(30);
  expect(
    asrSupportsTimestamps({
      apiType: "LocalAI",
      modelRef: "unknown",
      asrTimestampSupport: "supported",
      provider: { capabilities: { transcribe: { timestamps: true } } },
    })
  ).toBe(false);
});
