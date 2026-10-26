import { buildTranscriptionRequest, parseTranscription } from "./audio";

test.each(["<html>private gateway response</html>", "", '{"text":'])(
  "malformed transcription JSON is normalized without exposing its body: %s",
  (body) => {
    expect(() => parseTranscription({ status: 200, body })).toThrow(
      expect.objectContaining({
        code: "INVALID_RESPONSE",
        message: "Invalid transcription JSON.",
      })
    );
  }
);

test.each(["null", "42", "true", '"speech"', "[]"])(
  "valid non-object JSON is rejected as missing transcription text: %s",
  (body) => {
    expect(() => parseTranscription({ status: 200, body })).toThrow(
      expect.objectContaining({ code: "INVALID_RESPONSE" })
    );
  }
);

test("HTTP errors take precedence over decoding, and provider errors retain their code", () => {
  for (const status of [502, 504])
    expect(() =>
      parseTranscription({ status, body: "<html>gateway</html>" })
    ).toThrow(expect.objectContaining({ code: "HTTP_ERROR" }));
  for (const body of [
    { error: { message: "unavailable" } },
    '{"error":{"message":"unavailable"}}',
  ])
    expect(() => parseTranscription({ status: 200, body })).toThrow(
      expect.objectContaining({
        code: "PROVIDER_ERROR",
        message: "unavailable",
      })
    );
});

test("transcription accepts both decoded objects and JSON text", () => {
  for (const body of [{ text: "speech" }, '{"text":"speech"}'])
    expect(parseTranscription({ status: 200, body })).toEqual({
      text: "speech",
    });
});

test.each([
  ["english", "en"],
  ["chinese", "zh"],
  ["Japanese", "ja"],
  ["zh-CN", "zh"],
  ["unknown", undefined],
])(
  "detected language %s becomes a valid request code",
  (language, expected) => {
    expect(
      parseTranscription({ status: 200, body: { text: "speech", language } })
        .language
    ).toBe(expected);
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
