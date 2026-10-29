import {
  parseNativeDictionaryResponse,
  parseNativeSubtitleResponse,
  parseNativeSummaryResponse,
} from "./textResponses";
import { OPT_TRANS_CLAUDE, OPT_TRANS_GEMINI } from "../config/apiConstants";

jest.mock("query-string", () => ({
  stringify: (value) => new URLSearchParams(value).toString(),
}));

test("Gemini truncation retry preserves cancellation instead of accepting partial subtitles", async () => {
  const controller = new AbortController();
  const parseSTRes = jest.fn();
  const fetchData = jest.fn(async (_url, _init, options) => {
    expect(options.signal).toBe(controller.signal);
    if (options.signal.aborted)
      throw new DOMException("Cancelled", "AbortError");
  });
  const genTransReq = async () => {
    controller.abort();
    return ["https://mock.invalid/retry", {}];
  };
  await expect(
    parseNativeSubtitleResponse(
      {
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: "partial" }] },
          },
        ],
      },
      {
        apiSetting: {
          apiType: OPT_TRANS_GEMINI,
          model: "gemini-2.5-flash",
          thinkingMode: "enabled",
        },
        events: [{ text: "hello", start: 0, end: 1 }],
        from: "en",
        to: "zh-CN",
        signal: controller.signal,
      },
      { genTransReq, fetchData, parseSTRes }
    )
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchData).toHaveBeenCalledTimes(1);
  expect(parseSTRes).not.toHaveBeenCalled();
});

describe("Claude responses with a thinking block first", () => {
  const thinkingFirst = {
    content: [
      { type: "thinking", thinking: "let me think", signature: "sig" },
      { type: "text", text: " answer " },
    ],
  };

  test("dictionary result is the first text block", () => {
    expect(parseNativeDictionaryResponse(thinkingFirst, OPT_TRANS_CLAUDE)).toBe(
      " answer "
    );
  });

  test("summary result is the first text block, trimmed", () => {
    expect(parseNativeSummaryResponse(thinkingFirst, OPT_TRANS_CLAUDE)).toBe(
      "answer"
    );
  });

  test("a response without a block array still reads content[0].text", () => {
    expect(
      parseNativeSummaryResponse(
        { content: { 0: { text: "single" } } },
        OPT_TRANS_CLAUDE
      )
    ).toBe("single");
  });
});
