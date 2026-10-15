jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () => ({ JSONParser: jest.fn() }));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

import { handleSummarize, parseTransRes } from "./trans";
import {
  OPT_TRANS_LOCALAI,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_APIMART,
  OPT_TRANS_OPENAI,
  INPUT_PLACE_TO,
} from "../config";
import { MSG_LOCAL_AI_RPC, MSG_LOCAL_AI_CANCEL } from "../config/msg";
import { sendBgMsg } from "../libs/msg";

jest.mock("../libs/client", () => ({
  isExt: true,
}));

jest.mock("../libs/browser", () => ({
  isBg: () => false,
}));

jest.mock("../libs/msg", () => ({
  sendBgMsg: jest.fn(),
}));

describe("local response validation stays isolated from network services", () => {
  const options = {
    texts: ["one", "two"],
    useBatchFetch: true,
    batchProtocol: "json",
  };
  test.each([OPT_TRANS_EPHONEAI, OPT_TRANS_APIMART])(
    "%s parses incomplete responses like OpenAI",
    async (apiType) => {
      const response = {
        choices: [
          { message: { role: "assistant", content: '[{"id":0,"text":"一"}]' } },
        ],
      };
      const expected = await parseTransRes(response, {
        ...options,
        apiType: OPT_TRANS_OPENAI,
      });
      expect(expected).toHaveLength(1);
      await expect(
        parseTransRes(response, { ...options, apiType })
      ).resolves.toEqual(expected);
      await expect(
        parseTransRes(response, { ...options, apiType: OPT_TRANS_LOCALAI })
      ).rejects.toThrow("Local translation returned incomplete segments");
    }
  );
  test.each([
    OPT_TRANS_LOCALAI,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_APIMART,
    OPT_TRANS_OPENAI,
  ])("%s parses complete responses and records history", async (apiType) => {
    const message = {
      role: "assistant",
      content: '[{"id":0,"text":"一"},{"id":1,"text":"二"}]',
    };
    const userMsg = { role: "user", content: "one, two" };
    const history = { addPair: jest.fn() };
    const result = await parseTransRes(
      { choices: [{ message }] },
      { ...options, apiType, userMsg, history }
    );
    expect(result).toHaveLength(2);
    expect(history.addPair).toHaveBeenCalledWith(userMsg, message);
  });
});

describe("handleSummarize LocalAI", () => {
  beforeEach(() => {
    sendBgMsg.mockReset();
  });

  test("展开自定义 userPrompt 和 systemPrompt 占位符并以规范角色消息发送给本地模型", async () => {
    sendBgMsg.mockResolvedValueOnce({ text: "本地模型总结结果" });

    const apiSetting = {
      apiType: OPT_TRANS_LOCALAI,
      apiSlug: "local_qwen",
      modelRef: "qwen2.5-0.5b",
    };

    const prompt = {
      slug: "custom_summary",
      systemPrompt: `你是专业的视频提炼助手，目标语言为 ${INPUT_PLACE_TO}。`,
      userPrompt: `请总结视频【{{title}}】（简介：{{description}}）。字幕：{{transcript}}。请以 ${INPUT_PLACE_TO} 输出。`,
    };

    const result = await handleSummarize({
      title: "我的视频标题",
      description: "这是视频简介",
      transcript: "这是原始字幕内容",
      apiSetting,
      prompt,
      to: "zh-CN",
    });

    expect(result).toBe("本地模型总结结果");
    expect(sendBgMsg).toHaveBeenCalledTimes(1);

    const [msgType, msgPayload] = sendBgMsg.mock.calls[0];
    expect(msgType).toBe(MSG_LOCAL_AI_RPC);
    expect(msgPayload).toMatchObject({
      service: "llm",
      method: "chat",
      payload: {
        modelRef: "qwen2.5-0.5b",
        maxTokens: 2048,
        messages: [
          {
            role: "system",
            content: "你是专业的视频提炼助手，目标语言为 zh-CN。",
          },
          {
            role: "user",
            content:
              "请总结视频【我的视频标题】（简介：这是视频简介）。字幕：这是原始字幕内容。请以 zh-CN 输出。",
          },
        ],
      },
    });
  });

  test("未提供自定义 userPrompt 时采用默认标题、简介与字幕拼接结构", async () => {
    sendBgMsg.mockResolvedValueOnce("纯文本总结");

    const apiSetting = {
      apiType: OPT_TRANS_LOCALAI,
      apiSlug: "local_qwen",
      modelRef: "qwen2.5-0.5b",
    };

    const result = await handleSummarize({
      title: "Default Title",
      description: "Default Desc",
      transcript: "Line 1\nLine 2",
      apiSetting,
      prompt: {
        slug: "no_user_prompt",
        systemPrompt: "Default System",
      },
      to: "en",
    });

    expect(result).toBe("纯文本总结");
    const [, msgPayload] = sendBgMsg.mock.calls[0];
    const userMsg = msgPayload.payload.messages.find((m) => m.role === "user");
    expect(userMsg.content).toContain("Title: Default Title");
    expect(userMsg.content).toContain("Description: Default Desc");
    expect(userMsg.content).toContain("Transcript:\nLine 1\nLine 2");
  });

  test("支持 AbortSignal 取消并在取消时向后台发送 MSG_LOCAL_AI_CANCEL", async () => {
    const controller = new AbortController();

    sendBgMsg.mockImplementation(async (type, payload) => {
      if (type === MSG_LOCAL_AI_RPC) {
        // 模拟等待期间用户触发取消
        controller.abort();
        return { text: "aborted text" };
      }
      return undefined;
    });

    const apiSetting = {
      apiType: OPT_TRANS_LOCALAI,
      apiSlug: "local_qwen",
      modelRef: "qwen2.5-0.5b",
    };

    await handleSummarize({
      title: "Title",
      transcript: "Transcript",
      apiSetting,
      signal: controller.signal,
    });

    const cancelCall = sendBgMsg.mock.calls.find(
      ([type]) => type === MSG_LOCAL_AI_CANCEL
    );
    expect(cancelCall).toBeDefined();
    expect(cancelCall[1]).toMatchObject({
      id: expect.stringMatching(/^local-summary-/),
    });
  });
});

