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
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_MICROSOFT,
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

  test("capture 非流式：先捕获真实请求，再捕获原始响应", async () => {
    // 诊断通路（Playground 术语测试用）：capture 必须拿到真正发出的请求与未解析的响应，
    // 且不得改变翻译输出。删掉 trans.js 里 capture?.onRequest / capture?.onResponse
    // 任一行，本用例都会变红。
    const rawResponse = { choices: [{ message: { content: "你好" } }] };
    fetchData.mockResolvedValueOnce(rawResponse);

    const capture = { onRequest: jest.fn(), onResponse: jest.fn() };
    const result = await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: getNobatchApiSetting({
          nobatchUserPrompt: "Translate: {{text}}",
        }),
        usePool: false,
        capture,
      })
    );

    expect(result).toEqual([{ id: 0, result: ["你好"] }]);
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(capture.onRequest).toHaveBeenCalledTimes(1);
    expect(capture.onResponse).toHaveBeenCalledTimes(1);

    // onRequest 的三个参数就是真正交给 fetchData 的 (input, init) 与本轮 userMsg。
    const [capturedInput, capturedInit, capturedUserMsg] =
      capture.onRequest.mock.calls[0];
    const [fetchInput, fetchInit] = fetchData.mock.calls[0];
    expect(capturedInput).toBe(fetchInput);
    expect(capturedInit).toBe(fetchInit);
    expect(capturedInit.method).toBe("POST");
    expect(capturedInit.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer test-key" })
    );
    const body = JSON.parse(capturedInit.body);
    expect(capturedUserMsg).toEqual({
      role: "user",
      content: "Translate: hello",
    });
    expect(capturedUserMsg).toEqual(body.messages[body.messages.length - 1]);

    // onResponse 拿到的是 fetchData 的原始返回值本体（解析前）。
    expect(capture.onResponse).toHaveBeenCalledWith(rawResponse);
    expect(capture.onResponse.mock.calls[0][0]).toBe(rawResponse);

    // 顺序固定：请求捕获早于响应捕获。
    expect(capture.onRequest.mock.invocationCallOrder[0]).toBeLessThan(
      capture.onResponse.mock.invocationCallOrder[0]
    );
  });

  test("capture 流式：仍捕获请求，但不捕获响应", async () => {
    async function* streamChunks() {
      yield JSON.stringify({ choices: [{ delta: { content: "你好" } }] });
    }

    fetchStream.mockReturnValueOnce(streamChunks());

    const capture = { onRequest: jest.fn(), onResponse: jest.fn() };
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
          nobatchUserPrompt: "Translate: {{text}}",
        }),
        usePool: false,
        capture,
      })
    );

    expect(fetchStream).toHaveBeenCalledTimes(1);
    expect(fetchData).not.toHaveBeenCalled();
    expect(result[result.length - 1]).toEqual({ id: 0, result: ["你好"] });

    // 请求捕获与非流式一致；响应捕获只覆盖非流式分支（流式没有整体响应对象）。
    expect(capture.onRequest).toHaveBeenCalledTimes(1);
    expect(capture.onResponse).not.toHaveBeenCalled();
    const [capturedInput, capturedInit, capturedUserMsg] =
      capture.onRequest.mock.calls[0];
    const [streamInput, streamInit] = fetchStream.mock.calls[0];
    expect(capturedInput).toBe(streamInput);
    expect(capturedInit).toBe(streamInit);
    expect(JSON.parse(capturedInit.body).stream).toBe(true);
    expect(capturedUserMsg).toEqual({
      role: "user",
      content: "Translate: hello",
    });
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
