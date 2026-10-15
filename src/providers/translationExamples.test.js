import fs from "fs";
import path from "path";
import Sval from "sval";
import { zipSync } from "fflate";
import { readProviderPackage } from "./package";
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

const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder ||= TextEncoder;
global.TextDecoder ||= TextDecoder;
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

function example(folder) {
  const root = path.join(process.cwd(), "docs/plugins/examples", folder);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"))
  );
  const files = { "manifest.json": Buffer.from(JSON.stringify(manifest)) };
  for (const service of manifest.services)
    files[service.implementation.entry] = fs.readFileSync(
      path.join(root, service.implementation.entry)
    );
  const pack = readProviderPackage(zipSync(files));
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

test("guide and example READMEs publish the same four SDK default templates", () => {
  for (const file of [
    "docs/plugins/plugin-development-guide.md",
    "docs/plugins/examples/deepseek/README.md",
    "docs/plugins/examples/openai-compatible-bundle/README.md",
  ]) {
    const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const templates = [...text.matchAll(/```json\r?\n([\s\S]*?)```/g)]
      .map((match) => {
        try {
          return JSON.parse(match[1]);
        } catch {
          return null;
        }
      })
      .find(
        (value) =>
          value &&
          Object.keys(TRANSLATION_PROTOCOL_PROMPTS).every((key) => value[key])
      );
    expect(templates).toEqual(TRANSLATION_PROTOCOL_PROMPTS);
  }
});
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

describe.each(["deepseek", "openai-compatible-bundle"])(
  "distributed %s translation",
  (folder) => {
    test("declared templates match SDK mode defaults", () => {
      const api = example(folder);
      expect(api.provider.defaultPrompts).toEqual({
        batch: { protocol: "json", ...TRANSLATION_PROTOCOL_PROMPTS.json },
        nobatch: { protocol: "text", ...TRANSLATION_PROTOCOL_PROMPTS.text },
      });
    });
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
        if (streaming)
          expect(events.some((event) => event.type.startsWith("item."))).toBe(
            true
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
    test("old snapshots with no mode or template protocol retain JSON", async () => {
      const api = example(folder);
      api.provider.defaultPrompts.nobatch = {
        ...TRANSLATION_PROTOCOL_PROMPTS.json,
      };
      const input = { items: rows.slice(0, 1), targetLanguage: "zh-CN" };
      await expect(
        invoke(api, input, JSON.stringify(input.items), false).call.result
      ).resolves.toEqual({ items: input.items });
    });
    if (folder === "openai-compatible-bundle") {
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
  }
);
