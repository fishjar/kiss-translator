import { handleTranslate } from "./trans";
import { fetchData } from "../libs/fetch";
import {
  API_SPE_TYPES,
  DEFAULT_API_LIST,
  OPT_TRANS_RAPID_MLX,
  resolveApiPromptSettings,
} from "../config";
import { createBuiltinInstance } from "../builtin-plugins";
import { genRapidMlx } from "../builtin-plugins/rapid-mlx";
import { getStreamDelta } from "../builtin-plugins/streamResponses";
import {
  parseNativeDictionaryResponse,
  parseNativeSummaryResponse,
  parseNativeSubtitleResponse,
} from "../builtin-plugins/textResponses";

jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));
jest.mock("@streamparser/json", () => ({ JSONParser: jest.fn() }));
jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));
jest.mock("../libs/docInfo", () => ({ getDocInfo: () => ({}) }));

const model = "mlx-community/Qwen3.5-4B-MLX-4bit";
const preset = DEFAULT_API_LIST.find(
  (api) => api.apiType === OPT_TRANS_RAPID_MLX
);

afterEach(() => jest.clearAllMocks());

test("registers a keyless local endpoint and discovers models without a preset model", () => {
  expect(preset).toMatchObject({
    url: "http://127.0.0.1:8000/v1/chat/completions",
    modelListUrl: "http://127.0.0.1:8000/v1/models",
    key: "",
    model: "",
    useStream: true,
  });
  for (const capability of [
    "builtin",
    "ai",
    "batch",
    "context",
    "stream",
    "mulkeys",
  ])
    expect(API_SPE_TYPES[capability].has(OPT_TRANS_RAPID_MLX)).toBe(true);
  expect(
    createBuiltinInstance(OPT_TRANS_RAPID_MLX, "rapid", "Rapid-MLX")
      .enabledCapabilities
  ).toEqual([
    "translate",
    "summarize",
    "dictionary",
    "segmentSubtitle",
    "chat",
  ]);
});

test.each(["", "   ", "test-key"])(
  "supports optional chat authentication: %s",
  async (key) => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "你好，世界。" } }],
    });
    const result = [];
    for await (const item of handleTranslate(["Hello, world."], {
      from: "en",
      to: "zh-CN",
      fromLang: "English",
      toLang: "Chinese",
      langMap: () => "",
      glossary: "",
      usePool: false,
      apiSetting: resolveApiPromptSettings({
        ...preset,
        key,
        model,
        isDisabled: false,
        useStream: false,
        useBatchFetch: false,
        fetchInterval: 0,
      }),
    }))
      result.push(item);
    expect(result).toEqual([{ id: 0, result: ["你好，世界。", ""] }]);
    const [url, init] = fetchData.mock.calls[0];
    expect(url).toBe(preset.url);
    expect(init.headers.Authorization).toBe(
      key.trim() ? `Bearer ${key}` : undefined
    );
    expect(JSON.parse(init.body)).toMatchObject({ model, stream: false });
  }
);

test("builds SSE chat requests with complete conversation pairs", () => {
  const request = genRapidMlx({
    url: preset.url,
    key: "",
    model,
    systemPrompt: "Translate to Chinese.",
    hisMsgs: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "你好" },
    ],
    userPrompt: "Goodbye",
    useStream: true,
    maxTokens: 128,
  });
  expect(request.headers).not.toHaveProperty("Authorization");
  expect(request.body).toMatchObject({ model, max_tokens: 128, stream: true });
  expect(request.body.messages.map((message) => message.role)).toEqual([
    "system",
    "user",
    "assistant",
    "user",
  ]);
  expect(
    getStreamDelta(
      { choices: [{ delta: { content: "再见" } }] },
      OPT_TRANS_RAPID_MLX
    )
  ).toBe("再见");
  expect(
    getStreamDelta({ choices: [{ delta: {} }] }, OPT_TRANS_RAPID_MLX)
  ).toBe("");
});

test("supports dictionary, summary and subtitle response paths", async () => {
  const res = { choices: [{ message: { content: "译文" } }] };
  expect(parseNativeDictionaryResponse(res, OPT_TRANS_RAPID_MLX)).toBe("译文");
  expect(parseNativeSummaryResponse(res, OPT_TRANS_RAPID_MLX)).toBe("译文");
  const parseSTRes = jest.fn(() => []);
  await parseNativeSubtitleResponse(
    res,
    { apiSetting: preset, events: [], from: "en" },
    { parseSTRes }
  );
  expect(parseSTRes).toHaveBeenCalledWith("译文", [], "en");
});
