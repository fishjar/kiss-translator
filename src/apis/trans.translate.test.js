jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({}),
}));

import { handleTranslate } from "./trans";
import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config";
import { fetchData, fetchStream } from "../libs/fetch";
import { trustedTypesHelper } from "../libs/trustedTypes";

const getApiSetting = (apiType) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === apiType),
  useStream: true,
  useBatchFetch: true,
  key: "test-key",
  model: "test-model",
  fetchInterval: 0,
  fetchLimit: 1,
  httpTimeout: 1000,
});

const getNobatchApiSetting = (update = {}) => ({
  ...getApiSetting(OPT_TRANS_OPENAI),
  useStream: false,
  useBatchFetch: false,
  systemPrompt: "batch system prompt",
  nobatchPrompt: "Translate {{text}}.",
  nobatchUserPrompt: "",
  ...update,
});

async function collectAsyncGenerator(generator) {
  const result = [];
  for await (const item of generator) {
    result.push(item);
  }
  return result;
}

describe("handleTranslate", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("falls back to non-stream request when stream reader is unsupported", async () => {
    async function* brokenStream() {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'getReader')"
      );
    }

    fetchStream.mockReturnValueOnce(brokenStream());
    fetchData.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([{ text: "你好", sourceLanguage: "en" }]),
          },
        },
      ],
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: getApiSetting(OPT_TRANS_OPENAI),
        usePool: false,
      })
    );

    expect(fetchStream).toHaveBeenCalledTimes(1);
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchStream.mock.calls[0][1].body).stream).toBe(true);
    expect(JSON.parse(fetchData.mock.calls[0][1].body).stream).toBe(false);
    expect(result).toEqual([
      {
        id: 0,
        result: ["你好", "en"],
      },
    ]);
  });

  test("parses non-stream OpenAI XML content and ignores reasoning content", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          logprobs: null,
          message: {
            content:
              '<root>\n    <t id="0" sourceLanguage="en">敏捷的棕色狐狸跳过了懒惰的狗。</t>\n</root>',
            reasoning_content:
              "This reasoning text should not be parsed as translation.",
            role: "assistant",
          },
        },
      ],
      created: 1782579027,
      id: "021782579025384c63a6ac480f44318ff02bbee696f61102e5957",
      model: "doubao-seed-2-0-mini-260428",
      object: "chat.completion",
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["The quick brown fox jumps over the lazy dog."], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_OPENAI),
          useStream: false,
          useBatchFetch: true,
        },
        usePool: false,
      })
    );

    expect(fetchStream).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchData.mock.calls[0][1].body).stream).toBe(false);
    expect(result).toEqual([
      {
        id: 0,
        result: ["敏捷的棕色狐狸跳过了懒惰的狗。", "en"],
      },
    ]);
  });

  test("parses non-stream OpenAI-compatible XML content from DeepSeek-style response", async () => {
    fetchData.mockResolvedValueOnce({
      id: "a729d491-11e8-4a8c-bb6a-c780329e1f99",
      object: "chat.completion",
      created: 1782580528,
      model: "deepseek-v4-flash",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content:
              '<root>\n    <t id="0" sourceLanguage="en">敏捷的棕色狐狸跳过了懒惰的狗。</t>\n</root>',
          },
          logprobs: null,
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 544,
        completion_tokens: 30,
        total_tokens: 574,
        prompt_tokens_details: {
          cached_tokens: 512,
        },
        prompt_cache_hit_tokens: 512,
        prompt_cache_miss_tokens: 32,
      },
      system_fingerprint: "fp_8b330d02d0_prod0820_fp8_kvcache_20260402",
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["The quick brown fox jumps over the lazy dog."], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_OPENAI),
          useStream: false,
          useBatchFetch: true,
        },
        usePool: false,
      })
    );

    expect(fetchStream).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchData.mock.calls[0][1].body).stream).toBe(false);
    expect(result).toEqual([
      {
        id: 0,
        result: ["敏捷的棕色狐狸跳过了懒惰的狗。", "en"],
      },
    ]);
  });

  test("parses OpenAI XML content before sanitized DOM fallback", async () => {
    const createHTMLSpy = jest
      .spyOn(trustedTypesHelper, "createHTML")
      .mockReturnValue("");

    fetchData.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              '<root>\n    <t id="0" sourceLanguage="en">敏捷的棕色狐狸跳过了懒惰的狗。</t>\n</root>',
          },
        },
      ],
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["The quick brown fox jumps over the lazy dog."], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_OPENAI),
          useStream: false,
          useBatchFetch: true,
        },
        usePool: false,
      })
    );

    expect(createHTMLSpy).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 0,
        result: ["敏捷的棕色狐狸跳过了懒惰的狗。", "en"],
      },
    ]);
  });

  test("does not fall back when stream request is aborted", async () => {
    async function* abortedStream() {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    fetchStream.mockReturnValueOnce(abortedStream());

    await expect(
      collectAsyncGenerator(
        handleTranslate(["hello"], {
          from: "en",
          to: "zh-CN",
          fromLang: "English",
          toLang: "Chinese",
          langMap: () => "",
          glossary: "",
          apiSetting: getApiSetting(OPT_TRANS_OPENAI),
          usePool: false,
        })
      )
    ).rejects.toThrow("The operation was aborted.");

    expect(fetchData).not.toHaveBeenCalled();
  });

  test("streams non-batch plain text when batch fetch is disabled", async () => {
    async function* streamChunks() {
      yield JSON.stringify({ choices: [{ delta: { content: "你" } }] });
      yield JSON.stringify({ choices: [{ delta: { content: "好" } }] });
    }

    fetchStream.mockReturnValueOnce(streamChunks());

    const result = await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: getNobatchApiSetting({
          useStream: true,
          streamRenderMode: "realtime",
        }),
        usePool: false,
      })
    );

    expect(fetchStream).toHaveBeenCalledTimes(1);
    expect(fetchData).not.toHaveBeenCalled();
    expect(JSON.parse(fetchStream.mock.calls[0][1].body).stream).toBe(true);
    expect(result).toEqual([
      { id: 0, partialText: "你", isComplete: false },
      { id: 0, partialText: "你好", isComplete: false },
      { id: 0, result: ["你好"] },
    ]);
  });

  test("does not append external docInfo to system prompt without placeholders", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "你好" } }],
    });

    await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: getNobatchApiSetting(),
        usePool: false,
        docInfo: {
          title: "Doc title",
          description: "Doc description",
          summary: "Doc summary",
          context: "Doc context",
        },
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);

    expect(body.messages[0].content).toBe("Translate hello.");
    expect(body.messages[0].content).not.toContain("# Context");
    expect(body.messages[0].content).not.toContain("Doc context");
  });

  test("replaces external docInfo placeholders in user prompt", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "你好" } }],
    });

    await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: getNobatchApiSetting({
          nobatchUserPrompt: "Title: {{title}}\nContext: {{context}}",
        }),
        usePool: false,
        docInfo: {
          title: "Doc title",
          context: "Doc context",
        },
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);

    expect(body.messages[0].content).toBe("Translate hello.");
    expect(body.messages[body.messages.length - 1].content).toBe(
      "Title: Doc title\nContext: Doc context"
    );
  });
});
