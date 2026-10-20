import { createAsrTextProcessor, effectiveAsrLimits } from "./processing";
import { apiTranslate, apiSummarizeContext } from "../../apis";
import { aiSegment } from "../youtubeAiSegmentation";
import { AsrPauseGate } from "./pause";
jest.mock("../../apis", () => ({
  apiTranslate: jest.fn(),
  apiSubtitle: jest.fn(),
  apiSummarizeContext: jest.fn(),
}));
jest.mock("../../libs/docInfo", () => ({
  getDocInfo: () => ({ title: "video" }),
}));
jest.mock("../youtubeAiSegmentation", () => ({ aiSegment: jest.fn() }));
const identity = { videoId: "kSQknoHMFtk", sourceLanguage: "en" };
const segments = [
  { start: 1, end: 2, text: "Hello." },
  { start: 2.5, end: 3.5, text: "Goodbye." },
];
const setting = {
  toLang: "zh-CN",
  apiSetting: { apiType: "Google", apiSlug: "google" },
  transApis: [],
  useAlgorithmBreaker: "rule",
  longSentenceThreshold: 100,
};
beforeEach(() => jest.clearAllMocks());

test("pause between translated cues saves the current response and holds the next service call", async () => {
  const gate = new AsrPauseGate(), controller = new AbortController();
  const wait = signal => gate.wait(signal);
  let finish;
  apiTranslate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  apiTranslate.mockResolvedValueOnce({ trText: ["第二句"] });
  const update = jest.fn();
  const pending = createAsrTextProcessor(setting, identity).translate([
    { start: 0, end: 1000, text: "first" }, { start: 1000, end: 2000, text: "second" },
  ], controller.signal, update, wait);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 0));
  gate.pause();
  finish({ trText: ["第一句"] });
  while (!update.mock.calls.length) await new Promise(resolve => setTimeout(resolve, 0));
  expect(update.mock.calls[0][0][0].translation).toBe("第一句");
  expect(apiTranslate).toHaveBeenCalledTimes(1);
  gate.resume();
  expect((await pending).map(cue => cue.translation)).toEqual(["第一句", "第二句"]);
  expect(apiTranslate).toHaveBeenCalledTimes(2);
});

test.each(["rule", "statistical"])("%s splits a long ASR segment at real word boundaries", async (mode) => {
  const words = Array.from({ length: 30 }, (_, i) => ({
    start: i * 0.6, end: i * 0.6 + 0.3, text: `word${i}`,
  }));
  const processor = createAsrTextProcessor({ ...setting, useAlgorithmBreaker: mode }, identity);
  const cues = await processor.segment([{ start: 0, end: 18, text: words.map(w => w.text).join(" "), words }], new AbortController().signal);
  expect(cues.length).toBeGreaterThan(1);
  expect(cues.map(c => c.text).join(" ")).toBe(words.map(w => w.text).join(" "));
  for (const cue of cues) {
    expect(cue.end - cue.start).toBeLessThanOrEqual(mode === "rule" ? 10000 : 7000);
    expect(cue.text.length).toBeLessThanOrEqual(100);
    expect(words.some(w => Math.abs(w.start * 1000 - cue.start) < 0.001)).toBe(true);
    expect(words.some(w => Math.abs(w.end * 1000 - cue.end) < 0.001)).toBe(true);
  }
});

test("word-level AI boundaries are accepted and invalid words cannot drop source text", async () => {
  const apiSetting = { ...setting, segSlug: "ai", transApis: [{ apiSlug: "ai", apiType: "OpenAI" }] };
  aiSegment.mockResolvedValue([{ start: 1000, end: 1500, text: "Hello" }, { start: 1600, end: 2000, text: "world." }]);
  const input = [{ start: 1, end: 2, text: "Hello world.", words: [
    { start: 1, end: 1.5, text: "Hello" }, { start: 1.6, end: 2, text: " world." },
  ] }];
  expect(await createAsrTextProcessor(apiSetting, identity).segment(input, new AbortController().signal)).toHaveLength(2);
  const invalid = [{ ...input[0], text: "Hello missing world." }];
  const fallback = await createAsrTextProcessor(setting, identity).segment(invalid, new AbortController().signal);
  expect(fallback[0].text).toBe("Hello missing world.");
});

