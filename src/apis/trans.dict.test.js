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
}));

jest.mock("../providers/sceneAdapter", () => ({ invokeTextScene: jest.fn() }));

import { fetchData, fetchStream } from "../libs/fetch";
import { invokeTextScene } from "../providers/sceneAdapter";
import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config";
import { handleDict, handleNativeDict } from "./trans";

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
  });
  test.each([handleDict, handleNativeDict])(
    "passes interface terminology to plugin dictionary task input (%#)",
    async (handler) => {
      invokeTextScene.mockResolvedValueOnce("Definition");
      const apiSetting = {
        ...openaiApi,
        aiTerms: "bank,河岸\nReact,",
        provider: { implementation: { kind: "script" } },
      };
      await handler({ text: "bank", fromLang: "en", toLang: "zh", apiSetting });
      expect(invokeTextScene).toHaveBeenLastCalledWith(
        apiSetting,
        "dictionary",
        expect.objectContaining({ glossary: { bank: "河岸", React: "" } }),
        expect.any(Object)
      );
    }
  );

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

  test("does not fill a missing dictionary user template", async () => {
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
    expect(body.messages.some((m) => m.role === "user")).toBe(false);
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
    expect(body.messages.some((m) => m.role === "user")).toBe(false);
  });

  test("streams dictionary markdown when callback is provided", async () => {
    fetchStream.mockImplementation(async function* () {
      yield JSON.stringify({
        choices: [{ delta: { content: "## library\n" } }],
      });
      yield JSON.stringify({
        choices: [{ delta: { content: "A place for books." } }],
      });
    });

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
