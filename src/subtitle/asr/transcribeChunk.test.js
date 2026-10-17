import { transcribeAudioChunk } from "./transcribeChunk";
import { invokeService } from "../../providers/serviceRuntime";
import { invokeBridgedService } from "../../providers/bridgeInvocation";

jest.mock("../../providers/serviceRuntime", () => ({
  invokeService: jest.fn(),
}));
jest.mock("../../providers/bridgeInvocation", () => ({
  invokeBridgedService: jest.fn(),
}));

const service = {
  apiSlug: "test-asr",
  apiType: "Plugin",
  provider: {
    capabilities: { transcribe: { handler: "transcribe", timestamps: true } },
  },
};
const chunk = {
  startSample: 160000,
  endSample: 192000,
  audio: new Float32Array(32000),
  silent: false,
};

test("compiled local ASR uses the privileged bridge rather than a page BroadcastChannel", async () => {
  invokeBridgedService.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({ text: "local speech" }),
  });
  await expect(
    transcribeAudioChunk(
      {
        apiType: "LocalAI",
        apiSlug: "local",
        modelRef: "sensevoice-small",
        enabledCapabilities: ["transcribe"],
      },
      chunk
    )
  ).resolves.toMatchObject({ timingSource: "audio-chunk" });
  expect(invokeService).not.toHaveBeenCalled();
  expect(invokeBridgedService).toHaveBeenCalledWith(
    "local",
    "transcribe",
    expect.any(Object),
    expect.objectContaining({ signal: undefined })
  );
});

test("an independent WAV accepts optional timestamps and maps every sentence to global video time", async () => {
  const cancel = jest.fn();
  let assets;
  invokeService.mockImplementation((api, capability, input, options) => {
    assets = options.assets;
    expect(input.requireTimestamps).toBe(false);
    expect(assets.get(input.audio).type).toBe("audio/wav");
    return {
      cancel,
      result: Promise.resolve({
        text: "one two",
        segments: [
          { start: 0.1, end: 0.9, text: "one" },
          { start: 1, end: 2, text: "two" },
        ],
      }),
    };
  });
  const result = await transcribeAudioChunk(service, chunk);
  expect(result.segments).toEqual([
    { start: 10.1, end: 10.9, text: "one" },
    { start: 11, end: 12, text: "two" },
  ]);
  expect(result.events[0].segs).toEqual([{ utf8: "one" }]);
  expect(result.events[0].tStartMs).toBeCloseTo(10100);
  expect(assets.entries()).toEqual([]);
  expect(cancel).toHaveBeenCalledTimes(1);
});