describe("local translation uses AI request and response pipeline", () => {
  const {
    genTransReq,
    handleTranslate,
    handleDict,
    handleSubtitle,
  } = require("./trans");
  const { fetchData, fetchStream } = require("../libs/fetch");
  beforeEach(() => {
    fetchData.mockReset();
    fetchStream.mockReset();
  });
  const api = {
    apiType: OPT_TRANS_LOCALAI,
    modelRef: "qwen2.5-0.5b",
    device: "wasm",
    temperature: 0.7,
    maxTokens: 321,
    nobatchPrompt: "Translate into {{to}}",
    nobatchUserPrompt: "{{tone}} {{glossary}} {{text}}",
    tone: "formal",
    aiTerms: "React=React",
    useBatchFetch: false,
  };
  test("expands custom template and passes style, terms, device and generation parameters", async () => {
    const [url, init] = await genTransReq({
      ...api,
      texts: ["hello"],
      to: "Chinese",
      from: "English",
    });
    expect(url).toBe("local-ai://chat");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      modelRef: api.modelRef,
      loadSpec: { device: "wasm" },
      temperature: 0.7,
      maxTokens: 321,
    });
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "Translate into Chinese",
    });
    expect(body.messages[1].content).toContain("formal");
    expect(body.messages[1].content).toContain("hello");
    expect(body.messages[1].content).toContain("React");
  });
  test("parses translation through the same response parser", async () => {
    fetchData.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "你好" } }],
    });
    const chunks = [];
    for await (const chunk of handleTranslate(["hello"], {
      to: "Chinese",
      from: "English",
      apiSetting: api,
    }))
      chunks.push(chunk);
    expect(chunks).toEqual([{ id: 0, result: ["你好"] }]);
  });
  test("isolates local conversation history by model and prompt", async () => {
    fetchData.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "你好" } }],
    });
    const run = async (settings) => {
      for await (const ignored of handleTranslate(["hello"], {
        from: "English",
        to: "Chinese",
        apiSetting: settings,
      })) {
      }
    };
    const contextual = {
      ...api,
      apiSlug: "isolation",
      useContext: true,
      contextSize: 4,
    };
    await run(contextual);
    await run(contextual);
    expect(JSON.parse(fetchData.mock.calls[1][1].body).messages).toHaveLength(
      4
    );
    await run({ ...contextual, modelRef: "other" });
    expect(JSON.parse(fetchData.mock.calls[2][1].body).messages).toHaveLength(
      2
    );
  });
  test("local dictionary consumes its own template", async () => {
    fetchData.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "# Dictionary" } }],
    });
    const text = await handleDict({
      text: "hello",
      from: "English",
      to: "Chinese",
      apiSetting: {
        ...api,
        dictPrompt: "Dictionary",
        dictUserPrompt: "Define {{text}}",
        aiTerms: "",
        useStream: false,
      },
    });
    expect(text).toBe("# Dictionary");
    expect(JSON.parse(fetchData.mock.calls[0][1].body).messages).toEqual([
      { role: "system", content: "Dictionary" },
      { role: "user", content: "Define hello" },
    ]);
  });
  test("local streaming renders partial and final translations", async () => {
    fetchStream.mockImplementation(async function* () {
      yield JSON.stringify({ choices: [{ delta: { content: "你" } }] });
      yield JSON.stringify({ choices: [{ delta: { content: "好" } }] });
    });
    const chunks = [];
    for await (const item of handleTranslate(["hello"], {
      from: "English",
      to: "Chinese",
      apiSetting: { ...api, useStream: true, streamRenderMode: "realtime" },
    }))
      chunks.push(item);
    expect(chunks).toContainEqual({
      id: 0,
      partialText: "你",
      isComplete: false,
    });
    expect(chunks[chunks.length - 1]).toEqual({ id: 0, result: ["你好"] });
    expect(fetchData).not.toHaveBeenCalled();
  });
  test("local aggregation parses complete IDs and rejects incomplete results", async () => {
    const options = {
      from: "English",
      to: "Chinese",
      apiSetting: {
        ...api,
        useBatchFetch: true,
        batchProtocol: "json",
        systemPrompt: "Translate",
        batchUserPrompt: "{{segments}}",
      },
    };
    fetchData.mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: '[{"id":1,"text":"二"},{"id":0,"text":"一"}]',
          },
        },
      ],
    });
    const chunks = [];
    for await (const item of handleTranslate(["one", "two"], options))
      chunks.push(item);
    expect(chunks.map((item) => item.id)).toEqual([0, 1]);
    fetchData.mockResolvedValue({
      choices: [
        { message: { role: "assistant", content: '[{"id":0,"text":"一"}]' } },
      ],
    });
    const consume = async () => {
      for await (const item of handleTranslate(["one", "two"], options)) {
      }
    };
    await expect(consume()).rejects.toThrow("incomplete");
  });
});
