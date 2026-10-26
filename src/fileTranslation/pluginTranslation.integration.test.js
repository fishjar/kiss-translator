import { TextEncoder } from "util";
import { executeFileMethod } from "./backend";
import { invokeBackgroundPlugin } from "../providers/backgroundInvocation";
import { invokeBridgedService } from "../providers/bridgeInvocation";
import { getSettingWithDefault } from "../libs/storage";
import { clearAllBatchQueue } from "../libs/batchQueue";
import { createInvocation } from "../providers/invocation";

jest.mock("query-string", () => ({
  stringify: (value) => new URLSearchParams(value).toString(),
}));
jest.mock("webextension-polyfill", () => ({
  runtime: {
    getManifest: () => ({ version: "2.1.0" }),
    getURL: (path) => path,
  },
  storage: { onChanged: { addListener: jest.fn(), removeListener: jest.fn() } },
}));
jest.mock("../libs/browser", () => ({
  isBg: () => true,
  isBuiltinAIAvailable: false,
}));
jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
  fnPolyfill: jest.fn(),
}));
jest.mock("../libs/stream", () => ({}));
jest.mock("../libs/storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("../libs/cache", () => ({
  getHttpCachePolyfill: jest.fn(),
  putHttpCachePolyfill: jest.fn(),
}));
jest.mock("../providers/backgroundInvocation", () => ({
  invokeBackgroundPlugin: jest.fn(),
}));
jest.mock("../providers/bridgeInvocation", () => ({
  invokeBridgedService: jest.fn(),
}));
jest.mock("../localAi/fileOperations", () => ({ ALL_OCR_MODELS: [] }));
jest.mock("../localAi/runtime/runtimeHostAdapter", () => ({
  runtimeHost: { request: jest.fn(async () => ({ records: [] })) },
}));

const signal = () => new AbortController().signal;
const kinds = ["pdf", "txt", "markdown", "image", "epub"];
let api;
beforeEach(() => {
  jest.clearAllMocks();
  global.TextEncoder = TextEncoder;
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: require("crypto").webcrypto,
  });
  api = {
    apiSlug: "selected",
    apiType: "external",
    apiName: "Selected plugin",
    httpTimeout: 1,
    useStream: false,
    useBatchFetch: false,
    batchInterval: 1,
    batchSize: 10,
    batchLength: 1000,
    provider: {
      apiVersion: "1",
      source: {
        pluginId: "file-translation-test",
        serviceId: "text",
        version: "1.0.0",
        external: true,
      },
      implementation: { kind: "script" },
      capabilities: {
        translate: {
          outputModes: ["complete", "stream"],
          batch: { supported: true },
        },
      },
    },
  };
  getSettingWithDefault.mockImplementation(async () => ({
    transApis: [api, { ...api, apiSlug: "other" }],
    fileTranslateSetting: Object.fromEntries(
      kinds.map((kind) => [
        kind,
        { apiSlug: "selected", fromLang: "en", toLang: "zh-CN" },
      ])
    ),
    prompts: [],
    subtitleSetting: {},
    translateVariants: false,
  }));
  invokeBackgroundPlugin.mockImplementation((_api, _capability, input) =>
    createInvocation(async () => ({
      items: input.items.map(({ id, text }) => ({ id, text: `译:${text}` })),
      sourceLanguage: "en",
    }))
  );
});
afterEach(() => clearAllBatchQueue());

const translate = (text, abortSignal = signal(), kind = "txt") =>
  executeFileMethod(
    "translateText",
    {
      kind,
      text,
      scene: { apiSlug: "selected" },
    },
    abortSignal
  );

test.each(["script", "declarative"])(
  "file backend routes %s translation through the real API dispatch to the background host",
  async (kind) => {
    api.provider.implementation.kind = kind;
    await expect(translate("hello")).resolves.toEqual({
      text: "译:hello",
      serviceId: "selected",
    });
    expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
    expect(invokeBackgroundPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ apiSlug: "selected" }),
      "translate",
      expect.objectContaining({
        items: [{ id: "0", text: "hello" }],
        targetLanguage: "zh-CN",
      }),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(invokeBridgedService).not.toHaveBeenCalled();
  }
);

test.each(kinds)(
  "%s uses the shared background translation route",
  async (kind) => {
    await expect(translate("hello", signal(), kind)).resolves.toMatchObject({
      text: "译:hello",
      serviceId: "selected",
    });
    expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
    expect(invokeBridgedService).not.toHaveBeenCalled();
  }
);

test.each([false, true])(
  "batched file translation preserves final ordering with streaming=%s",
  async (streaming) => {
    api.useBatchFetch = true;
    api.useStream = streaming;
    invokeBackgroundPlugin.mockImplementation((_api, _capability, input) =>
      createInvocation(async (ctx) => {
        if (streaming)
          for (const item of [...input.items].reverse())
            await ctx.emit({
              type: "item.complete",
              id: item.id,
              text: `译:${item.text}`,
            });
        return {
          items: [...input.items]
            .reverse()
            .map(({ id, text }) => ({ id, text: `译:${text}` })),
        };
      })
    );
    await expect(
      Promise.all([translate("one"), translate("two")])
    ).resolves.toEqual([
      { text: "译:one", serviceId: "selected" },
      { text: "译:two", serviceId: "selected" },
    ]);
    expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
    expect(invokeBackgroundPlugin.mock.calls[0][2].items).toHaveLength(2);
    expect(invokeBridgedService).not.toHaveBeenCalled();
  }
);

test("single streaming translation waits for the final host result", async () => {
  api.useStream = true;
  invokeBackgroundPlugin.mockImplementation((_api, _capability, input) =>
    createInvocation(async (ctx) => {
      await ctx.emit({
        type: "item.delta",
        id: input.items[0].id,
        text: "译:",
      });
      return { items: [{ id: input.items[0].id, text: "译:hello" }] };
    })
  );
  await expect(translate("hello")).resolves.toMatchObject({ text: "译:hello" });
  expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
  expect(invokeBridgedService).not.toHaveBeenCalled();
});

test.each(["NETWORK_DENIED", "PROVIDER_ERROR"])(
  "%s propagates without invoking another service",
  async (code) => {
    const error = Object.assign(new Error(code), { code });
    invokeBackgroundPlugin.mockImplementation(() =>
      createInvocation(async () => {
        throw error;
      })
    );
    await expect(translate("hello")).rejects.toBe(error);
    expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
    expect(invokeBackgroundPlugin.mock.calls[0][0].apiSlug).toBe("selected");
    expect(invokeBridgedService).not.toHaveBeenCalled();
  }
);

test("file translation admits a configured plugin without a local grant", async () => {
  await expect(translate("hello")).resolves.toMatchObject({ text: "译:hello" });
  expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
});

test("file cancellation reaches the host invocation and does not replay", async () => {
  const controller = new AbortController();
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let hostSignal;
  invokeBackgroundPlugin.mockImplementation(
    (_api, _capability, _input, options) =>
      createInvocation(async (ctx) => {
        hostSignal = ctx.signal;
        started();
        await new Promise((_resolve, reject) =>
          ctx.signal.addEventListener(
            "abort",
            () => reject(ctx.signal.reason),
            { once: true }
          )
        );
      }, options)
  );
  const pending = translate("hello", controller.signal);
  await Promise.race([
    ready,
    pending.then(() => {
      throw new Error("Translation settled before the host started");
    }),
  ]);
  const outcome = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await outcome;
  expect(hostSignal.aborted).toBe(true);
  expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
  expect(invokeBridgedService).not.toHaveBeenCalled();
});
