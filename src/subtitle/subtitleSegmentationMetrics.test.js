import {
  buildSegmentationMetrics,
  getSegmentationMetricErrors,
} from "./subtitleSegmentationMetrics";

describe("subtitleSegmentationMetrics", () => {
  test("treats spacing changes in Chinese as complete text coverage", () => {
    const metrics = buildSegmentationMetrics({
      flatEvents: [
        { text: "你", start: 0, end: 500 },
        { text: "好", start: 500, end: 1000 },
      ],
      cues: [{ text: "你好", start: 0, end: 1000 }],
      fromLang: "zh-CN",
    });

    expect(metrics.textCoveragePercent).toBe(100);
    expect(metrics.missingTextCount).toBe(0);
    expect(metrics.duplicatedTextCount).toBe(0);
  });

  test("reports structural timeline and text coverage errors", () => {
    const metrics = buildSegmentationMetrics({
      flatEvents: [
        { text: "hello", start: 0, end: 500 },
        { text: "world", start: 500, end: 1000 },
      ],
      // 同时构造重叠、重复和遗漏，确保 CLI 与 Playground 使用同一错误分类。
      cues: [
        { text: "hello", start: 0, end: 700 },
        { text: "hello", start: 600, end: 1000 },
      ],
      fromLang: "en",
    });

    expect(getSegmentationMetricErrors(metrics)).toEqual(
      expect.arrayContaining(["overlap", "missing-text", "duplicated-text"])
    );
  });

  test("reports filtered non-speech count and detects leaked non-speech cues", () => {
    const metrics = buildSegmentationMetrics({
      flatEvents: [],
      cues: [{ text: "[Music]", start: 0, end: 1000 }],
      filteredNonSpeechCount: 2,
    });

    expect(metrics.filteredNonSpeechCount).toBe(2);
    expect(metrics.warnings.nonSpeechCueCount).toBe(1);
    expect(getSegmentationMetricErrors(metrics)).toContain("non-speech-leaked");
  });
});
