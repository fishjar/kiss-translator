import Sval from "sval";
import { testPackage } from "./testSupport/packages";
import { createServiceInstance, projectInstanceConfig } from "./instances";
import { createProviderRegistry } from "./registry";
import { runDeclarative } from "./declarative";
import { providerHelpers } from "./sdk";
import {
  createTranslationHelpers,
  TRANSLATION_PROTOCOL_PROMPTS,
  buildMessages,
} from "./sdk/translation";
import { encodeSegments } from "./sdk/segments";
import { resolveApiPromptSettings } from "../config/prompt";
import { withScenePrompt } from "../config/serviceSelection";
import { applyTestPrompt } from "./testInput";
import { getPluginPromptOptions } from "./defaultPrompts";

const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder ||= TextEncoder;
global.TextDecoder ||= TextDecoder;
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

function example(folder) {
  const pack = testPackage(folder);
  return createServiceInstance(
    pack.manifest,
    "chat-completions",
    pack.implementations["chat-completions"],
    {
      apiKey: "secret",
      baseUrl: "https://mock.invalid/v1",
      model: "custom-model",
    },
    "example-test"
  );
}

const rows = [
  { id: "a", text: "Hello & <world>\nnext" },
  { id: "b", text: "World" },
];

function invoke(api, input, wire, streaming, terminal = true) {
  const request = jest.fn(async () => ({
    status: 200,
    body: JSON.stringify({
      choices: [{ message: { content: wire }, finish_reason: "stop" }],
    }),
  }));
  const registry = createProviderRegistry({
    resolveInstance: () => api,
    createContext: (_api, invocation) => ({
      ...invocation,
      config: projectInstanceConfig(api).config,
      helpers: {
        ...providerHelpers,
        translation: {
          ...providerHelpers.translation,
          ...createTranslationHelpers(invocation.translationInput),
        },
      },
      secrets: { ref: (key) => ({ key }) },
      http: {
        request,
        async *stream(value) {
          request(value);
          for (const content of wire)
            yield {
              type: "sse",
              data: JSON.stringify({ choices: [{ delta: { content } }] }),
            };
          if (terminal) {
            yield {
              type: "sse",
              data: JSON.stringify({
                choices: [{ delta: {}, finish_reason: "stop" }],
              }),
            };
            yield { type: "sse", data: "[DONE]" };
          }
        },
      },
    }),
    runners: {
      declarative: runDeclarative,
      script: async (snapshot, handler, value, ctx) => {
        const interpreter = new Sval({ ecmaVer: "latest", sandBox: true });
        interpreter.run(snapshot.code);
        return interpreter.exports[handler](value, ctx.config, ctx);
      },
    },
  });
  return {
    call: registry.invoke(api.apiSlug, "translate", input, {
      streaming: streaming ? "auto" : "disabled",
    }),
    request,
  };
}