test.each([
  { text: "outside", segments: [{ start: 0, end: 3, text: "outside" }] },
  {
    text: "reverse",
    segments: [
      { start: 1, end: 2, text: "a" },
      { start: 0, end: 1, text: "b" },
    ],
  },
])(
  "invalid recognition never produces synchronized subtitles: %j",
  async (result) => {
    invokeService.mockReturnValue({
      cancel: jest.fn(),
      result: Promise.resolve(result),
    });
    await expect(transcribeAudioChunk(service, chunk)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  }
);

test("silence is recorded without calling ASR, and oversized files must first be split", async () => {
  await expect(
    transcribeAudioChunk(service, { ...chunk, silent: true })
  ).resolves.toMatchObject({
    segments: [],
    startSample: 160000,
    endSample: 192000,
    silent: true,
  });
  await expect(
    transcribeAudioChunk({ ...service, asrMaxDurationSeconds: 1 }, chunk)
  ).rejects.toMatchObject({ code: "INPUT_LIMIT_EXCEEDED" });
  await expect(
    transcribeAudioChunk({ ...service, isDisabled: true }, chunk)
  ).rejects.toMatchObject({ code: "CAPABILITY_UNSUPPORTED" });
  expect(invokeService).not.toHaveBeenCalled();
});

test("late ASR results after session cancellation cannot produce new subtitles", async () => {
  let complete;
  invokeService.mockReturnValue({
    cancel: jest.fn(),
    result: new Promise((resolve) => {
      complete = resolve;
    }),
  });
  const controller = new AbortController();
  const task = transcribeAudioChunk(service, chunk, {
    signal: controller.signal,
  });
  controller.abort();
  complete({ text: "old", segments: [{ start: 0, end: 1, text: "old" }] });
  await expect(task).rejects.toHaveProperty("name", "AbortError");
});

test("external ASR runs in the privileged host and holds the slot until its request settles after cancellation", async () => {
  let complete;
  const controller = new AbortController();
  invokeService.mockClear();
  invokeBridgedService.mockImplementation(
    (slug, capability, input, options) => {
      expect(slug).toBe("test-asr");
      expect(capability).toBe("transcribe");
      expect(options.signal).toBeUndefined();
      return {
        cancel: jest.fn(),
        result: new Promise((resolve) => {
          complete = resolve;
        }),
      };
    }
  );
  const external = {
    ...service,
    provider: { ...service.provider, implementation: { kind: "script" } },
  };
  const task = transcribeAudioChunk(external, chunk, {
    signal: controller.signal,
  });
  controller.abort();
  let settled = false;
  task.catch(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  complete({ text: "late", segments: [{ start: 0, end: 1, text: "late" }] });
  await expect(task).rejects.toHaveProperty("name", "AbortError");
  expect(invokeService).not.toHaveBeenCalled();
});

test.each([true, false, undefined])(
  "actual response selects timing regardless of declaration %s",
  async (timestamps) => {
    const api = {
      ...service,
      provider: {
        capabilities: { transcribe: { handler: "transcribe", timestamps } },
      },
    };
    invokeService.mockReturnValue({
      cancel: jest.fn(),
      result: Promise.resolve({ text: "One sentence. Another!" }),
    });
    const textOnly = await transcribeAudioChunk(api, chunk);
    expect(textOnly.timingSource).toBe("audio-chunk");
    expect(textOnly.segments).toEqual([
      { start: 10, end: 12, text: "One sentence. Another!" },
    ]);
    invokeService.mockReturnValue({
      cancel: jest.fn(),
      result: Promise.resolve({
        text: "word",
        segments: [{ start: 0.5, end: 1, text: "word" }],
      }),
    });
    expect(await transcribeAudioChunk(api, chunk)).toMatchObject({
      timingSource: "asr",
      segments: [{ start: 10.5, end: 11, text: "word" }],
    });
  }
);

test.each([{ text: "   " }, { text: "", segments: [] }])(
  "empty transcription produces no cue: %j",
  async (result) => {
    invokeService.mockReturnValue({
      cancel: jest.fn(),
      result: Promise.resolve(result),
    });
    expect(await transcribeAudioChunk(service, chunk)).toMatchObject({
      timingSource: "audio-chunk",
      segments: [],
      events: [],
    });
  }
);

test("text-only services must split requests exceeding five seconds", async () => {
  await expect(
    transcribeAudioChunk(
      { ...service, asrTimestampSupport: "unsupported" },
      {
        ...chunk,
        endSample: chunk.startSample + 80001,
        audio: new Float32Array(80001),
      }
    )
  ).rejects.toMatchObject({ code: "INPUT_LIMIT_EXCEEDED" });
  expect(invokeService).not.toHaveBeenCalled();
});

test("optional genuine progress events are forwarded without requiring a streaming ASR service", async () => {
  const onProgress = jest.fn();
  invokeService.mockReturnValue({
    result: Promise.resolve({ text: "hello" }),
    cancel: jest.fn(),
    finished: Promise.resolve(),
    events: (async function* () {
      yield { type: "progress", progress: 0.5 };
    })(),
  });
  await transcribeAudioChunk(service, chunk, { onProgress });
  expect(onProgress).toHaveBeenCalledWith({ type: "progress", progress: 0.5 });
});
