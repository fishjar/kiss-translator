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
import {
  DEFAULT_API_LIST,
  GEMINI_GENERATE_CONTENT_URL,
  GEMINI_INTERACTIONS_URL,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENROUTER,
} from "../config";
import { fetchData, fetchStream } from "../libs/fetch";
import { trustedTypesHelper } from "../libs/trustedTypes";
import { clearMsgHistory } from "./history";

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
    clearMsgHistory(OPT_TRANS_GEMINI);
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("uses the stable Gemini Interactions request and parses model output steps", async () => {
    fetchData.mockResolvedValueOnce({
      status: "completed",
      steps: [
        { type: "thought", signature: "sig", summary: [] },
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text: '<root><t id="0" sourceLanguage="en">你好</t></root>',
            },
          ],
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
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GEMINI),
          url: GEMINI_INTERACTIONS_URL,
          useStream: false,
          temperature: 0.7,
          thinkingMode: "disabled",
        },
        usePool: false,
      })
    );

    const [url, init] = fetchData.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe(GEMINI_INTERACTIONS_URL);
    expect(body).toMatchObject({
      model: "test-model",
      stream: false,
      store: false,
      generation_config: {
        max_output_tokens: expect.any(Number),
        thinking_level: "low",
        temperature: 0.7,
      },
    });
    expect(body.input.at(-1)).toMatchObject({ type: "user_input" });
    expect(body).not.toHaveProperty("safety_settings");
    expect(body.generation_config).not.toHaveProperty("top_p");
    expect(body.generation_config).not.toHaveProperty("top_k");
    expect(result).toEqual([{ id: 0, result: ["你好", "en"] }]);
  });

  test("applies all three thinking modes to Gemini Interactions", async () => {
    fetchData.mockResolvedValue({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: "你好" }],
        },
      ],
    });
    const translate = (thinkingMode, thinkingEffort = "_default") =>
      collectAsyncGenerator(
        handleTranslate(["hello"], {
          from: "en",
          to: "zh-CN",
          fromLang: "English",
          toLang: "Chinese",
          langMap: () => "",
          glossary: "",
          apiSetting: {
            ...getApiSetting(OPT_TRANS_GEMINI),
            useStream: false,
            model: "gemini-3-pro-preview",
            thinkingMode,
            thinkingEffort,
          },
          usePool: false,
        })
      );

    await translate("auto", "high");
    expect(
      JSON.parse(fetchData.mock.calls[0][1].body).generation_config
    ).not.toHaveProperty("thinking_level");

    await translate("enabled", "medium");
    expect(
      JSON.parse(fetchData.mock.calls[1][1].body).generation_config
        .thinking_level
    ).toBe("high");

    await translate("disabled");
    expect(
      JSON.parse(fetchData.mock.calls[2][1].body).generation_config
        .thinking_level
    ).toBe("low");
  });

  test("maps all OpenRouter thinking modes to the unified reasoning object", async () => {
    fetchData.mockResolvedValue({
      choices: [{ message: { content: "你好" } }],
    });
    const translate = (thinkingMode, thinkingEffort = "_default") =>
      collectAsyncGenerator(
        handleTranslate(["hello"], {
          from: "en",
          to: "zh-CN",
          fromLang: "English",
          toLang: "Chinese",
          langMap: () => "",
          glossary: "",
          apiSetting: {
            ...getApiSetting(OPT_TRANS_OPENROUTER),
            useStream: false,
            thinkingMode,
            thinkingEffort,
          },
          usePool: false,
        })
      );

    await translate("auto", "high");
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).not.toHaveProperty(
      "reasoning"
    );

    await translate("enabled");
    expect(JSON.parse(fetchData.mock.calls[1][1].body).reasoning).toEqual({
      enabled: true,
    });

    await translate("enabled", "xhigh");
    expect(JSON.parse(fetchData.mock.calls[2][1].body).reasoning).toEqual({
      effort: "high",
    });

    await translate("disabled");
    expect(JSON.parse(fetchData.mock.calls[3][1].body).reasoning).toEqual({
      effort: "none",
    });
  });

  test("uses OpenRouter model metadata for supported and mandatory efforts", async () => {
    fetchData.mockResolvedValue({
      choices: [{ message: { content: "你好" } }],
    });
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_OPENROUTER),
      useStream: false,
      model: "provider/mandatory-model",
      thinkingCapabilities: {
        model: "provider/mandatory-model",
        supportedEfforts: ["high", "medium", "low"],
        mandatory: true,
      },
    };

    await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...apiSetting,
          thinkingMode: "enabled",
          thinkingEffort: "xhigh",
        },
        usePool: false,
      })
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning).toEqual({
      effort: "high",
    });

    await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: { ...apiSetting, thinkingMode: "disabled" },
        usePool: false,
      })
    );
    expect(JSON.parse(fetchData.mock.calls[1][1].body).reasoning).toEqual({
      effort: "low",
    });
  });

  test("applies the OpenAI-compatible high/none baseline in requests", async () => {
    fetchData.mockResolvedValue({
      choices: [{ message: { content: "你好" } }],
    });
    const translate = (thinkingMode) =>
      collectAsyncGenerator(
        handleTranslate(["hello"], {
          from: "en",
          to: "zh-CN",
          fromLang: "English",
          toLang: "Chinese",
          langMap: () => "",
          glossary: "",
          apiSetting: {
            ...getApiSetting(OPT_TRANS_OPENAI),
            useStream: false,
            model: "unknown-model",
            thinkingMode,
          },
          usePool: false,
        })
      );

    await translate("auto");
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).not.toHaveProperty(
      "reasoning_effort"
    );
    await translate("enabled");
    expect(JSON.parse(fetchData.mock.calls[1][1].body).reasoning_effort).toBe(
      "high"
    );
    await translate("disabled");
    expect(JSON.parse(fetchData.mock.calls[2][1].body).reasoning_effort).toBe(
      "none"
    );
  });

  test("maps Gemini2 disabled thinking by model capability", async () => {
    fetchData.mockResolvedValue({
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
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GEMINI_2),
          useStream: false,
          model: "gemini-2.5-flash",
          thinkingMode: "disabled",
        },
        usePool: false,
      })
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "none"
    );

    fetchData.mockClear();
    await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GEMINI_2),
          useStream: false,
          model: "gemini-3.5-flash",
          thinkingMode: "disabled",
        },
        usePool: false,
      })
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "minimal"
    );
  });

  test("enables Gemini2 thinking at the highest effort by default", async () => {
    fetchData.mockResolvedValue({
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
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GEMINI_2),
          useStream: false,
          model: "gemini-3.6-flash",
          thinkingMode: "enabled",
          thinkingEffort: "_default",
        },
        usePool: false,
      })
    );

    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "high"
    );
  });

  test("uses thinkingBudget when enabling Gemini 2.5 through generateContent", async () => {
    fetchData.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: "你好" }] } }],
    });

    await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GEMINI),
          url: GEMINI_GENERATE_CONTENT_URL,
          useStream: false,
          model: "gemini-2.5-flash-lite",
          thinkingMode: "enabled",
          thinkingEffort: "_default",
        },
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: -1,
    });
  });

  test("keeps Legacy Gemini safety settings and applies temperature", async () => {
    fetchData.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              { text: '<root><t id="0" sourceLanguage="en">你好</t></root>' },
            ],
          },
        },
      ],
    });

    await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GEMINI),
          url: GEMINI_GENERATE_CONTENT_URL,
          useStream: false,
          model: "gemini-3.5-flash",
          temperature: 0.7,
          thinkingMode: "disabled",
        },
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body.generationConfig).toMatchObject({
      temperature: 0.7,
      thinkingConfig: { thinkingLevel: "minimal" },
    });
    expect(body.safetySettings).toHaveLength(4);
  });

  test("keeps Gemini context stateless and disables streaming so exact steps can be reused", async () => {
    const firstSteps = [
      {
        type: "user_input",
        content: [{ type: "text", text: "first" }],
      },
      { type: "thought", signature: "sig", summary: [] },
      {
        type: "model_output",
        content: [{ type: "text", text: "第一" }],
      },
    ];
    fetchData
      .mockResolvedValueOnce({ status: "completed", steps: firstSteps })
      .mockResolvedValueOnce({
        status: "completed",
        steps: [
          ...firstSteps,
          {
            type: "user_input",
            content: [{ type: "text", text: "second" }],
          },
          {
            type: "model_output",
            content: [{ type: "text", text: "第二" }],
          },
        ],
      });
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_GEMINI),
      url: GEMINI_INTERACTIONS_URL,
      useBatchFetch: false,
      useContext: true,
      contextSize: 10,
    };

    await collectAsyncGenerator(
      handleTranslate(["first"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting,
        usePool: false,
      })
    );
    await collectAsyncGenerator(
      handleTranslate(["second"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting,
        usePool: false,
      })
    );

    expect(fetchStream).not.toHaveBeenCalled();
    const secondBody = JSON.parse(fetchData.mock.calls[1][1].body);
    expect(secondBody.store).toBe(false);
    expect(secondBody.input.slice(0, firstSteps.length)).toEqual(firstSteps);
    expect(secondBody.input.at(-1).type).toBe("user_input");
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
