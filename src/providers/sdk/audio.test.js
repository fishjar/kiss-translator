import { buildTranscriptionRequest, parseTranscription } from "./audio";

test.each([["english", "en"], ["chinese", "zh"], ["Japanese", "ja"], ["zh-CN", "zh"], ["unknown", undefined]])(
  "detected language %s becomes a valid request code", (language, expected) => {
    expect(parseTranscription({ status: 200, body: { text: "speech", language } }).language).toBe(expected);
  }
);

test("transcription adapters preserve segment words and OpenAI top-level word timestamps", () => {
  const words = [
    { start: 0, end: 0.5, text: "Hello" },
    { start: 1, end: 2, text: " world." },
  ];
  const segment = { start: 0, end: 2, text: "Hello world.", words };
  expect(
    parseTranscription({
      status: 200,
      body: { text: segment.text, segments: [segment] },
    }).segments
  ).toEqual([segment]);
  expect(
    parseTranscription({
      status: 200,
      body: {
        text: segment.text,
        words: words.map(({ text, ...word }) => ({ ...word, word: text })),
      },
    }).segments
  ).toEqual([segment]);
  expect(
    parseTranscription({
      status: 200,
      body: {
        text: segment.text,
        segments: [{ start: 0, end: 2, text: segment.text }],
        words: words.map(({ text, ...word }) => ({ ...word, word: text })),
      },
    }).segments
  ).toEqual([segment]);
});

test("timestamp requests explicitly select verbose JSON; ordinary requests retain JSON", () => {
  const input = {
    baseUrl: "https://example.invalid/v1",
    model: "whisper-1",
    audio: { assetId: "asset-1" },
  };
  expect(buildTranscriptionRequest(input).body.response_format).toBe("json");
  expect(
    buildTranscriptionRequest({ ...input, requireTimestamps: true }).body
  ).toMatchObject({
    response_format: "verbose_json",
    "timestamp_granularities[]": "segment",
  });
});
