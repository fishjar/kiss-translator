import {
  buildMessages,
  parseResult,
  createTranslationStreamParser,
  createTranslationHelpers,
  TRANSLATION_PROTOCOL_PROMPTS,
} from "./translation";
import { encodeSegments } from "./segments";
import textDefaults from "./defaultTextTaskPrompts.json";
import { buildTextTaskMessages } from "./textTasks";
import {
  resolveApiPromptSettings,
  findPromptBySlug,
} from "../../config/prompt";
import { withScenePrompt } from "../../config/serviceSelection";
import { translationOptions } from "../defaultPrompts";

jest.mock("@streamparser/json", () =>
  jest.requireActual(
    "../../../node_modules/@streamparser/json/dist/cjs/index.js"
  )
);
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder ||= TextEncoder;
global.TextDecoder ||= TextDecoder;

const items = [
  { id: "a", text: "中文 & <x>\nsecond" },
  { id: "b", text: "next | row" },
];
const outputs = {
  json: JSON.stringify(items),
  line: encodeSegments(items, "line"),
  xml: encodeSegments(items, "xml"),
  text: items[0].text,
};
const inputFor = (outputProtocol) => ({
  items: outputProtocol === "text" ? items.slice(0, 1) : items,
  targetLanguage: "en",
  translationMode: outputProtocol === "text" ? "single" : "batch",
  outputProtocol,
  ...TRANSLATION_PROTOCOL_PROMPTS[outputProtocol],
});

test.each(["line", "xml"])(
  "%s default template uses explicit tone and empty glossary renders empty",
  (protocol) => {
    const content = buildMessages({ ...inputFor(protocol), tone: "formal" })
      .map((m) => m.content)
      .join("\n");
    expect(content).toContain("formal");
    const custom = buildMessages({
      ...inputFor(protocol),
      systemPrompt: "{{unknown}}",
      userPrompt: "{{glossary}}",
      tone: "formal",
    });
    expect(custom).toEqual([{ role: "system", content: "{{unknown}}" }]);
  }
);

test("default SDK dictionary uses glossary, custom template can omit it", () => {
  const input = {
    text: "bank",
    language: "zh",
    glossary: { bank: "河岸" },
    instructions: textDefaults.dictionary.systemPrompt,
    userPrompt: textDefaults.dictionary.userPrompt,
  };
  expect(buildTextTaskMessages("dictionary", input)[1].content).toContain(
    "- bank: 河岸"
  );
  expect(
    buildTextTaskMessages("dictionary", {
      ...input,
      instructions: "Define",
      userPrompt: "{{text}}",
    })[1].content
  ).toBe("bank");
});

test("empty standalone SDK placeholders disappear without removing static labels", () => {
  expect(
    buildMessages({
      ...inputFor("line"),
      systemPrompt: "{{unknown}}",
      userPrompt: "{{glossary}}\n{{tone}}\nTitle: {{title}}\n{{segments}}",
    })[1].content
  ).toBe(`Title: \n${encodeSegments(items, "line")}`);
  expect(
    buildTextTaskMessages("dictionary", {
      text: "bank",
      instructions: "Define",
      userPrompt: "{{glossary}}\nTitle: {{title}}\n{{text}}",
    })[1].content
  ).toBe("Title: \nbank");
});

test.each(Object.keys(outputs))(
  "%s default prompts, complete and split streaming results agree",
  async (protocol) => {
    const input = inputFor(protocol);
    expect(
      buildMessages(input).find((m) => m.role === "user").content
    ).toContain(
      protocol === "text" ? items[0].text : encodeSegments(items, protocol)
    );
    expect(
      buildMessages(input)
        .map((message) => message.content)
        .join("\n")
    ).toContain(
      protocol === "text"
        ? "translated text"
        : protocol === "json"
          ? "JSON"
          : protocol === "line"
            ? "ID | Text"
            : "<root>"
    );
    expect(parseResult(outputs[protocol], input)).toEqual({
      items: input.items,
    });
    for (let split = 0; split <= outputs[protocol].length; split++) {
      const parser = await createTranslationStreamParser(input);
      const events = [
        ...parser.push(outputs[protocol].slice(0, split)),
        ...parser.push(outputs[protocol].slice(split)),
      ];
      expect(parser.finish()).toEqual({ items: input.items });
      expect(
        events.every((event) =>
          input.items.some((item) => item.id === event.id)
        )
      ).toBe(true);
    }
  }
);

