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

test("uncertain language is deferred instead of becoming an empty recognized block", async () => {
  invokeService.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({ text: "", languagePending: true }),
  });
  expect(
    await transcribeAudioChunk(service, chunk, { language: "auto" })
  ).toMatchObject({ languagePending: true, segments: [] });
});

test("detected language and confidence survive the service boundary", async () => {
  invokeService.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({
      text: "你好",
      language: "zh",
      languageConfidence: 0.95,
    }),
  });
  expect(
    await transcribeAudioChunk(service, chunk, { language: "auto" })
  ).toMatchObject({ language: "zh", languageConfidence: 0.95 });
});

test("word timestamps and real pauses are mapped to global video time", async () => {
  invokeService.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({
      text: "one two",
      segments: [
        {
          start: 0.1,
          end: 2,
          text: "one two",
          words: [
            { start: 0.1, end: 0.5, text: "one" },
            { start: 1, end: 2, text: " two" },
          ],
        },
      ],
    }),
  });
  const result = await transcribeAudioChunk(service, chunk);
  expect(result.segments[0].words).toEqual([
    { start: 10.1, end: 10.5, text: "one" },
    { start: 11, end: 12, text: " two" },
  ]);
  expect(result.events).toHaveLength(2);
  expect(result.events[0].dDurationMs).toBeCloseTo(400);
});

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

test("timestamps exceeding chunk duration are clamped rather than discarded", async () => {
  invokeService.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({
      text: "outside",
      segments: [{ start: 0, end: 3, text: "outside" }],
    }),
  });
  const res = await transcribeAudioChunk(service, chunk);
  expect(res.timingSource).toBe("asr");
  expect(res.segments).toEqual([{ start: 10, end: 12, text: "outside" }]);
});

test("unordered timestamps gracefully downgrade to audio-chunk timing without failing", async () => {
  invokeService.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({
      text: "reverse",
      segments: [
        { start: 1, end: 2, text: "a" },
        { start: 0, end: 1, text: "b" },
      ],
    }),
  });
  const res = await transcribeAudioChunk(service, chunk);
  expect(res.timingSource).toBe("audio-chunk");
  expect(res.segments).toEqual([{ start: 10, end: 12, text: "reverse" }]);
});

test("zero-duration trailing punctuation preserves sentence and word timestamps", async () => {
  invokeService.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({
      text: "First. Next ...",
      segments: [
        {
          start: 0,
          end: 0.8,
          text: "First.",
          words: [{ start: 0, end: 0.8, text: "First." }],
        },
        {
          start: 1,
          end: 2,
          text: "Next",
          words: [{ start: 1, end: 2, text: "Next" }],
        },
        { start: 2, end: 2, text: "..." },
      ],
    }),
  });
  const res = await transcribeAudioChunk(service, chunk);
  expect(res.timingSource).toBe("asr");
  expect(res.segments).toEqual([
    {
      start: 10,
      end: 10.8,
      text: "First.",
      words: [{ start: 10, end: 10.8, text: "First." }],
    },
    {
      start: 11,
      end: 12,
      text: "Next...",
      words: [{ start: 11, end: 12, text: "Next..." }],
    },
  ]);
  expect(res.events).toHaveLength(2);
});

test("zero-duration speech is not silently removed as punctuation", async () => {
  invokeService.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({
      text: "First. Missing",
      segments: [
        { start: 0, end: 1, text: "First." },
        { start: 2, end: 2, text: "Missing" },
      ],
    }),
  });
  const res = await transcribeAudioChunk(service, chunk);
  expect(res.timingSource).toBe("audio-chunk");
  expect(res.segments[0].text).toBe("First. Missing");
});

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

test("text-only services must split requests exceeding ten seconds", async () => {
  await expect(
    transcribeAudioChunk(
      { ...service, asrTimestampSupport: "unsupported" },
      {
        ...chunk,
        endSample: chunk.startSample + 160001,
        audio: new Float32Array(160001),
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

test.each([undefined, 30, 600])(
  "local ASR forwards configured timeout %s instead of the bridge default",
  async (httpTimeout) => {
    invokeBridgedService.mockReturnValue({
      cancel: jest.fn(),
      result: Promise.resolve({ text: "speech" }),
    });
    await transcribeAudioChunk(
      {
        apiType: "LocalAI",
        apiSlug: "local",
        modelRef: "whisper-small-timestamped",
        enabledCapabilities: ["transcribe"],
        httpTimeout,
      },
      chunk
    );
    const options = invokeBridgedService.mock.calls.at(-1)[3];
    expect(options.timeoutMs).toBe((httpTimeout ?? 120) * 1000);
    expect(options.deadlineAt).toBeGreaterThan(Date.now());
  }
);
