jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({}),
}));

const { TextDecoder, TextEncoder } = require("util");
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

import { genTransReq, handleTranslate, alignBatchTranslations } from "./trans";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_OPENAI,
  INPUT_PLACE_SEGMENTS,
  INPUT_PLACE_TO,
  INPUT_PLACE_TEXT,
  PROMPT_PROTOCOL_LINE,
  PROMPT_PROTOCOL_XML,
  PROMPT_PROTOCOL_JSON,
  defaultBatchUserPromptLines,
  defaultBatchUserPromptXml,
  defaultBatchUserPromptJson,
  defaultNobatchUserPromptConcise,
} from "../config";
import { fetchData, fetchStream } from "../libs/fetch";

const getTestApiSetting = (overrides = {}) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
  url: "https://api.openai.com/v1/chat/completions",
  key: "test-key",
  model: "test-model",
  useBatchFetch: true,
  useStream: false,
  fetchInterval: 0,
  fetchLimit: 1,
  httpTimeout: 1000,
  ...overrides,
});

describe("Batch Translation Protocols & Custom Batch User Prompt", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("genTransReq - batch formatting and placeholders", () => {
    test("formats LINE protocol with <br> escaping for internal newlines", async () => {
      const texts = [
        "First line",
        "Line with\ninternal newline\r\nand another line",
        "Third line",
      ];

      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        batchUserPrompt: `Translate lines into ${INPUT_PLACE_TO}:\n${INPUT_PLACE_SEGMENTS}`,
        systemPrompt: "You are a translator.",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage).toBeDefined();
      expect(userMessage.content).toBe(
        "Translate lines into zh-CN:\n0 | First line\n1 | Line with<br>internal newline<br>and another line\n2 | Third line"
      );
    });

    test("formats XML protocol with isomorphic <t id=...> input", async () => {
      const texts = ["Hello world", "Goodbye world"];

      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_XML,
        batchUserPrompt: `Translate XML into ${INPUT_PLACE_TO}:\n${INPUT_PLACE_SEGMENTS}`,
        systemPrompt: "You are a translator.",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage).toBeDefined();
      expect(userMessage.content).toBe(
        `Translate XML into zh-CN:\n<root>\n  <t id="0">Hello world</t>\n  <t id="1">Goodbye world</t>\n</root>`
      );
    });

    test("formats JSON protocol with JSON array segments", async () => {
      const texts = ["Alpha", "Beta"];

      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_JSON,
        batchUserPrompt: `Translate JSON into ${INPUT_PLACE_TO}:\n${INPUT_PLACE_SEGMENTS}`,
        systemPrompt: "You are a translator.",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage).toBeDefined();
      expect(userMessage.content).toBe(
        `Translate JSON into zh-CN:\n${JSON.stringify([
          { id: 0, text: "Alpha" },
          { id: 1, text: "Beta" },
        ])}`
      );
    });

    test("automatically appends segments at the end when {{segments}} placeholder is missing", async () => {
      const texts = ["Sentence one", "Sentence two"];

      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        // 用户自定义提示词，但未包含 {{segments}}
        batchUserPrompt: `Translate to ${INPUT_PLACE_TO} directly:`,
        systemPrompt: "System instruction.",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).toBe(
        "Translate to zh-CN directly:\n\n0 | Sentence one\n1 | Sentence two"
      );
    });

    test("falls back to legacy JSON prompt object when batchUserPrompt is undefined or empty", async () => {
      const texts = ["Fallback text"];

      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchUserPrompt: "", // 未配置或空
        systemPrompt: "System prompt.",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");
      const parsed = JSON.parse(userMessage.content);

      expect(parsed).toEqual({
        targetLanguage: "zh-CN",
        segments: [{ id: 0, text: "Fallback text" }],
      });
    });

    test("omits system role message when systemPrompt is empty or blank", async () => {
      const texts = ["Hello"];

      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        batchUserPrompt: `Translate:\n${INPUT_PLACE_SEGMENTS}`,
        systemPrompt: "   ", // 空白
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
      });

      const body = JSON.parse(reqInit.body);
      const systemMessage = body.messages.find((m) => m.role === "system");

      expect(systemMessage).toBeUndefined();
      expect(body.messages.length).toBe(1);
      expect(body.messages[0].role).toBe("user");
    });
  });

  describe("handleTranslate - end-to-end LINE response parsing with <br> restoration", () => {
    test("correctly parses LINE protocol response and restores <br> to newline", async () => {
      fetchData.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content:
                "0 | 敏捷的棕色狐狸。<br>跳过了狗。\n1 | 第二句简单的译文。",
            },
          },
        ],
      });

      const texts = [
        "The quick brown fox.\nJumps over the dog.",
        "The second simple sentence.",
      ];

      const apiSetting = getTestApiSetting({
        systemPrompt: "",
        batchUserPrompt: defaultBatchUserPromptLines,
        batchProtocol: PROMPT_PROTOCOL_LINE,
      });

      const results = [];
      for await (const chunk of handleTranslate(texts, {
        from: "en",
        to: "zh-CN",
        apiSetting,
      })) {
        results.push(chunk);
      }

      expect(fetchData).toHaveBeenCalledTimes(1);
      expect(results).toEqual([
        { id: 0, result: ["敏捷的棕色狐狸。\n跳过了狗。", ""] },
        { id: 1, result: ["第二句简单的译文。", ""] },
      ]);
    });

    test("prevents misaligned assignment when model drops leading segment (missing id 0)", async () => {
      // 模拟小模型丢失第 0 段，只返回 id 1 和 id 2
      fetchData.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "1 | 第二段翻译\n2 | 第三段翻译",
            },
          },
        ],
      });

      const texts = ["第一段原文", "第二段原文", "第三段原文"];
      const apiSetting = getTestApiSetting({
        systemPrompt: "",
        batchUserPrompt: defaultBatchUserPromptLines,
        batchProtocol: PROMPT_PROTOCOL_LINE,
      });

      const results = [];
      for await (const chunk of handleTranslate(texts, {
        from: "en",
        to: "zh-CN",
        apiSetting,
      })) {
        results.push(chunk);
      }

      // 验证：绝不发生位移错配，第 1 段和第 2 段严格对齐其自身真实的 id，第 0 段不被错误填充
      expect(results).toEqual([
        { id: 1, result: ["第二段翻译", ""] },
        { id: 2, result: ["第三段翻译", ""] },
      ]);
    });
  });

  describe("Hy-MT Glossary & Tone Conditional Pre-injection", () => {
    test("injects glossary and tone using Hy-MT format when not referenced in batch template, drops context", async () => {
      const texts = ["Use token in pipeline."];
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        batchUserPrompt: defaultBatchUserPromptLines,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
        glossary: { token: "令牌", pipeline: "管线" },
        tone: "formal",
        // 传入上下文，聚合 LINE 场景下应被自动丢弃，不污染 prompt
        docInfo: { title: "Secret Page", description: "Doc description" },
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      // 包含 Hy-MT 范式的前置 Reference
      expect(userMessage.content).toContain(
        "Reference the following translations:\ntoken translates to 令牌\npipeline translates to 管线"
      );
      // 包含 Hy-MT 范式的前置 Tone
      expect(userMessage.content).toContain(
        "Note that the translation style must strictly conform to [formal]."
      );
      // 上下文被丢弃，不包含 Title
      expect(userMessage.content).not.toContain("Secret Page");
      // 待翻译片段包含在内
      expect(userMessage.content).toContain("0 | Use token in pipeline.");
    });

    test("does not inject glossary or tone blocks when they are empty", async () => {
      const texts = ["Hello world"];
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        batchUserPrompt: defaultBatchUserPromptLines,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
        glossary: {},
        tone: "",
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).not.toContain("Reference the following");
      expect(userMessage.content).not.toContain("translation style must strictly");
      expect(userMessage.content).toBe(
        `Translate each numbered line below into zh-CN. Maintain the exact "{id} | {translation}" format for each line. Preserve all HTML-like tags, and keep <br> for internal newlines. Output ONLY the translated result without any additional explanation:\n0 | Hello world`
      );
    });

    test("injects glossary and tone into single-sentence (nobatch) prompt when referenced in concise template", async () => {
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: false,
        nobatchUserPrompt: defaultNobatchUserPromptConcise,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts: ["Enter your token."],
        glossary: { token: "安全令牌" },
        tone: "casual",
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).toContain(
        "Reference the following translations:\ntoken translates to 安全令牌"
      );
      expect(userMessage.content).toContain(
        "Note that the translation style must strictly conform to [casual]."
      );
      expect(userMessage.content).toContain("Enter your token.");
    });

    test("concise single-sentence prompt strips empty glossary and tone completely without extra blank lines", async () => {
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: false,
        nobatchUserPrompt: defaultNobatchUserPromptConcise,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts: ["Enter your token."],
        glossary: {},
        tone: "",
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).toBe(
        `Translate the following text into zh-CN. Preserve all HTML-like tags. Output ONLY the translated text without any explanation:\nEnter your token.`
      );
    });

    test("formats empty glossary target as self-mapping to preserve source term unchanged", async () => {
      const texts = ["React is a library."];
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        batchUserPrompt: defaultBatchUserPromptLines,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
        glossary: { React: "", transformer: "变形金刚" },
        tone: "",
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).toContain(
        "Reference the following translations:\nReact translates to React\ntransformer translates to 变形金刚"
      );
    });

    test("preserves context placeholders when explicitly referenced in custom LINE prompt", async () => {
      const texts = ["Custom line."];
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        // 用户自定义 LINE 模板，显式包含了 {{title}} 和 {{description}} 以及 {{context}}
        batchUserPrompt: `{{title}}\n{{description}}\n{{context}}\nTranslate:\n{{segments}}`,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts,
        docInfo: {
          title: "Custom Title",
          description: "Custom Desc",
          context: "Custom Extra Context",
        },
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).toContain(
        "Title: Custom Title\n\nDescription: Custom Desc\n\nContext: Custom Extra Context"
      );
      expect(userMessage.content).toContain("0 | Custom line.");
    });
  });

  describe("XML & JSON Context, Glossary, and Tone Protocols", () => {
    test("default XML prompt completely removes empty context, glossary, and tone without blank lines", async () => {
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_XML,
        batchUserPrompt: defaultBatchUserPromptXml,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts: ["Hello world"],
        glossary: {},
        tone: "",
        docInfo: {},
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).not.toContain("Context:");
      expect(userMessage.content).not.toContain("Reference the following");
      expect(userMessage.content).not.toContain("Note that the translation");
      expect(userMessage.content).toBe(
        `Translate the text within each <t id="..."> tag below into zh-CN. Maintain the exact <t id="..."> tag structure and id attributes. Preserve all internal HTML-like tags. Output ONLY the translated XML result without any additional explanation:\n<root>\n  <t id="0">Hello world</t>\n</root>`
      );
    });

    test("default XML prompt expands context, glossary, and tone when present", async () => {
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_XML,
        batchUserPrompt: defaultBatchUserPromptXml,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts: ["Hello world"],
        glossary: { world: "世界" },
        tone: "formal",
        docInfo: { title: "Documentation Guide", description: "API reference" },
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).toContain(
        "Title: Documentation Guide\n\nDescription: API reference"
      );
      expect(userMessage.content).not.toContain("Context:");
      expect(userMessage.content).toContain(
        "Reference the following translations:\nworld translates to 世界"
      );
      expect(userMessage.content).toContain(
        "Note that the translation style must strictly conform to [formal]."
      );
      expect(userMessage.content).toContain('<t id="0">Hello world</t>');
    });

    test("default JSON prompt completely removes empty context, glossary, and tone without blank lines", async () => {
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_JSON,
        batchUserPrompt: defaultBatchUserPromptJson,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts: ["Hello world"],
        glossary: {},
        tone: "",
        docInfo: {},
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).not.toContain("Title:");
      expect(userMessage.content).not.toContain("Description:");
      expect(userMessage.content).not.toContain("Summary:");
      expect(userMessage.content).not.toContain("Context:");
      expect(userMessage.content).not.toContain("Reference the following");
      expect(userMessage.content).not.toContain("Note that the translation");
      expect(userMessage.content).toBe(
        `Translate the text field of each object in the JSON array below into zh-CN. Keep the id unchanged and output a raw JSON array. Output ONLY the translated JSON result without any additional explanation:\n${JSON.stringify(
          [{ id: 0, text: "Hello world" }]
        )}`
      );
    });

    test("default JSON prompt expands context, glossary, and tone when present", async () => {
      const [, reqInit] = await genTransReq({
        apiType: OPT_TRANS_OPENAI,
        url: "https://api.openai.com/v1/chat/completions",
        key: "sk-test",
        model: "gpt-model",
        useBatchFetch: true,
        batchProtocol: PROMPT_PROTOCOL_JSON,
        batchUserPrompt: defaultBatchUserPromptJson,
        systemPrompt: "",
        from: "en",
        to: "zh-CN",
        fromLang: "en",
        toLang: "zh-CN",
        texts: ["Alpha"],
        glossary: { Alpha: "阿尔法" },
        tone: "casual",
        docInfo: { summary: "Project summary" },
      });

      const body = JSON.parse(reqInit.body);
      const userMessage = body.messages.find((m) => m.role === "user");

      expect(userMessage.content).toContain("Summary: Project summary");
      expect(userMessage.content).not.toContain("Context:");
      expect(userMessage.content).toContain(
        "Reference the following translations:\nAlpha translates to 阿尔法"
      );
      expect(userMessage.content).toContain(
        "Note that the translation style must strictly conform to [casual]."
      );
      expect(userMessage.content).toContain(
        JSON.stringify([{ id: 0, text: "Alpha" }])
      );
    });
  });

  describe("alignBatchTranslations unit tests", () => {
    test("handles normal structured items", () => {
      const items = [
        { id: 0, translation: ["译文0", "en"] },
        { id: 1, translation: ["译文1", "en"] },
      ];
      const aligned = alignBatchTranslations(items, 2);
      expect(aligned).toEqual([
        { id: 0, result: ["译文0", "en"] },
        { id: 1, result: ["译文1", "en"] },
      ]);
    });

    test("defends against dropped segments and maintains absolute slot index", () => {
      // 遗漏 id 0，只有 id 1
      const items = [{ id: 1, translation: ["译文1", ""] }];
      const aligned = alignBatchTranslations(items, 2);
      expect(aligned).toEqual([{ id: 1, result: ["译文1", ""] }]);
    });

    test("defends against out-of-bounds and duplicate IDs", () => {
      const items = [
        { id: 0, translation: ["首次译文0", ""] },
        { id: 0, translation: ["重复译文0", ""] },
        { id: 99, translation: ["越界译文", ""] },
        { id: -1, translation: ["非法负数", ""] },
        { id: 1, translation: ["有效译文1", ""] },
      ];
      const aligned = alignBatchTranslations(items, 2);
      expect(aligned).toEqual([
        { id: 0, result: ["首次译文0", ""] },
        { id: 1, result: ["有效译文1", ""] },
      ]);
    });

    test("supports legacy positional arrays for traditional APIs", () => {
      const items = [
        ["Google 译文 0", "en"],
        ["Google 译文 1", "en"],
      ];
      const aligned = alignBatchTranslations(items, 2);
      expect(aligned).toEqual([
        { id: 0, result: ["Google 译文 0", "en"] },
        { id: 1, result: ["Google 译文 1", "en"] },
      ]);
    });
  });

  describe("handleTranslate - streaming missing segment fallback to non-stream", () => {
    test("triggers non-stream fallback when stream drops intermediate segment (LINE protocol)", async () => {
      // 模拟流式阶段：模型遗漏了 id 1，只返回了 0 和 2
      const streamChunks = async function* () {
        const payload1 = {
          choices: [{ delta: { content: "0 | 第一段翻译\n" } }],
        };
        const payload2 = {
          choices: [{ delta: { content: "2 | 第三段翻译\n" } }],
        };
        yield JSON.stringify(payload1);
        yield JSON.stringify(payload2);
      };

      fetchStream.mockReturnValueOnce(streamChunks());

      // 模拟非流式重试阶段：返回完整的 0, 1, 2
      fetchData.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "0 | 第一段翻译\n1 | 第二段补齐翻译\n2 | 第三段翻译",
            },
          },
        ],
      });

      const texts = ["First", "Second", "Third"];
      const apiSetting = getTestApiSetting({
        systemPrompt: "",
        batchUserPrompt: defaultBatchUserPromptLines,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        useStream: true,
      });

      const results = [];
      for await (const chunk of handleTranslate(texts, {
        from: "en",
        to: "zh-CN",
        apiSetting,
      })) {
        results.push(chunk);
      }

      // 验证：流式与非流式都被调用
      expect(fetchStream).toHaveBeenCalledTimes(1);
      expect(fetchData).toHaveBeenCalledTimes(1);

      // 验证最终收到的段落完整，且已流式输出的 0 和 2 未被重复，1 被成功补齐
      expect(results).toEqual([
        { id: 0, result: ["第一段翻译", ""] },
        { id: 2, result: ["第三段翻译", ""] },
        { id: 1, result: ["第二段补齐翻译", ""] },
      ]);
    });

    test("triggers non-stream fallback when stream drops segment (JSON protocol)", async () => {
      // 模拟 JSON 协议流式遗漏 id 0
      const streamChunks = async function* () {
        const payload = {
          choices: [
            {
              delta: {
                content: JSON.stringify([{ id: 1, text: "第二段JSON译文" }]),
              },
            },
          ],
        };
        yield JSON.stringify(payload);
      };

      fetchStream.mockReturnValueOnce(streamChunks());

      fetchData.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify([
                { id: 0, text: "第一段JSON译文" },
                { id: 1, text: "第二段JSON译文" },
              ]),
            },
          },
        ],
      });

      const texts = ["Alpha", "Beta"];
      const apiSetting = getTestApiSetting({
        systemPrompt: "",
        batchUserPrompt: defaultBatchUserPromptJson,
        batchProtocol: PROMPT_PROTOCOL_JSON,
        useStream: true,
      });

      const results = [];
      for await (const chunk of handleTranslate(texts, {
        from: "en",
        to: "zh-CN",
        apiSetting,
      })) {
        results.push(chunk);
      }

      expect(fetchStream).toHaveBeenCalledTimes(1);
      expect(fetchData).toHaveBeenCalledTimes(1);
      const completedResults = results.filter((r) => r.result);
      expect(completedResults).toEqual([
        { id: 1, result: ["第二段JSON译文", ""] },
        { id: 0, result: ["第一段JSON译文", ""] },
      ]);
    });

    test("rejects unstructured refusal text under strict LINE protocol and falls back to non-stream", async () => {
      // 模拟流式阶段：模型返回了纯文本拒绝，完全不含 LINE 格式
      const streamChunks = async function* () {
        const payload = {
          choices: [
            {
              delta: { content: "Sorry, I cannot follow this format." },
            },
          ],
        };
        yield JSON.stringify(payload);
      };

      fetchStream.mockReturnValueOnce(streamChunks());

      // 模拟非流式重试阶段：返回合法的 LINE 格式
      fetchData.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "0 | 正确翻译文本",
            },
          },
        ],
      });

      const texts = ["One line text"];
      const apiSetting = getTestApiSetting({
        systemPrompt: "",
        batchUserPrompt: defaultBatchUserPromptLines,
        batchProtocol: PROMPT_PROTOCOL_LINE,
        useStream: true,
      });

      const results = [];
      for await (const chunk of handleTranslate(texts, {
        from: "en",
        to: "zh-CN",
        apiSetting,
      })) {
        results.push(chunk);
      }

      // 验证：由于流式返回纯文本拒绝，新协议严禁伪造 id 0，判定流式失败并触发非流式回退
      expect(fetchStream).toHaveBeenCalledTimes(1);
      expect(fetchData).toHaveBeenCalledTimes(1);
      const completedResults = results.filter((r) => r.result);
      expect(completedResults).toEqual([
        { id: 0, result: ["正确翻译文本", ""] },
      ]);
    });

    test("legacy custom batch prompt without protocol or userPrompt parses plain text lines by positional index", async () => {
      fetchData.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "第一行旧译文\n第二行旧译文",
            },
          },
        ],
      });

      // 模拟旧版自定义 batch prompt：无 protocol、无 batchUserPrompt
      const apiSetting = getTestApiSetting({
        systemPrompt: "Legacy system prompt",
        batchUserPrompt: "",
        batchProtocol: undefined,
        useStream: false,
      });

      const results = [];
      for await (const chunk of handleTranslate(["Line 1", "Line 2"], {
        from: "en",
        to: "zh-CN",
        apiSetting,
      })) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { id: 0, result: ["第一行旧译文", ""] },
        { id: 1, result: ["第二行旧译文", ""] },
      ]);
    });
  });
});