test.each(["json", "line", "xml"])(
  "%s rejects missing, duplicate, unknown and empty results",
  async (protocol) => {
    const input = inputFor(protocol);
    for (const bad of [
      items.slice(0, 1),
      [items[0], items[0]],
      [items[0], { id: "unknown", text: "x" }],
      [items[0], { id: "b", text: "" }],
    ]) {
      const raw =
        protocol === "json"
          ? JSON.stringify(bad)
          : protocol === "line"
            ? bad
                .map(
                  (item) => `${item.id} | ${item.text.replaceAll("\n", "<br>")}`
                )
                .join("\n")
            : `<root>${bad.map((item) => `<t id="${item.id}">${item.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</t>`).join("")}</root>`;
      expect(() => parseResult(raw, input)).toThrow();
      const parser = await createTranslationStreamParser(input);
      expect(() => {
        parser.push(raw);
        parser.finish();
      }).toThrow();
    }
  }
);

test("text is single-item only and legacy helper options remain JSON", async () => {
  expect(() => buildMessages({ ...inputFor("text"), items })).toThrow("mode");
  expect(() => parseResult("", inputFor("text"))).toThrow("Empty");
  const helpers = createTranslationHelpers(inputFor("line"));
  expect(helpers.parseResult(outputs.line, { items })).toEqual({ items });
  const stream = await helpers.createStreamParser({ items });
  stream.push(outputs.line);
  expect(stream.finish()).toEqual({ items });
  expect(parseResult(outputs.json, { items })).toEqual({ items });
  expect(() =>
    parseResult('<root><t id="a">partial', inputFor("xml"))
  ).toThrow();
});

test.each([
  "batch-translation-json",
  "batch-translation-line",
  "batch-translation-xml",
  "nobatch-translation",
])("scene prompt %s selects encoding and parsing together", (slug) => {
  const api = resolveApiPromptSettings(
    withScenePrompt(
      {
        apiSlug: "plugin",
        provider: {
          implementation: { kind: "script" },
          capabilities: { translate: { batch: { supported: true } } },
        },
      },
      { promptSlug: slug }
    )
  );
  const options = translationOptions(api);
  const batch = slug.startsWith("batch-");
  const protocol = batch ? slug.split("-").at(-1) : "text";
  expect(options).toEqual({
    translationMode: batch ? "batch" : "single",
    outputProtocol: protocol,
  });
  const prompt = findPromptBySlug([], slug);
  const input = {
    ...inputFor(protocol),
    ...options,
    systemPrompt: batch ? api.systemPrompt : api.nobatchPrompt,
    userPrompt: batch ? api.batchUserPrompt : api.nobatchUserPrompt,
  };
  expect(input.systemPrompt).toBe(prompt.systemPrompt);
  expect(buildMessages(input).find((m) => m.role === "user").content).toContain(
    protocol === "text" ? items[0].text : encodeSegments(input.items, protocol)
  );
  expect(parseResult(outputs[protocol], input)).toEqual({ items: input.items });
});

test("single-item batches retain their chosen protocol", () => {
  const input = { ...inputFor("xml"), items: items.slice(0, 1) };
  expect(buildMessages(input).find((m) => m.role === "user").content).toContain(
    encodeSegments(input.items, "xml")
  );
  expect(parseResult(encodeSegments(input.items, "xml"), input)).toEqual({
    items: input.items,
  });
});

test("explicit empty prompt templates use protocol defaults", () => {
  expect(
    buildMessages({ ...inputFor("text"), systemPrompt: "", userPrompt: "" })
  ).toEqual(
    buildMessages({
      ...inputFor("text"),
      systemPrompt: undefined,
      userPrompt: undefined,
    })
  );
});

test("empty inline fields and empty presets use defaults without mutating storage", () => {
  const base = {
    provider: {
      implementation: { kind: "script" },
      capabilities: { translate: { outputModes: ["text"] } },
    },
    nobatchPrompt: "",
    nobatchUserPrompt: "",
  };
  const resolved = resolveApiPromptSettings(base);
  expect((resolved.nobatchPrompt + resolved.nobatchUserPrompt).trim()).not.toBe(
    ""
  );
  const explicit = resolveApiPromptSettings(
    { ...base, nobatchPromptSlug: "empty" },
    [
      {
        slug: "empty",
        category: "user prompt",
        systemPrompt: "",
        userPrompt: "",
      },
    ]
  );
  expect((explicit.nobatchPrompt + explicit.nobatchUserPrompt).trim()).not.toBe(
    ""
  );
});