describe.each(["declarative", "script"])("SDK %s translation", (folder) => {
  test("declared templates match SDK mode defaults", () => {
    const api = example(folder);
    expect(api.provider.defaultPrompts).toEqual({
      batch: [
        {
          id: "default",
          name: "Default",
          protocol: "json",
          ...TRANSLATION_PROTOCOL_PROMPTS.json,
        },
      ],
      nobatch: [
        {
          id: "default",
          name: "Default",
          protocol: "text",
          ...TRANSLATION_PROTOCOL_PROMPTS.text,
        },
      ],
    });
  });
  test.each(
    ["json", "line", "xml"].flatMap((protocol) =>
      [false, true].map((streaming) => [protocol, streaming])
    )
  )(
    "plugin preset %s selects its encoder and parser (streaming=%s)",
    async (protocol, streaming) => {
      const base = example(folder);
      base.provider.defaultPrompts.batch = ["json", "line", "xml"].map((p) => ({
        id: p,
        name: p,
        protocol: p,
        ...TRANSLATION_PROTOCOL_PROMPTS[p],
      }));
      const slug = getPluginPromptOptions(base, "batch").find(
        (p) => p.id === protocol
      ).slug;
      const api = resolveApiPromptSettings(
        withScenePrompt(base, { promptSlug: slug })
      );
      const input = applyTestPrompt(
        "translate",
        { items: rows, targetLanguage: "zh-CN" },
        api
      );
      expect(input.outputProtocol).toBe(protocol);
      const result = invoke(
        api,
        input,
        encodeSegments(rows, protocol),
        streaming
      );
      await expect(result.call.result).resolves.toEqual({ items: rows });
      expect(
        result.request.mock.calls[0][0].body.messages[1].content
      ).toContain(encodeSegments(rows, protocol));
    }
  );
  test.each(
    ["text", "json", "line", "xml"].flatMap((protocol) =>
      [false, true].map((streaming) => [protocol, streaming])
    )
  )(
    "%s with streaming=%s uses the scene prompt and preserves IDs",
    async (protocol, streaming) => {
      const slug =
        protocol === "text"
          ? "nobatch-translation"
          : `batch-translation-${protocol}`;
      const api = resolveApiPromptSettings(
        withScenePrompt(example(folder), { promptSlug: slug })
      );
      const items = protocol === "text" ? rows.slice(0, 1) : rows;
      const input = applyTestPrompt(
        "translate",
        { items, targetLanguage: "zh-CN" },
        api
      );
      const wire =
        protocol === "text" ? rows[0].text : encodeSegments(rows, protocol);
      const { call, request } = invoke(api, input, wire, streaming);
      const events = [];
      const consume = (async () => {
        for await (const event of call.events) events.push(event);
      })();
      await expect(call.result).resolves.toEqual({ items });
      await consume;
      expect(request.mock.calls[0][0].body.messages).toEqual(
        buildMessages(input)
      );
      expect(input.translationMode).toBe(
        protocol === "text" ? "single" : "batch"
      );
      expect(input.outputProtocol).toBe(protocol);
      expect(events).toEqual(
        expect.arrayContaining(
          streaming
            ? [
                expect.objectContaining({
                  type: expect.stringMatching(/^item\./),
                }),
              ]
            : []
        )
      );
    }
  );
  test("plugin defaults distinguish single text and a one-item JSON batch", async () => {
    for (const batch of [false, true]) {
      const api = resolveApiPromptSettings({
        ...example(folder),
        useBatchFetch: batch,
      });
      const input = applyTestPrompt(
        "translate",
        { items: rows.slice(0, 1), targetLanguage: "zh-CN" },
        api
      );
      const wire = batch ? JSON.stringify(input.items) : rows[0].text;
      await expect(
        invoke(api, input, wire, false).call.result
      ).resolves.toEqual({ items: input.items });
    }
  });
  test("truncated transport and missing aggregate items fail", async () => {
    const api = resolveApiPromptSettings({
      ...example(folder),
      useBatchFetch: true,
    });
    const input = applyTestPrompt(
      "translate",
      { items: rows, targetLanguage: "zh-CN" },
      api
    );
    await expect(
      invoke(api, input, JSON.stringify(rows), true, false).call.result
    ).rejects.toBeDefined();
    await expect(
      invoke(api, input, JSON.stringify(rows.slice(0, 1)), false).call.result
    ).rejects.toMatchObject({ code: "INCOMPLETE_RESPONSE" });
  });
  if (folder === "script") {
    test.each(["text", "json", "line", "xml"])(
      "old script helper call sites inherit %s from the invocation",
      async (protocol) => {
        const api = example(folder);
        api.provider.code = api.provider.code
          .replace(
            "createStreamParser(translationInput)",
            "createStreamParser({items: translationInput.items})"
          )
          .replace(
            "parseResult(result.text, input)",
            "parseResult(result.text, {items: input.items})"
          );
        const input = {
          items: protocol === "text" ? rows.slice(0, 1) : rows,
          targetLanguage: "zh-CN",
          translationMode: protocol === "text" ? "single" : "batch",
          outputProtocol: protocol,
          ...TRANSLATION_PROTOCOL_PROMPTS[protocol],
        };
        const wire =
          protocol === "text" ? rows[0].text : encodeSegments(rows, protocol);
        for (const streaming of [false, true])
          await expect(
            invoke(api, input, wire, streaming).call.result
          ).resolves.toEqual({ items: input.items });
      }
    );
  }
});
