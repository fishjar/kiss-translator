import { resolveApiPromptSettings, PROMPT_MODE_GLOBAL } from "../config/prompt";
import { translatePlugin } from "./translationAdapter";
import { invokePlugin } from "./bridge";
jest.mock("./bridge", () => ({ invokePlugin: jest.fn() }));
const provider = { implementation: { kind: "script" } };
const prompts = [
  {
    slug: "own-single",
    name: "Single",
    category: "user prompt",
    systemPrompt: "single {{text}}",
    userPrompt: "single user",
  },
  {
    slug: "own-subtitle",
    name: "Subtitle",
    category: "subtitle",
    systemPrompt: "scene subtitle",
    userPrompt: "",
  },
];
test("external handlers inherit only explicit prompt entities and global scene choice wins", () => {
  expect(resolveApiPromptSettings({ provider }, prompts)).toEqual({ provider });
  const api = {
    provider,
    nobatchPromptSlug: "own-single",
    subtitlePrompt: "instance subtitle",
  };
  expect(
    resolveApiPromptSettings(api, prompts, {
      segPromptMode: PROMPT_MODE_GLOBAL,
      segPromptSlug: "own-subtitle",
    })
  ).toMatchObject({
    nobatchPrompt: "single {{text}}",
    nobatchUserPrompt: "single user",
    subtitlePrompt: "scene subtitle",
  });
  expect(api.nobatchPrompt).toBeUndefined();
});
test("non-batch translation receives its own system/user pair instead of batch instructions", async () => {
  invokePlugin.mockReturnValue({
    cancel() {},
    events: { async *[Symbol.asyncIterator]() {} },
    result: Promise.resolve({ items: [{ id: "0", text: "ok" }] }),
  });
  for await (const _ of translatePlugin(["hello"], {
    toLang: "zh-CN",
    apiSetting: {
      apiSlug: "id",
      provider,
      systemPrompt: "batch",
      nobatchPrompt: "single",
      nobatchUserPrompt: "single user",
    },
  })) {
  }
  expect(invokePlugin.mock.calls[0][2]).toMatchObject({
    systemPrompt: "single",
    userPrompt: "single user",
  });
});
