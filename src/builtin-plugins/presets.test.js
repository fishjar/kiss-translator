import { createHash } from "crypto";
import {
  DEFAULT_API_LIST,
  DEFAULT_API_SETTING,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_QWENMT,
  OPT_TRANS_OPENAI,
  OPT_LANGS_TO,
  OPT_LANGS_FROM,
  OPT_LANGS_MAP,
  OPT_LANGS_TO_SPEC,
  OPT_LANGS_FROM_SPEC,
  OPT_LANGS_TO_CODE,
} from "../config/api";
import baseline from "./fixtures/native-preset-baseline.json";
import { NATIVE_PRESET_OVERRIDES } from "./presets";
import { createBuiltinInstance } from "./index";

test("compiled presets preserve unrelated approved defaults while enabling streaming by default", () => {
  expect(DEFAULT_API_LIST).toHaveLength(baseline.presetCount);
  expect(
    createHash("sha256")
      .update(
        JSON.stringify(
          // New terminology defaults are asserted separately from the historical hash.
          DEFAULT_API_LIST.map(({ terms, termsList, ...api }) => ({
            ...api,
            ...(api.apiType === OPT_TRANS_LOCALAI && {
              vlmPromptSlug: "vlm-document",
            }),
            // The historical baseline predates the explicitly requested streaming default.
            useStream: NATIVE_PRESET_OVERRIDES[api.apiType].useStream ?? false,
            // Normalize only the newly approved timeout default for the historical hash.
            httpTimeout: 30,
          }))
        )
      )
      .digest("hex")
  ).toBe(baseline.sha256);
  expect(
    DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_LOCALAI)
      .vlmPromptSlug
  ).toBe("");
  expect(DEFAULT_API_SETTING.apiType).toBe(OPT_TRANS_MICROSOFT);
  expect(DEFAULT_API_SETTING.httpTimeout).toBe(120);
  expect(DEFAULT_API_LIST.every((api) => api.httpTimeout === 120)).toBe(true);
  for (const api of DEFAULT_API_LIST)
    expect(api.useStream).toBe(api.apiType !== OPT_TRANS_QWENMT);
  for (const api of DEFAULT_API_LIST)
    expect(
      Object.prototype.hasOwnProperty.call(NATIVE_PRESET_OVERRIDES, api.apiType)
    ).toBe(true);
});

test("new native instances inherit streaming presets", () => {
  expect(
    createBuiltinInstance(OPT_TRANS_QWENMT, "qwen", "QwenMT").useStream
  ).toBe(false);
  expect(
    createBuiltinInstance(OPT_TRANS_OPENAI, "openai", "OpenAI").useStream
  ).toBe(true);
});

test("native defaults and new instances start without terminology overrides", () => {
  for (const api of [DEFAULT_API_SETTING, ...DEFAULT_API_LIST]) {
    expect(api.terms).toBe("");
    expect(api.termsList).toEqual([]);
  }
  for (const api of DEFAULT_API_LIST) {
    const instance = createBuiltinInstance(api.apiType, "test", "Test");
    expect(instance.terms).toBe("");
    expect(instance.termsList).toEqual([]);
  }
});

test("public SDK dictionary and native language aliases preserve every previous mapping", () => {
  const mappings = {
    common: {
      to: OPT_LANGS_TO,
      from: OPT_LANGS_FROM,
      names: [...OPT_LANGS_MAP],
    },
    to: Object.fromEntries(
      Object.entries(OPT_LANGS_TO_SPEC).map(([id, table]) => [id, [...table]])
    ),
    from: Object.fromEntries(
      Object.entries(OPT_LANGS_FROM_SPEC).map(([id, table]) => [id, [...table]])
    ),
    codes: Object.fromEntries(
      Object.entries(OPT_LANGS_TO_CODE).map(([id, table]) => [id, [...table]])
    ),
  };
  expect(
    createHash("sha256").update(JSON.stringify(mappings)).digest("hex")
  ).toBe(baseline.languageMappingsSha256);
});
