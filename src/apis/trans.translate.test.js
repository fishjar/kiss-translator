jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

const { TextDecoder, TextEncoder } = require("util");
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

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
  OPT_TRANS_CLAUDE,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_QWENMT,
  OPT_TRANS_YANDEX,
  OPT_TRANS_YANDEXFREE,
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
    // Claude 上下文用例共用同一个按 apiSlug 缓存的历史单例，必须逐例清空。
    clearMsgHistory(OPT_TRANS_CLAUDE);
    // 跨协议上下文历史用例（Chat 家族 / Ollama）同样按 slug 锁存单例，逐例清空。
    clearMsgHistory(OPT_TRANS_OPENAI);
    clearMsgHistory(OPT_TRANS_OLLAMA);
    clearMsgHistory(OPT_TRANS_GEMINI_2);
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("uses Google Cloud plain-text mode and decodes text entities", async () => {
    fetchData.mockResolvedValueOnce({
      data: {
        translations: [
          {
            translatedText: "First isn&#39;t &amp; simple\nSecond",
            detectedSourceLanguage: "en",
          },
        ],
      },
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["First & simple\nSecond"], {
        from: "auto",
        to: "zh-CN",
        fromLang: "auto",
        toLang: "zh-CN",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GOOGLE_CLOUD),
          useStream: false,
        },
        textFormat: "text",
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body).toEqual({
      q: ["First & simple\nSecond"],
      target: "zh-CN",
      format: "text",
    });
    expect(result).toEqual([
      { id: 0, result: ["First isn't & simple\nSecond", "en"] },
    ]);
  });

  test("preserves Google Cloud HTML requests and responses", async () => {
    fetchData.mockResolvedValueOnce({
      data: {
        translations: [
          { translatedText: "A &amp; B<br>", detectedSourceLanguage: "en" },
        ],
      },
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["A &amp; B<br>"], {
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GOOGLE_CLOUD),
          useStream: false,
        },
        textFormat: "html",
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body).toEqual({
      q: ["A &amp; B<br>"],
      target: "zh-CN",
      format: "html",
      source: "en",
    });
    expect(result).toEqual([{ id: 0, result: ["A &amp; B<br>", "en"] }]);
  });

  test("sends batched Yandex Cloud requests with automatic source detection", async () => {
    fetchData.mockResolvedValueOnce({
      translations: [
        { text: "你好", detectedLanguageCode: "en" },
        { text: "世界", detectedLanguageCode: "en" },
      ],
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["Hello", "World"], {
        from: "auto",
        to: "zh",
        fromLang: "auto",
        toLang: "zh-CN",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_YANDEX),
          folderId: "folder-id",
          useStream: false,
        },
        usePool: false,
      })
    );

    expect(fetchData.mock.calls[0][0]).toBe(
      "https://translate.api.cloud.yandex.net/translate/v2/translate"
    );
    expect(fetchData.mock.calls[0][1].headers).toMatchObject({
      "Content-type": "application/json",
      Authorization: "Api-Key test-key",
    });
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).toEqual({
      folderId: "folder-id",
      texts: ["Hello", "World"],
      targetLanguageCode: "zh",
    });
    expect(result).toEqual([
      { id: 0, result: ["你好", "en"] },
      { id: 1, result: ["世界", "en"] },
    ]);
  });

  test("includes an explicit source language in Yandex Cloud requests", async () => {
    fetchData.mockResolvedValueOnce({
      translations: [{ text: "你好", detectedLanguageCode: "en" }],
    });

    await collectAsyncGenerator(
      handleTranslate(["Hello"], {
        from: "en",
        to: "zh",
        fromLang: "en",
        toLang: "zh-CN",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_YANDEX),
          folderId: "folder-id",
          useStream: false,
        },
        usePool: false,
      })
    );

    expect(JSON.parse(fetchData.mock.calls[0][1].body)).toMatchObject({
      sourceLanguageCode: "en",
    });
  });

  test("sends one text through the credential-free Yandex endpoint", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    fetchData.mockResolvedValueOnce({
      code: 200,
      lang: "en-zh",
      text: ["你好！"],
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh",
        fromLang: "en",
        toLang: "zh-CN",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_YANDEXFREE),
          useBatchFetch: false,
          useStream: false,
        },
        usePool: false,
      })
    );

    const requestUrl = new URL(fetchData.mock.calls[0][0]);
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://translate.yandex.net/api/v1/tr.json/translate"
    );
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      id: "00000000000000000000000000000000-0-0",
      srv: "android",
      source_lang: "en",
      target_lang: "zh",
      text: "hello",
    });
    expect(fetchData.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(fetchData.mock.calls[0][1]).not.toHaveProperty("body");
    expect(result).toEqual([{ id: 0, result: ["你好！", "en"] }]);
  });

  test("keeps Google2 HTML encoding inside the request boundary", async () => {
    fetchData.mockResolvedValueOnce([["First isn&#39;t<br>Second"], ["en"]]);

    const result = await collectAsyncGenerator(
      handleTranslate(["First isn't\nSecond"], {
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_GOOGLE_2),
          useStream: false,
        },
        textFormat: "text",
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body).toEqual([
      [["First isn't<br>Second"], "en", "zh-CN"],
      "wt_lib",
    ]);
    expect(result).toEqual([{ id: 0, result: ["First isn't\nSecond", "en"] }]);
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
          model: "gemini-3.6-flash",
          useStream: false,
          temperature: 0.7,
          thinkingMode: "disabled",
          // 3.x 非 lite flash 不支持 minimal，请求层收敛到 low (#1048)
          thinkingEffort: "minimal",
        },
        usePool: false,
      })
    );

    const [url, init] = fetchData.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe(GEMINI_INTERACTIONS_URL);
    expect(body).toMatchObject({
      model: "gemini-3.6-flash",
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

  test("sends one QwenMT user message with native terms and built-in style", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "译文" } }],
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["我看到这个视频后没有笑"], {
        from: "auto",
        to: "English",
        fromLang: "auto",
        toLang: "en",
        langMap: () => "",
        glossary: { component: "规则组件", Keep: "" },
        apiSetting: {
          ...getApiSetting(OPT_TRANS_QWENMT),
          url: "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
          key: "qwen-key",
          model: "qwen-mt-flash",
          useStream: false,
          useBatchFetch: false,
          tone: "technical",
          aiTerms: "React,React\ncomponent,接口组件",
        },
        usePool: false,
      })
    );

    expect(fetchData).toHaveBeenCalledTimes(1);
    const [url, init] = fetchData.mock.calls[0];
    expect(url).toBe(
      "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
    );
    expect(init.headers).toMatchObject({
      "Content-type": "application/json",
      Authorization: "Bearer qwen-key",
    });
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      model: "qwen-mt-flash",
      messages: [{ role: "user", content: "我看到这个视频后没有笑" }],
      translation_options: {
        source_lang: "auto",
        target_lang: "English",
        terms: expect.arrayContaining([
          { source: "component", target: "接口组件" },
          { source: "Keep", target: "Keep" },
          { source: "React", target: "React" },
        ]),
        domains: "Translate in a technical style.",
      },
    });
    expect(body.messages).toHaveLength(1);
    expect(result).toEqual([{ id: 0, result: ["译文"] }]);
  });

  test("passes a custom QwenMT style through without prompt wrapping", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "Legal translation" } }],
    });

    await collectAsyncGenerator(
      handleTranslate(["待翻译文本"], {
        from: "Chinese",
        to: "English",
        fromLang: "zh-CN",
        toLang: "en",
        langMap: () => "",
        glossary: {},
        apiSetting: {
          ...getApiSetting(OPT_TRANS_QWENMT),
          useStream: false,
          useBatchFetch: false,
          tone: "Translate for a legal audience.",
          aiTerms: "",
        },
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body.translation_options).toEqual({
      source_lang: "Chinese",
      target_lang: "English",
      domains: "Translate for a legal audience.",
    });
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
    ).toBe("medium");

    await translate("disabled", "low");
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
            model: "provider/reasoning-model",
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
    expect(JSON.parse(fetchData.mock.calls[1][1].body)).not.toHaveProperty(
      "reasoning"
    );

    await translate("enabled", null);
    expect(JSON.parse(fetchData.mock.calls[2][1].body).reasoning).toEqual({
      enabled: true,
    });

    await translate("enabled", "xhigh");
    expect(JSON.parse(fetchData.mock.calls[3][1].body).reasoning).toEqual({
      effort: "xhigh",
    });

    await translate("disabled");
    expect(JSON.parse(fetchData.mock.calls[4][1].body)).not.toHaveProperty(
      "reasoning"
    );

    await translate("disabled", "none");
    expect(JSON.parse(fetchData.mock.calls[5][1].body).reasoning).toEqual({
      effort: "none",
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
          ...getApiSetting(OPT_TRANS_OPENROUTER),
          useStream: false,
          model: "provider/unknown-model",
          thinkingMode: "enabled",
        },
        usePool: false,
      })
    );
    expect(JSON.parse(fetchData.mock.calls[6][1].body)).not.toHaveProperty(
      "reasoning"
    );
  });

  test("uses OpenRouter settings already normalized by the settings page", async () => {
    fetchData.mockResolvedValue({
      choices: [{ message: { content: "你好" } }],
    });
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_OPENROUTER),
      useStream: false,
      model: "provider/mandatory-model",
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
          thinkingEffort: "high",
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
        apiSetting: {
          ...apiSetting,
          thinkingMode: "disabled",
          thinkingEffort: "low",
        },
        usePool: false,
      })
    );
    expect(JSON.parse(fetchData.mock.calls[1][1].body).reasoning).toEqual({
      effort: "low",
    });
  });

  test("does not inject thinking parameters for unknown models", async () => {
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
    expect(JSON.parse(fetchData.mock.calls[1][1].body)).not.toHaveProperty(
      "reasoning_effort"
    );
    await translate("disabled");
    expect(JSON.parse(fetchData.mock.calls[2][1].body)).not.toHaveProperty(
      "reasoning_effort"
    );
  });

  test("does not inject native Gemini parameters for unknown models", async () => {
    fetchData.mockResolvedValue({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: "你好" }],
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
          useStream: false,
          model: "custom-model",
          thinkingMode: "enabled",
          thinkingEffort: "_default",
        },
        usePool: false,
      })
    );

    expect(
      JSON.parse(fetchData.mock.calls[0][1].body).generation_config
    ).not.toHaveProperty("thinking_level");
  });

  test("keeps DeepSeek enabled when a concrete effort is selected", async () => {
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
          ...getApiSetting(OPT_TRANS_DEEPSEEK),
          useStream: false,
          thinkingMode: "enabled",
          thinkingEffort: "max",
        },
        usePool: false,
      })
    );

    expect(JSON.parse(fetchData.mock.calls[0][1].body)).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "max",
    });
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
          thinkingEffort: "none",
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
          thinkingEffort: "minimal",
        },
        usePool: false,
      })
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "minimal"
    );
  });

  test("uses the final Gemini2 enabled effort without runtime capability parsing", async () => {
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
          thinkingEffort: "high",
        },
        usePool: false,
      })
    );

    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "high"
    );
  });

  test("uses dynamic thinkingBudget by default for Gemini 2.5 generateContent", async () => {
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
          model: "gemini-2.5-flash",
          thinkingMode: "enabled",
          thinkingEffort: -1,
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
          thinkingEffort: "minimal",
        },
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body.generationConfig).toMatchObject({
      temperature: 0.7,
      thinkingConfig: { thinkingLevel: "low" },
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

  test("streams partial JSON text before a batched translation completes", async () => {
    async function* streamChunks() {
      yield JSON.stringify({
        choices: [
          { delta: { content: '{"translations":[{"id":0,"text":"你' } },
        ],
      });
      yield JSON.stringify({
        choices: [
          {
            delta: {
              content: '好","sourceLanguage":"zh"}]}',
            },
          },
        ],
      });
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
        apiSetting: {
          ...getApiSetting(OPT_TRANS_OPENAI),
          streamRenderMode: "realtime",
        },
        usePool: false,
      })
    );

    expect(result).toEqual([
      { id: 0, partialText: "你", isComplete: false },
      { id: 0, partialText: "你好", isComplete: false },
      { id: 0, result: ["你好", "zh"] },
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

  test("calls Edge translate endpoint without auth and string-array body", async () => {
    fetchData.mockResolvedValueOnce([
      {
        detectedLanguage: { language: "en", score: 0.9 },
        translations: [{ text: "你好世界", to: "zh-Hans" }],
      },
      {
        detectedLanguage: { language: "en", score: 0.99 },
        translations: [{ text: "早上好", to: "zh-Hans" }],
      },
    ]);

    const result = await collectAsyncGenerator(
      handleTranslate(["Hello world", "Good morning"], {
        from: "",
        to: "zh-Hans",
        fromLang: "auto",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: {
          ...getApiSetting(OPT_TRANS_MICROSOFT),
          useStream: false,
        },
        usePool: false,
      })
    );

    expect(fetchData).toHaveBeenCalledTimes(1);
    const [url, init] = fetchData.mock.calls[0];
    expect(
      url.startsWith("https://edge.microsoft.com/translate/translatetext?")
    ).toBe(true);
    expect(new URL(url).searchParams.get("from")).toBe("");
    expect(new URL(url).searchParams.get("to")).toBe("zh-Hans");
    expect(new URL(url).searchParams.get("isEnterpriseClient")).toBe("false");
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual(["Hello world", "Good morning"]);
    expect(result).toEqual([
      { id: 0, result: ["你好世界", "en"] },
      { id: 1, result: ["早上好", "en"] },
    ]);
  });

  // ── Claude 历史上下文取值形态归一化 ──

  /**
   * 跑两轮 Claude 非流式请求：第一轮响应用给定 content 形态，
   * 返回第二轮请求体里的 messages（含第一轮写入的历史条目）与两轮抛出的错误。
   *
   * 第一轮 content 形态不含 content[0].text 时（纯字符串 / 单对象 / 缺失），
   * 译文解析路径 parseAIRes 拿到空串 → runNonStream 抛
   * "translate got an unexpected result"，错误照常收集供用例断言"不是 TypeError"。
   * 译文只取首块、历史取全部 text 块：首块不可解析时译文抛错而历史可能照写；
   * 完全无可用文本的轮经 addPair 守卫拦截、整对不写历史。
   */
  async function runClaudeContextRounds(firstContent) {
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_CLAUDE),
      useStream: false,
      useBatchFetch: false,
      useContext: true,
      contextSize: 10,
      nobatchPrompt: "Translate {{text}}.",
      nobatchUserPrompt: "",
    };
    fetchData
      .mockResolvedValueOnce({ role: "assistant", content: firstContent })
      .mockResolvedValueOnce({
        role: "assistant",
        content: [{ type: "text", text: "第二轮译文" }],
      });

    const errors = [];
    for (const text of ["first", "second"]) {
      try {
        await collectAsyncGenerator(
          handleTranslate([text], {
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
      } catch (error) {
        errors.push(error);
      }
    }

    expect(fetchData).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchData.mock.calls[1][1].body);
    return { messages: secondBody.messages, errors };
  }

  test("Claude 历史：标准块数组的模型文本写入历史（旧写法为空壳）", async () => {
    const { messages, errors } = await runClaudeContextRounds([
      { type: "text", text: "你好" },
    ]);

    expect(errors).toEqual([]);
    // [第一轮 user, 第一轮 assistant（历史）, 第二轮 user]
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1]).toEqual({ role: "assistant", content: "你好" });
    expect(messages[2].role).toBe("user");
  });

  test("Claude 历史：多个文本块按顺序拼接，不丢后续块", async () => {
    const { messages, errors } = await runClaudeContextRounds([
      { type: "text", text: "A" },
      { type: "text", text: "B" },
    ]);

    expect(errors).toEqual([]);
    expect(messages[1]).toEqual({ role: "assistant", content: "AB" });
  });

  test("Claude 历史：纯字符串 content 不抛 TypeError 且原样入历史", async () => {
    const { messages, errors } = await runClaudeContextRounds("纯字符串译文");

    // 只允许译文解析路径的空结果错误，绝不能是 .map 打在字符串上的 TypeError。
    for (const error of errors) {
      expect(error.name).not.toBe("TypeError");
    }
    expect(messages[1]).toEqual({
      role: "assistant",
      content: "纯字符串译文",
    });
  });

  test("Claude 历史：单对象 content 取其 text，不把整个对象塞进历史", async () => {
    const { messages, errors } = await runClaudeContextRounds({
      type: "text",
      text: "单对象",
    });

    for (const error of errors) {
      expect(error.name).not.toBe("TypeError");
    }
    expect(messages[1]).toEqual({ role: "assistant", content: "单对象" });
  });

  test("Claude 历史：content 缺失时整对不写历史", async () => {
    const { messages, errors } = await runClaudeContextRounds(undefined);

    // 只允许译文解析路径的空结果错误，绝不能是 TypeError。
    for (const error of errors) {
      expect(error.name).not.toBe("TypeError");
    }
    expect(errors).toHaveLength(1);
    // round 1 无可用文本 → 整对不写（防实现退化为只跳 assistant 保留 user 的孤立形态）
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  // ── 跨协议上下文历史契约：Chat（含 GEMINI_2）/ Ollama / Claude 统一 addPair ──

  const openaiRes = (content, extra = {}) => ({
    choices: [{ message: { role: "assistant", content, ...extra } }],
  });

  async function runTranslateRounds(apiSetting, texts) {
    const errors = [];
    for (const text of texts) {
      try {
        await collectAsyncGenerator(
          handleTranslate([text], {
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
      } catch (error) {
        errors.push(error);
      }
    }
    return { errors };
  }

  /**
   * 跑 N 轮非流式翻译（显式 useStream:false + useBatchFetch:false + useContext:true），
   * 返回每轮请求体与收集到的错误。逐轮 try/catch 收集，畸形轮不中断后续轮次。
   */
  async function runNonStreamContextRounds(apiType, responses, update = {}) {
    const apiSetting = {
      ...getApiSetting(apiType),
      useStream: false,
      useBatchFetch: false,
      useContext: true,
      contextSize: 10,
      nobatchPrompt: "Translate {{text}}.",
      nobatchUserPrompt: "",
      ...update,
    };
    for (const response of responses) {
      fetchData.mockResolvedValueOnce(response);
    }

    const { errors } = await runTranslateRounds(
      apiSetting,
      ["first", "second", "third"].slice(0, responses.length)
    );

    expect(fetchData).toHaveBeenCalledTimes(responses.length);
    const bodies = fetchData.mock.calls.map((call) => JSON.parse(call[1].body));
    return { bodies, errors };
  }

  /** mock 一次流式轮：fetchStream 产出事件对象的 JSON 字符串序列（消费端逐条 JSON.parse）。 */
  const mockStreamRound = (chunks) => {
    async function* streamChunks() {
      for (const chunk of chunks) {
        yield JSON.stringify(chunk);
      }
    }
    fetchStream.mockReturnValueOnce(streamChunks());
  };

  const claudeTextStream = (text) => [
    { type: "message_start" },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    { type: "message_stop" },
  ];

  test("Chat 历史：正常响应整对写入第二轮请求体（OPENAI）", async () => {
    const { bodies, errors } = await runNonStreamContextRounds(
      OPT_TRANS_OPENAI,
      [openaiRes("你好"), openaiRes("第二轮译文")]
    );

    expect(errors).toEqual([]);
    const messages = bodies[1].messages;
    // [system, 第一轮 user, 第一轮 assistant, 第二轮 user]
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2]).toEqual({ role: "assistant", content: "你好" });
    expect(messages[3].role).toBe("user");
  });

  test.each([
    ["content 空串", ""],
    ["content null", null],
    ["content 为数组/parts 形态", { parts: ["x"] }],
  ])(
    "Chat 历史：第一轮 message.content %s → 整对不写（OPENAI）",
    async (_name, content) => {
      const { bodies } = await runNonStreamContextRounds(OPT_TRANS_OPENAI, [
        openaiRes(content),
        openaiRes("第二轮译文"),
      ]);

      const messages = bodies[1].messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
    }
  );

  test("Chat 历史：缺 assistant role → 整对不写（OPENAI）", async () => {
    const { bodies, errors } = await runNonStreamContextRounds(
      OPT_TRANS_OPENAI,
      [{ choices: [{ message: { content: "你好" } }] }, openaiRes("第二轮译文")]
    );

    expect(errors).toEqual([]);
    const messages = bodies[1].messages;
    expect(messages).toHaveLength(2);
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("Chat 历史：contextSize=3 多轮只留完整轮次，不以孤立 assistant 开头（OPENAI）", async () => {
    const { bodies, errors } = await runNonStreamContextRounds(
      OPT_TRANS_OPENAI,
      [openaiRes("一"), openaiRes("二"), openaiRes("三")],
      { contextSize: 3 }
    );

    expect(errors).toEqual([]);
    const messages = bodies[2].messages;
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2]).toEqual({ role: "assistant", content: "二" });
    expect(messages[3].role).toBe("user");
  });

  test("Chat 历史：响应 message 额外字段不进入历史（OPENAI）", async () => {
    const { bodies } = await runNonStreamContextRounds(OPT_TRANS_OPENAI, [
      openaiRes("你好", {
        reasoning_content: "思考",
        tool_calls: [{ id: "t" }],
      }),
      openaiRes("第二轮译文"),
    ]);

    const messages = bodies[1].messages;
    expect(messages[2]).toEqual({ role: "assistant", content: "你好" });
  });

  test("Chat 历史：GEMINI_2 走共享 case，第二轮请求体按 genGemini2 形状（system 首位）", async () => {
    const { bodies, errors } = await runNonStreamContextRounds(
      OPT_TRANS_GEMINI_2,
      [openaiRes("你好"), openaiRes("第二轮译文")]
    );

    expect(errors).toEqual([]);
    const messages = bodies[1].messages;
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2]).toEqual({ role: "assistant", content: "你好" });
    expect(messages[3].role).toBe("user");
  });

  test("Ollama 历史：正常正文进第二轮请求体", async () => {
    const { bodies, errors } = await runNonStreamContextRounds(
      OPT_TRANS_OLLAMA,
      [openaiRes("你好"), openaiRes("第二轮译文")]
    );

    expect(errors).toEqual([]);
    const messages = bodies[1].messages;
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2]).toEqual({ role: "assistant", content: "你好" });
    expect(messages[3].role).toBe("user");
  });

  test.each([
    ["content 空串", ""],
    ["content null", null],
  ])("Ollama 历史：第一轮 %s → 整对不写（非流式）", async (_name, content) => {
    const { bodies } = await runNonStreamContextRounds(OPT_TRANS_OLLAMA, [
      openaiRes(content),
      openaiRes("第二轮译文"),
    ]);

    const messages = bodies[1].messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("Ollama 历史：响应缺 message → 不写历史", async () => {
    const { bodies } = await runNonStreamContextRounds(OPT_TRANS_OLLAMA, [
      { choices: [] },
      openaiRes("第二轮译文"),
    ]);

    const messages = bodies[1].messages;
    expect(messages).toHaveLength(2);
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("Ollama 历史：默认容量只留完整轮次，不以孤立 assistant 开头", async () => {
    const { bodies, errors } = await runNonStreamContextRounds(
      OPT_TRANS_OLLAMA,
      [openaiRes("一"), openaiRes("二"), openaiRes("三")],
      { contextSize: 3 }
    );

    expect(errors).toEqual([]);
    const messages = bodies[2].messages;
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2]).toEqual({ role: "assistant", content: "二" });
    expect(messages[3].role).toBe("user");
  });

  test("Ollama 流式：空 delta 轮整对不写，round 2 体恰为 [system, u2]、round 3 体含 round 2 完整对", async () => {
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_OLLAMA),
      useStream: true,
      useBatchFetch: false,
      useContext: true,
      nobatchPrompt: "Translate {{text}}.",
      nobatchUserPrompt: "",
    };
    // round 1 只有 role delta、无文本 content → fullContent 恒空 → 整对不写
    mockStreamRound([{ choices: [{ delta: { role: "assistant" } }] }]);
    mockStreamRound([
      { choices: [{ delta: { content: "你" } }] },
      { choices: [{ delta: { content: "好" } }] },
    ]);
    mockStreamRound([{ choices: [{ delta: { content: "第三轮" } }] }]);

    const { errors } = await runTranslateRounds(apiSetting, [
      "first",
      "second",
      "third",
    ]);

    expect(fetchStream).toHaveBeenCalledTimes(3);
    expect(errors).toEqual([]);
    // round 2 请求体恰为 [system, u2]（整对原子性，防"只跳 assistant 保留 user"退化）
    const secondBody = JSON.parse(fetchStream.mock.calls[1][1].body);
    expect(secondBody.messages).toHaveLength(2);
    expect(secondBody.messages[0].role).toBe("system");
    expect(secondBody.messages[1].role).toBe("user");
    expect(
      secondBody.messages.filter((m) => m.role === "assistant")
    ).toHaveLength(0);
    // round 3 请求体含 round 2 完整对，不以孤立 assistant 开头
    const thirdBody = JSON.parse(fetchStream.mock.calls[2][1].body);
    expect(thirdBody.messages).toHaveLength(4);
    expect(thirdBody.messages[0].role).toBe("system");
    expect(thirdBody.messages[1].role).toBe("user");
    expect(thirdBody.messages[2]).toEqual({
      role: "assistant",
      content: "你好",
    });
    expect(thirdBody.messages[3].role).toBe("user");
  });

  test("Claude 历史：响应缺 role → 整对不写历史", async () => {
    const { bodies, errors } = await runNonStreamContextRounds(
      OPT_TRANS_CLAUDE,
      [
        { content: [{ type: "text", text: "你好" }] },
        { role: "assistant", content: [{ type: "text", text: "第二轮译文" }] },
      ]
    );

    expect(errors).toEqual([]);
    const messages = bodies[1].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("Claude 历史：content 为非文本类型 → 整对不写历史", async () => {
    const { bodies, errors } = await runNonStreamContextRounds(
      OPT_TRANS_CLAUDE,
      [
        { role: "assistant", content: 123 },
        { role: "assistant", content: [{ type: "text", text: "第二轮译文" }] },
      ]
    );

    // 译文解析空结果错误照抛，但历史整对不写
    expect(errors).toHaveLength(1);
    const messages = bodies[1].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("OPENAI 流式：空 delta 轮整对不写历史，第二轮请求体恰为 [system, user]", async () => {
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_OPENAI),
      useStream: true,
      useBatchFetch: false,
      useContext: true,
      nobatchPrompt: "Translate {{text}}.",
      nobatchUserPrompt: "",
    };
    // round 1 只有 role delta、无文本 content → fullContent 恒空 → 整对不写
    mockStreamRound([{ choices: [{ delta: { role: "assistant" } }] }]);
    mockStreamRound([
      { choices: [{ delta: { content: "你" } }] },
      { choices: [{ delta: { content: "好" } }] },
    ]);

    const { errors } = await runTranslateRounds(apiSetting, [
      "first",
      "second",
    ]);

    // 空 delta 轮零抛错：防异常短路后断言空洞通过
    expect(errors).toEqual([]);
    expect(fetchStream).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchStream.mock.calls[1][1].body);
    expect(secondBody.messages).toHaveLength(2);
    expect(secondBody.messages[0].role).toBe("system");
    expect(secondBody.messages[1].role).toBe("user");
    expect(
      secondBody.messages.filter((m) => m.role === "assistant")
    ).toHaveLength(0);
  });

  test("Claude 流式：content_block_delta 文本累积进历史，第二轮请求体携带完整首轮对", async () => {
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_CLAUDE),
      useStream: true,
      useBatchFetch: false,
      useContext: true,
      contextSize: 10,
      // CLAUDE 默认条目为 realtime 渲染，会产生 partialText 中间产出；钉死 disabled 使结果断言确定。
      streamRenderMode: "disabled",
      nobatchPrompt: "Translate {{text}}.",
      nobatchUserPrompt: "",
    };
    mockStreamRound(claudeTextStream("你好"));
    mockStreamRound(claudeTextStream("第二轮"));

    const result = await collectAsyncGenerator(
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

    expect(fetchStream).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ id: 0, result: ["你好"] }]);
    // Claude messages 无 system 前缀：[第一轮 user, 第一轮 assistant, 第二轮 user]
    const secondBody = JSON.parse(fetchStream.mock.calls[1][1].body);
    expect(secondBody.messages).toHaveLength(3);
    expect(secondBody.messages[1]).toEqual({
      role: "assistant",
      content: "你好",
    });
    expect(secondBody.messages[2].role).toBe("user");
  });

  test("Claude 流式：contextSize=3 轮次完整、空文本 delta 轮整对跳过", async () => {
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_CLAUDE),
      useStream: true,
      useBatchFetch: false,
      useContext: true,
      contextSize: 3,
      streamRenderMode: "disabled",
      nobatchPrompt: "Translate {{text}}.",
      nobatchUserPrompt: "",
    };
    // round 1 无文本 delta → 不写历史对；round 2/3 正常流式
    mockStreamRound([
      { type: "content_block_delta", delta: { type: "text_delta", text: "" } },
      { type: "message_stop" },
    ]);
    mockStreamRound(claudeTextStream("第二轮"));
    mockStreamRound(claudeTextStream("第三轮"));

    await runTranslateRounds(apiSetting, ["first", "second", "third"]);

    expect(fetchStream).toHaveBeenCalledTimes(3);
    // round 2 请求体：仅当轮 user（round 1 空轮整对未写，无孤立 user / assistant）
    const secondBody = JSON.parse(fetchStream.mock.calls[1][1].body);
    expect(secondBody.messages).toHaveLength(1);
    expect(secondBody.messages[0].role).toBe("user");
    // round 3 请求体：round 2 的完整对 + 当轮 user，不以孤立 assistant 开头
    const thirdBody = JSON.parse(fetchStream.mock.calls[2][1].body);
    expect(thirdBody.messages).toHaveLength(3);
    expect(thirdBody.messages[0].role).toBe("user");
    expect(thirdBody.messages[1]).toEqual({
      role: "assistant",
      content: "第二轮",
    });
    expect(thirdBody.messages[2].role).toBe("user");
  });
});

describe("gemini thinking effort clamp (#1048)", () => {
  test("clamps minimal to low for non-lite gemini-3 flash on interactions", async () => {
    fetchData.mockResolvedValueOnce({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: "你好" }],
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
          url: GEMINI_INTERACTIONS_URL,
          model: "gemini-3.7-flash",
          useStream: false,
          thinkingMode: "enabled",
          thinkingEffort: "minimal",
        },
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body.generation_config.thinking_level).toBe("low");
  });

  test("keeps minimal for flash-lite models", async () => {
    fetchData.mockResolvedValueOnce({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: "你好" }],
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
          model: "gemini-3.1-flash-lite",
          useStream: false,
          thinkingMode: "enabled",
          thinkingEffort: "minimal",
        },
        usePool: false,
      })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("minimal");
  });
});
