jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () => ({ JSONParser: jest.fn() }));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

import { handleSummarize } from "./trans";
import { OPT_TRANS_LOCALAI, INPUT_PLACE_TO } from "../config";
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
