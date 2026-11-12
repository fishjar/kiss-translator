import {
  compactMessages,
  requireConversationInput,
  prepareMessages,
} from "./messages";
test("omits blank messages and text parts while preserving image/audio payloads and input objects", () => {
  const image = {
    type: "image",
    asset: { assetId: "image", mimeType: "image/png" },
  };
  const audio = {
    type: "audio",
    asset: { assetId: "audio", mimeType: "audio/wav" },
  };
  const input = [
    { role: "system", content: " " },
    { role: "user", content: "" },
    { role: "user", content: [{ type: "text", text: "" }, image, audio] },
  ];
  expect(compactMessages(input)).toEqual([
    { role: "user", content: [image, audio] },
  ]);
  expect(input[2].content).toHaveLength(3);
});
test("preserves Gemini non-message context and image parts", () => {
  const thought = { type: "thought", signature: "sig", summary: [] };
  expect(
    compactMessages([
      thought,
      {
        role: "user",
        parts: [
          { text: "" },
          { inlineData: { mimeType: "image/png", data: "AA==" } },
        ],
      },
    ])
  ).toEqual([
    thought,
    {
      role: "user",
      parts: [{ inlineData: { mimeType: "image/png", data: "AA==" } }],
    },
  ]);
});
test("protocol restriction rejects absent conversation without inventing content", () => {
  expect(() =>
    requireConversationInput([{ role: "user", content: "" }], "Claude")
  ).toThrow("不支持仅系统提示词");
  expect(() =>
    requireConversationInput([{ role: "user", content: "Input" }], "Claude")
  ).not.toThrow();
  expect(typeof prepareMessages).toBe("function");
});
