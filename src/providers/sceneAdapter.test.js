import {
  invokeTextScene,
  mapSubtitleGroups,
  segmentPlugin,
} from "./sceneAdapter";
import { invokePlugin } from "./bridge";
jest.mock("./bridge", () => ({ invokePlugin: jest.fn() }));

test.each([1])(
  "Plugin API %s subtitle scene sends seconds, real millisecond pauses and full context, retaining player cue times",
  async (apiVersion) => {
    invokePlugin.mockClear();
    invokePlugin.mockReturnValue({
      cancel: jest.fn(),
      events: { async *[Symbol.asyncIterator]() {} },
      result: Promise.resolve({
        groups: [
          { ids: ["0", "1"], text: "Hello world", translation: "你好世界" },
        ],
      }),
    });
    const apiSetting = {
      apiSlug: "subtitle",
      tone: "formal",
      aiTerms: "world,世界",
      provider: { apiVersion, implementation: { kind: "script" } },
    };
    const events = [
      { text: "Hello", start: 1000, end: 1400 },
      { text: "world", start: 1750, end: 2200 },
    ];
    await expect(
      segmentPlugin(events, {
        apiSetting,
        from: "en",
        to: "zh",
        context: "context",
        docInfo: {
          title: "Title",
          description: "Description",
          summary: "Summary",
          url: "https://example.invalid",
        },
      })
    ).resolves.toEqual([
      {
        start: 1000,
        end: 2200,
        text: "Hello world",
        translation: "你好世界",
        _si: 0,
        _ei: 1,
      },
    ]);
    expect(invokePlugin.mock.calls[0][2]).toMatchObject({
      items: [
        { id: "0", text: "Hello", start: 1, end: 1.4, pauseMs: 350 },
        { id: "1", text: "world", start: 1.75, end: 2.2, pauseMs: 0 },
      ],
      context: "context",
      document: {
        title: "Title",
        description: "Description",
        summary: "Summary",
      },
      tone: "formal",
      glossary: { world: "世界" },
    });
  }
);

test("dictionary streams text while returning the authoritative final result", async () => {
  const onText = jest.fn();
  const cancel = jest.fn();
  invokePlugin.mockReturnValue({
    cancel,
    result: Promise.resolve({ text: "final" }),
    events: {
      async *[Symbol.asyncIterator]() {
        yield { type: "text.delta", text: "a" };
        yield { type: "text.delta", text: "b" };
      },
    },
  });
  const api = {
    apiSlug: "existing",
    useStream: true,
    provider: {
      capabilities: { dictionary: { outputModes: ["complete", "stream"] } },
    },
  };
  await expect(
    invokeTextScene(api, "dictionary", { text: "word" }, { onText })
  ).resolves.toBe("final");
  expect(onText.mock.calls).toEqual([["a"], ["ab"]]);
  expect(invokePlugin.mock.calls[0][0]).toBe("existing");
  expect(cancel).toHaveBeenCalledTimes(1);
});

test("subtitle IDs preserve timestamps and reject duplicates, gaps, and reordered coverage", () => {
  const events = [
    { start: 10, end: 20 },
    { start: 21, end: 30 },
  ];
  expect(
    mapSubtitleGroups(
      { groups: [{ ids: ["0", "1"], text: "hello", translation: "你好" }] },
      events
    )
  ).toEqual([
    { start: 10, end: 30, text: "hello", translation: "你好", _si: 0, _ei: 1 },
  ]);
  for (const ids of [["0", "0"], ["1", "0"], ["0"], ["0", "1", "2"]]) {
    expect(() =>
      mapSubtitleGroups({ groups: [{ ids, text: "x" }] }, events)
    ).toThrow();
  }
});

test("a final failure is not replaced by a successful partial text event", async () => {
  invokePlugin.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.reject(new Error("truncated")),
    events: {
      async *[Symbol.asyncIterator]() {
        yield { type: "text.delta", text: "partial" };
      },
    },
  });
  await expect(
    invokeTextScene(
      { apiSlug: "id", provider: { implementation: { kind: "script" } } },
      "summarize",
      {}
    )
  ).rejects.toThrow("truncated");
});
