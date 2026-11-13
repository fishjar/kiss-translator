import { createNativeRegistry } from "./runtime";
import {
  handleNativeTranslate as handleTranslate,
  handleNativeSummarize,
} from "../apis/trans";
import { OPT_TRANS_OPENAI } from "../config/api";
import { apiTranslate } from "../apis";
jest.mock("query-string", () => ({
  stringify: (value) => new URLSearchParams(value).toString(),
}));
jest.mock("../libs/fetch", () => ({ fetchData: jest.fn() }));
jest.mock("../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../apis/trans", () => ({
  handleNativeTranslate: jest.fn(),
  handleNativeDict: jest.fn(async () => "definition"),
  handleNativeSummarize: jest.fn(async () => "summary"),
  handleNativeSubtitle: jest.fn(async () => []),
}));
beforeEach(() =>
  handleTranslate.mockImplementation(async function* () {
    yield { id: 1, result: ["乙", "en"] };
    yield { id: 0, result: ["甲", "en"] };
  })
);

test.each([undefined, {}, { systemPrompt: "Custom", userPrompt: "" }])(
  "native summary dispatch preserves absence versus custom prompt (%#)",
  async (prompt) => {
    handleNativeSummarize.mockResolvedValueOnce("Summary");
    const api = {
      apiType: OPT_TRANS_OPENAI,
      apiSlug: "summary",
      useStream: false,
    };
    const registry = createNativeRegistry(() => api, {
      nativeOptions: { prompt },
    });
    await registry.invoke("summary", "summarize", {
      text: "Transcript",
      document: { title: "Title", description: "Description" },
      instructions: prompt?.systemPrompt,
      userPrompt: prompt?.userPrompt,
    }).result;
    expect(handleNativeSummarize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Title",
        description: "Description",
        transcript: "Transcript",
        prompt,
      })
    );
  }
);

test("old network VLM selections and snapshots cannot invoke a removed native handler", async () => {
  const registry = createNativeRegistry(() => ({
    apiType: OPT_TRANS_OPENAI,
    apiSlug: "old-vision",
    enabledCapabilities: ["parseImage"],
    provider: {
      apiVersion: 1,
      implementation: { kind: "native", entry: OPT_TRANS_OPENAI },
      capabilities: {
        parseImage: { handler: "parseImage", outputModes: ["complete"] },
      },
    },
  }));
  await expect(
    registry.invoke("old-vision", "parseImage", { image: "unused" }).result
  ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
});

test("production native registry routes old settings without persisting or changing IDs", async () => {
  const old = {
    apiType: OPT_TRANS_OPENAI,
    apiSlug: "existing",
    useStream: false,
  };
  const registry = createNativeRegistry(() => old);
  await expect(
    registry.invoke("existing", "translate", {
      items: [
        { id: "first", text: "A" },
        { id: "second", text: "B" },
      ],
      targetLanguage: "zh-CN",
    }).result
  ).resolves.toEqual({
    items: [
      { id: "first", text: "甲" },
      { id: "second", text: "乙" },
    ],
    sourceLanguage: "en",
  });
  expect(old.provider).toBeUndefined();
  expect(handleTranslate.mock.calls[0][1].apiSetting.apiSlug).toBe("existing");
});
test("external snapshots cannot select a compiled native entry", async () => {
  const registry = createNativeRegistry(() => ({
    apiType: OPT_TRANS_OPENAI,
    provider: {
      apiVersion: 1,
      source: { external: true },
      implementation: { kind: "native", entry: OPT_TRANS_OPENAI },
    },
  }));
  await expect(
    registry.invoke("forged", "summarize", { text: "x" }).result
  ).rejects.toMatchObject({ code: "NATIVE_ACCESS_DENIED" });
});

test("browser native translation consumes the existing object result and preserves the item ID", async () => {
  apiTranslate.mockResolvedValue({
    trText: "浏览器译文",
    srLang: "en",
    srCode: "en",
    isSame: false,
  });
  const registry = createNativeRegistry(() => ({
    apiType: "BuiltinAI",
    apiSlug: "browser",
    isDisabled: false,
  }));
  await expect(
    registry.invoke("browser", "translate", {
      items: [{ id: "stable-id", text: "hello" }],
      targetLanguage: "zh-CN",
    }).result
  ).resolves.toEqual({
    items: [{ id: "stable-id", text: "浏览器译文" }],
    sourceLanguage: "en",
  });
});
