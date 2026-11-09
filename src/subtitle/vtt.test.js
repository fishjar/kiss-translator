import { buildBilingualVtt, buildTranslationOnlyVtt } from "./vtt";

describe("vtt", () => {
  // ASR times are seconds * 1000 and often carry float error,
  // e.g. (480000 / 16000 + 2.3) * 1000 === 32299.999999999996
  const cues = [
    {
      start: 32299.999999999996,
      end: 64349.99999999999,
      text: "Hello",
      translation: "你好",
    },
  ];

  test("buildBilingualVtt rounds fractional milliseconds", () => {
    expect(buildBilingualVtt(cues)).toBe(
      "WEBVTT\n\n1\n00:00:32.300 --> 00:01:04.350\nHello\n你好"
    );
  });

  test("buildTranslationOnlyVtt rounds fractional milliseconds", () => {
    expect(buildTranslationOnlyVtt(cues)).toBe(
      "WEBVTT\n\n1\n00:00:32.300 --> 00:01:04.350\n你好"
    );
  });

  test("keeps integer milliseconds unchanged", () => {
    expect(
      buildBilingualVtt([
        { start: 3723456, end: 3725000, text: "a", translation: "b" },
      ])
    ).toBe("WEBVTT\n\n1\n01:02:03.456 --> 01:02:05.000\na\nb");
  });
});
