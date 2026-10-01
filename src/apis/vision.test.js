jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));
jest.mock("@streamparser/json", () => ({ JSONParser: jest.fn() }));
jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));
import { recognizeNetworkImage } from "./vision";
import { genTransReq } from "./trans";
import { fetchData } from "../libs/fetch";
const file = {
  type: "image/png",
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
};
beforeEach(() => fetchData.mockReset());

test.each(["", "   ", "  Keep this instruction  "])(
  "Gemini only sends a nonblank system instruction: %p",
  async (systemPrompt) => {
    const [, init] = await genTransReq({
      apiType: "Gemini",
      url: "https://example.com/models/{{model}}:generateContent",
      model: "vision",
      key: "test-key",
      useBatchFetch: false,
      nobatchPrompt: systemPrompt,
      nobatchUserPrompt: "Recognize only",
      texts: ["hello"],
    });
    const body = JSON.parse(init.body);
    if (systemPrompt.trim())
      expect(body.systemInstruction).toEqual({ parts: [{ text: systemPrompt }] });
    else expect(body).not.toHaveProperty("systemInstruction");
  }
);

test.each(["image/jpeg", "image/png", "image/gif", "image/webp", "image/jpg"])(
  "Claude sends a supported normalized MIME: %s",
  async (type) => {
    fetchData.mockResolvedValue({ content: [{ type: "text", text: "hello" }] });
    await recognizeNetworkImage({ ...file, type }, {
      apiType: "Claude", sourceType: "network", url: "https://example.com/messages", key: "test-key",
    }, "Recognize only");
    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body.messages[0].content[0].source.media_type).toBe(type === "image/jpg" ? "image/jpeg" : type);
  }
);

test.each(["", "image/bmp", "application/octet-stream"])(
  "Claude rejects invalid MIME before reading or sending: %p",
  async (type) => {
    const arrayBuffer = jest.fn(file.arrayBuffer);
    await expect(recognizeNetworkImage({ type, arrayBuffer }, {
      apiType: "Claude", sourceType: "network", url: "https://example.com/messages",
    }, "Recognize only")).rejects.toThrow(/图片.*类型|格式/);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(fetchData).not.toHaveBeenCalled();
  }
);

test("all visual adapters reject an empty MIME before sending", async () => {
  await expect(recognizeNetworkImage({ ...file, type: "" }, {
    apiType: "OpenAI", sourceType: "network", url: "https://example.com/chat/completions",
  }, "Recognize only")).rejects.toThrow("图片类型不能为空");
  expect(fetchData).not.toHaveBeenCalled();
});
test.each([
  ["OpenRouter", { choices: [{ message: { content: "hello" } }] }],
  ["OrcaRouter", { choices: [{ message: { content: "hello" } }] }],
  ["Requesty", { choices: [{ message: { content: "hello" } }] }],
  ["OpenAI", { choices: [{ message: { content: "hello" } }] }],
  [
    "Gemini",
    {
      candidates: [
        {
          content: {
            parts: [{ text: "thought", thought: true }, { text: "hello" }],
          },
        },
      ],
    },
  ],
  ["Claude", { content: [{ type: "text", text: "hello" }] }],
])(
  "%s sends image plus visual instruction and extracts plain text",
  async (apiType, response) => {
    fetchData.mockResolvedValue(response);
    const result = await recognizeNetworkImage(
      file,
      {
        apiType,
        sourceType: "network",
        url: "https://example.com/models/{{model}}:generateContent",
        model: "vision",
        key: "test-key",
        maxTokens: 100,
      },
      "Recognize only",
      new AbortController().signal
    );
    const init = fetchData.mock.calls[0][1],
      body = JSON.parse(init.body);
    if (apiType === "Gemini") {
      expect(body).not.toHaveProperty("systemInstruction");
      expect(body.contents[0].parts).toEqual([
        { inlineData: { mimeType: "image/png", data: "AQID" } },
        { text: "Recognize only" },
      ]);
    }
    else if (apiType === "Claude")
      expect(body.messages[0].content).toEqual([
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "AQID" },
        },
        { type: "text", text: "Recognize only" },
      ]);
    else
      expect(body.messages[0].content).toEqual([
        { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
        { type: "text", text: "Recognize only" },
      ]);
    expect(result).toEqual({
      text: "hello",
      items: [{ text: "hello", poly: null }],
      isVlm: true,
    });
    expect(body.stream).not.toBe(true);
  }
);
test("unsupported adapter and cancelled calls never send an image", async () => {
  await expect(
    recognizeNetworkImage(
      file,
      { apiType: "Microsoft", sourceType: "network" },
      "prompt"
    )
  ).rejects.toThrow("尚未接入");
  const abort = new AbortController();
  abort.abort();
  await expect(
    recognizeNetworkImage(
      file,
      { apiType: "OpenAI", sourceType: "network" },
      "prompt",
      abort.signal
    )
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchData).not.toHaveBeenCalled();
});
