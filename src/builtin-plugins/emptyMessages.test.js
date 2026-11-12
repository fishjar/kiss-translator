import { genOllama } from "./ollama";
import { genOpenRouter, genOrcaRouter, genRequesty } from "./routers";
import { clearMsgHistory, getMsgHistory } from "../apis/history";

describe.each([
  ["Ollama", genOllama],
  ["OpenRouter", genOpenRouter],
  ["OrcaRouter", genOrcaRouter],
  ["Requesty", genRequesty],
])("%s empty messages", (name, build) => {
  const options = { url: "https://example.com", model: "test" };

  test.each(["", " \n\t"])(
    "omits blank current input %p and does not store a history pair",
    (userPrompt) => {
      const { body, userMsg } = build({
        ...options,
        systemPrompt: "Rules",
        userPrompt,
      });
      expect(body.messages).toEqual([{ role: "system", content: "Rules" }]);
      expect(userMsg).toBeUndefined();
      clearMsgHistory(name);
      const history = getMsgHistory(name, 8);
      history.addPair(userMsg, { role: "assistant", content: "Answer" });
      expect(history.getAll()).toEqual([]);
      clearMsgHistory(name);
    }
  );

  test("omits blank system text and preserves current input and history", () => {
    const hisMsgs = [
      { role: "user", content: "Previous" },
      { role: "assistant", content: "Reply" },
    ];
    const { body, userMsg } = build({
      ...options,
      systemPrompt: " ",
      userPrompt: "Current",
      hisMsgs,
    });
    expect(userMsg).toEqual({ role: "user", content: "Current" });
    expect(body.messages).toEqual([...hisMsgs, userMsg]);
  });

  test("preserves image-only input without an empty text part", () => {
    const { body, userMsg } = build({
      ...options,
      systemPrompt: "Rules",
      userPrompt: "",
      imageData: { type: "image/png", base64: "YWJj" },
    });
    expect(userMsg.content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,YWJj" } },
    ]);
    expect(body.messages.at(-1)).toEqual(userMsg);
  });
});