test.each(["rule", "statistical"])("%s retains Chinese text and sentence punctuation with word-level input", async mode => {
  const words = ["今天", "测试", "字幕", "断句。", "明天", "继续", "验证。"].map((text, i) => ({
    start: i * 0.6, end: i * 0.6 + 0.4, text,
  }));
  const text = words.map(w => w.text).join("");
  const processor = createAsrTextProcessor({ ...setting, useAlgorithmBreaker: mode }, { ...identity, sourceLanguage: "zh-CN" });
  const cues = await processor.segment([{ start: 0, end: 5, text, words }], new AbortController().signal);
  expect(cues.map(c => c.text).join("")).toBe(text);
});
test("builtin segmentation retains real ASR boundaries without synthesizing word times", async () => {
  const processor = createAsrTextProcessor(setting, identity);
  const cues = await processor.segment(segments, new AbortController().signal);
  expect(cues.length).toBeGreaterThan(0);
  for (const cue of cues) {
    expect(segments.some((segment) => segment.start * 1000 === cue.start)).toBe(
      true
    );
    expect(segments.some((segment) => segment.end * 1000 === cue.end)).toBe(
      true
    );
  }
  expect(aiSegment).not.toHaveBeenCalled();
});
test("AI segmentation cannot invent sub-segment boundaries; it falls back to timestamped originals", async () => {
  aiSegment.mockResolvedValue([{ start: 1100, end: 1800, text: "Hello" }]);
  const processor = createAsrTextProcessor(
    {
      ...setting,
      segSlug: "ai",
      transApis: [{ apiSlug: "ai", apiType: "OpenAI" }],
    },
    identity
  );
  const cues = await processor.segment(segments, new AbortController().signal);
  expect(aiSegment).toHaveBeenCalledTimes(1);
  expect(cues.some((cue) => cue.start === 1100)).toBe(false);
});
test("translation retries reuse completed cues and publish decoded translations incrementally", async () => {
  apiTranslate.mockResolvedValue({ trText: ["你好 &amp; 再见"] });
  const processor = createAsrTextProcessor(setting, identity),
    onUpdate = jest.fn();
  const cues = [
    { start: 0, end: 1000, text: "done", translation: "完成" },
    { start: 1000, end: 2000, text: "hello", translation: "" },
  ];
  const result = await processor.translate(
    cues,
    new AbortController().signal,
    onUpdate
  );
  expect(apiTranslate).toHaveBeenCalledTimes(1);
  expect(result[1].translation).toBe("你好 & 再见");
  expect(cues[1].translation).toBe("");
  expect(onUpdate).toHaveBeenCalledTimes(1);
});
test("same-language and aborted work do not call a translation service", async () => {
  const processor = createAsrTextProcessor(
      { ...setting, toLang: "en" },
      identity
    ),
    controller = new AbortController();
  expect(
    (await processor.translate([{ text: "Hello" }], controller.signal))[0]
      .translation
  ).toBe("Hello");
  controller.abort();
  await expect(
    processor.translate([{ text: "Next" }], controller.signal)
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(apiTranslate).not.toHaveBeenCalled();
});
test("network services retain the bridge file budget without loading local AI settings", async () => {
  expect(await effectiveAsrLimits({ apiType: "OpenAI" })).toEqual({
    maxBytes: 8 * 1024 * 1024,
  });
});

test("audio-block translation enriches context without invoking segmentation", async () => {
  apiSummarizeContext.mockResolvedValue("video context");
  apiTranslate.mockResolvedValue({ trText: ["translated"] });
  const processor = createAsrTextProcessor(
    {
      ...setting,
      aiContextSlug: "context",
      transApis: [{ apiSlug: "context", apiType: "OpenAI" }],
    },
    identity
  );
  const signal = new AbortController().signal;
  const cue = {
    start: 1000,
    end: 3000,
    text: "One. Two!",
    timingSource: "audio-chunk",
  };
  expect((await processor.translate([cue], signal))[0]).toMatchObject({
    ...cue,
    translation: "translated",
  });
  await processor.translate([{ ...cue, text: "Next" }], signal);
  expect(apiSummarizeContext).toHaveBeenCalledTimes(1);
  expect(apiTranslate.mock.calls[0][0].docInfo.summary).toBe("video context");
  expect(aiSegment).not.toHaveBeenCalled();
});
