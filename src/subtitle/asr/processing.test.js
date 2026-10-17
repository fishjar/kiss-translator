import { createAsrTextProcessor, effectiveAsrLimits } from "./processing";
import { apiTranslate, apiSummarizeContext } from "../../apis";
import { aiSegment } from "../youtubeAiSegmentation";
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
