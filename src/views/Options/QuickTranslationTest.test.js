import { act } from "react";
import { createRoot } from "react-dom/client";
import QuickTranslationTest from "./QuickTranslationTest";
import { apiTranslate } from "../../apis";
import { invokeService } from "../../providers/serviceRuntime";
import { approvedProviderOrigins } from "../../providers/grants";
import { browser } from "../../libs/browser";
import { useAlert } from "../../hooks/Alert";
import { useSetting } from "../../hooks/Setting";

jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../providers/serviceRuntime", () => ({
  invokeService: jest.fn(),
}));
jest.mock("../../providers/sceneInvocation", () => ({
  invokeScene: jest.fn(),
}));
jest.mock("../../hooks/Alert", () => ({ useAlert: jest.fn() }));
jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));
jest.mock("../../config/prompt", () => ({
  resolveApiPromptSettings: (api) => api,
}));
jest.mock("../../providers/grants", () => ({
  approvedProviderOrigins: jest.fn(),
  providerGrantKey: () => "grant",
  providerPluginId: () => "example",
}));
jest.mock("../../libs/browser", () => ({
  browser: {
    storage: {
      onChanged: { addListener: jest.fn(), removeListener: jest.fn() },
    },
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, node, success, error, updateSetting;
const api = {
  apiSlug: "plugin",
  apiType: "Plugin",
  enabledCapabilities: ["translate", "chat"],
  pluginConfig: { model: "draft-model" },
  provider: {
    implementation: { kind: "declarative" },
    settings: [{ key: "model", type: "text", required: true }],
    capabilities: {
      translate: { handler: "translate" },
      chat: { handler: "chat" },
    },
  },
};
const button = () => node.querySelector("button");
const render = async (value = api, props = {}) =>
  act(async () => {
    root.render(
      <QuickTranslationTest key={value.apiSlug} api={value} {...props} />
    );
  });
const invocation = (text = "译文") => ({
  result: Promise.resolve({ items: [{ id: "0", text }] }),
  events: (async function* () {})(),
  cancel: jest.fn(),
});
beforeEach(() => {
  jest.clearAllMocks();
  success = jest.fn();
  error = jest.fn();
  updateSetting = jest.fn();
  useAlert.mockReturnValue({ success, error });
  useSetting.mockReturnValue({
    setting: { uiLang: "en", prompts: [] },
    updateSetting,
  });
  approvedProviderOrigins.mockResolvedValue(
    new Set(["https://example.invalid"])
  );
  invokeService.mockReturnValue(invocation());
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
});

test.each([undefined, { implementation: { kind: "native" } }])(
  "native quick tests bypass cache/pool and use the current draft (%p)",
  async (provider) => {
    apiTranslate.mockResolvedValue({ trText: "译文" });
    await render({ apiSlug: "native", model: "edited", provider });
    await act(async () => button().click());
    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSetting: expect.objectContaining({ model: "edited" }),
        fromLang: "en",
        toLang: "zh-CN",
        useCache: false,
        usePool: false,
      })
    );
    expect(success).toHaveBeenCalledTimes(1);
    expect(updateSetting).not.toHaveBeenCalled();
  }
);

test.each(["script", "declarative"])(
  "%s plugins validate and translate the unsaved draft with current authorization",
  async (kind) => {
    await render({
      ...api,
      provider: { ...api.provider, implementation: { kind } },
    });
    await act(async () => button().click());
    expect(approvedProviderOrigins).toHaveBeenCalledWith(
      expect.objectContaining({ pluginConfig: { model: "draft-model" } })
    );
    expect(invokeService).toHaveBeenCalledWith(
      expect.objectContaining({ pluginConfig: { model: "draft-model" } }),
      "translate",
      expect.objectContaining({
        items: [
          { id: "0", text: "The quick brown fox jumps over the lazy dog." },
        ],
        targetLanguage: "zh-CN",
      }),
      expect.objectContaining({
        approvedOrigins: new Set(["https://example.invalid"]),
      })
    );
    expect(success).toHaveBeenCalledTimes(1);
    expect(apiTranslate).not.toHaveBeenCalled();
    expect(updateSetting).not.toHaveBeenCalled();
  }
);

test("invalid drafts fail before authorization and revoked authorization prevents execution", async () => {
  await render({ ...api, pluginConfig: { model: "" } });
  await act(async () => button().click());
  expect(error).toHaveBeenCalledTimes(1);
  expect(approvedProviderOrigins).not.toHaveBeenCalled();
  await render(api);
  approvedProviderOrigins.mockRejectedValue(new Error("未授权"));
  await act(async () => button().click());
  expect(error).toHaveBeenCalledTimes(2);
  expect(invokeService).not.toHaveBeenCalled();
});

test("empty translations report failure", async () => {
  invokeService.mockReturnValue(invocation(" "));
  await render();
  await act(async () => button().click());
  expect(error).toHaveBeenCalledTimes(1);
  expect(success).not.toHaveBeenCalled();
});

test("duplicate clicks are ignored and switching services aborts and suppresses late results", async () => {
  let finish;
  apiTranslate.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await render({ apiSlug: "one" });
  await act(async () => {
    button().click();
    button().click();
  });
  expect(apiTranslate).toHaveBeenCalledTimes(1);
  const signal = apiTranslate.mock.calls[0][0].signal;
  await render({ apiSlug: "two" });
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ trText: "late" }));
  expect(success).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

test("grant revocation aborts an active plugin test", async () => {
  let finish;
  const call = invocation();
  call.result = new Promise((resolve) => {
    finish = resolve;
  });
  invokeService.mockReturnValue(call);
  await render();
  await act(async () => button().click());
  const signal = invokeService.mock.calls[0][3].signal;
  await act(async () =>
    browser.storage.onChanged.addListener.mock.calls.at(-1)[0](
      { grant: { newValue: undefined } },
      "local"
    )
  );
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ items: [{ id: "0", text: "late" }] }));
  expect(success).not.toHaveBeenCalled();
});
