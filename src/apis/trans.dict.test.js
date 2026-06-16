jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({ title: "", description: "", summary: "" }),
}));

jest.mock("../libs/stream", () => ({
  parseStreamingSegments: jest.fn(),
  createStreamingJsonParser: jest.fn(),
  createStreamingSubtitleParser: jest.fn(),
  createRealtimeStreamParser: jest.fn(),
  detectStreamFormat: jest.fn(),
  getStreamDelta: jest.fn(),
}));

import { fetchData, fetchStream } from "../libs/fetch";
import { getStreamDelta } from "../libs/stream";
import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config";
import { handleDict } from "./trans";

const openaiApi = {
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
  apiSlug: "openai_dict",
  key: "test-key",
  model: "test-model",
  url: "https://example.com/chat/completions",
  dictPrompt: "Dictionary rules for {{text}}.",
  dictUserPrompt: "Explain {{text}} in {{context}}.",
  useStream: true,
};

describe("handleDict", () => {
  beforeEach(() => {
    fetchData.mockReset();
    fetchStream.mockReset();
    getStreamDelta.mockReset();
  });

  test("uses dictionary system and user prompts with context placeholders", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "## library\nA place for books." } }],
    });

    const result = await handleDict({
      text: "library",
      from: "English",
      to: "Simplified Chinese",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: openaiApi,
      context: "The library closes at six.",
    });

    expect(result).toContain("library");
    const [, init] = fetchData.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body.stream).toBe(false);
    expect(body.messages[0].content).toBe("Dictionary rules for library.");
    expect(body.messages[0].content).not.toContain("# Context");
    expect(body.messages[body.messages.length - 1].content).toBe(
      "Explain library in The library closes at six.."
    );
  });

  test("falls back to default dictionary user prompt for old api settings", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "## library\nA place for books." } }],
    });

    await handleDict({
      text: "library",
      from: "English",
      to: "Simplified Chinese",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...openaiApi,
        dictUserPrompt: undefined,
      },
      context: "The library closes at six.",
    });

    const [, init] = fetchData.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body.messages[0].content).toBe("Dictionary rules for library.");
    expect(body.messages[0].content).not.toContain("# Context");
    expect(body.messages[body.messages.length - 1].content).toContain(
      "所在段落：The library closes at six."
    );
    expect(body.messages[body.messages.length - 1].content).toContain(
      "library"
    );
  });

  test("allows empty dictionary user prompt", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "## library\nA place for books." } }],
    });

    await handleDict({
      text: "library",
      from: "English",
      to: "Simplified Chinese",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...openaiApi,
        dictUserPrompt: "",
      },
      context: "The library closes at six.",
    });

    const [, init] = fetchData.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body.messages[0].content).toBe("Dictionary rules for library.");
    expect(body.messages[0].content).not.toContain("# Context");
    expect(body.messages[body.messages.length - 1].content).toBe("");
  });

  test("streams dictionary markdown when callback is provided", async () => {
    fetchStream.mockImplementation(async function* () {
      yield JSON.stringify({ chunk: 1 });
      yield JSON.stringify({ chunk: 2 });
    });
    getStreamDelta
      .mockReturnValueOnce("## library\n")
      .mockReturnValueOnce("A place for books.");

    const chunks = [];
    const result = await handleDict({
      text: "library",
      from: "English",
      to: "Simplified Chinese",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: openaiApi,
      context: "The library closes at six.",
      onStreamChunk: (chunk) => chunks.push(chunk.markdown),
    });

    expect(fetchData).not.toHaveBeenCalled();
    expect(fetchStream).toHaveBeenCalledTimes(1);
    const [, init] = fetchStream.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body.stream).toBe(true);
    expect(chunks).toEqual(["## library\n", "## library\nA place for books."]);
    expect(result).toBe("## library\nA place for books.");
  });
});
