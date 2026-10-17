import { buildTranscriptionRequest } from "./audio";

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
