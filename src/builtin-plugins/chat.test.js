jest.mock("query-string", () => ({
  stringify: (object) => new URLSearchParams(object).toString(),
}));
jest.mock("../libs/fetch", () => ({ fetchData: jest.fn() }));
import { fetchData } from "../libs/fetch";
import { webcrypto } from "crypto";
import { chatNative } from "./chat";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_OPENAI,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_GEMINI,
  OPT_TRANS_OPENCODEGO,
} from "../config/api";
const ctx = () => ({ signal: new AbortController().signal });
const originalCrypto = global.crypto;
beforeAll(() => { global.crypto = webcrypto; });
afterAll(() => { global.crypto = originalCrypto; });
const input = {
  messages: [
    { role: "system", content: "literal {{text}}" },
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "second" },
  ],
};
const api = (type) => ({
  ...DEFAULT_API_LIST.find((item) => item.apiType === type),
  apiSlug: `chat-test-${type}`,
  key: "key",
  customHeader: "",
  customBody: "",
});
test("compiled Chat Completions uses full turns, keeps literal templates and checks incomplete output", async () => {
  fetchData.mockResolvedValue({
    choices: [{ message: { content: "reply" }, finish_reason: "stop" }],
  });
  const context = ctx();
  await expect(
    chatNative(input, api(OPT_TRANS_OPENAI), context)
  ).resolves.toMatchObject({ text: "reply" });
  const [, init, options] = fetchData.mock.calls[0];
  expect(JSON.parse(init.body).messages).toEqual(input.messages);
  expect(options.signal).toBe(context.signal);
  fetchData.mockResolvedValue({
    choices: [{ message: { content: "partial" }, finish_reason: "length" }],
  });
  await expect(
    chatNative(input, api(OPT_TRANS_OPENAI), context)
  ).rejects.toMatchObject({ code: "INCOMPLETE_RESPONSE" });
});
test("Claude and Gemini assemble native roles without translating or concatenating turns", async () => {
  fetchData.mockResolvedValueOnce({
    content: [{ type: "text", text: "Claude" }],
    stop_reason: "end_turn",
  });
  await expect(
    chatNative(input, api(OPT_TRANS_CLAUDE), ctx())
  ).resolves.toEqual({ text: "Claude", reasoning: "" });
  const claudeBody = JSON.parse(fetchData.mock.calls[0][1].body);
  expect(claudeBody.system).toBe("literal {{text}}");
  expect(claudeBody.messages).toEqual(input.messages.slice(1));
  fetchData.mockResolvedValueOnce({
    candidates: [
      { content: { parts: [{ text: "Gemini" }] }, finishReason: "STOP" },
    ],
  });
  await expect(
    chatNative(
      input,
      {
        ...api(OPT_TRANS_GEMINI),
        url: "https://example.invalid/models/{{model}}:generateContent",
      },
      ctx()
    )
  ).resolves.toEqual({ text: "Gemini", reasoning: "" });
  const geminiBody = JSON.parse(fetchData.mock.calls[1][1].body);
  expect(geminiBody.contents.map((message) => message.role)).toEqual([
    "user",
    "model",
    "user",
  ]);
});
test("OpenCode Go chat keeps session headers and explicit overrides; unsupported modalities are rejected", async () => {
  fetchData.mockResolvedValue({
    choices: [{ message: { content: "reply" }, finish_reason: "stop" }],
  });
  await chatNative(
    input,
    { ...api(OPT_TRANS_OPENCODEGO), customHeader: '{"X-Custom":"value"}' },
    ctx()
  );
  expect(fetchData.mock.calls[0][1].headers).toEqual(
    expect.objectContaining({
      "X-Custom": "value",
      "x-opencode-session": expect.any(String),
    })
  );
  await expect(
    chatNative(
      { messages: [{ role: "user", content: [{ type: "image" }] }] },
      api(OPT_TRANS_OPENAI),
      ctx()
    )
  ).rejects.toMatchObject({ code: "MODALITY_UNSUPPORTED" });
});
