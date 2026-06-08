import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config/api";
import { packSettingForBackup, unpackSettingFromBackup } from "./settingBackup";

const PROMPT_FIELDS = [
  "systemPrompt",
  "subtitlePrompt",
  "nobatchPrompt",
  "nobatchUserPrompt",
];

const defaultOpenAiApi = DEFAULT_API_LIST.find(
  (api) => api.apiType === OPT_TRANS_OPENAI
);

describe("setting backup prompt packing", () => {
  test("removes prompt fields that exactly match defaults", () => {
    const packed = packSettingForBackup({
      transApis: [{ ...defaultOpenAiApi }],
    });

    PROMPT_FIELDS.forEach((field) => {
      expect(packed.transApis[0]).not.toHaveProperty(field);
      expect(defaultOpenAiApi).toHaveProperty(field);
    });
  });

  test("keeps prompt fields changed by the user", () => {
    const customSystemPrompt = "用户自定义批量系统提示词";
    const packed = packSettingForBackup({
      transApis: [
        {
          ...defaultOpenAiApi,
          systemPrompt: customSystemPrompt,
        },
      ],
    });

    expect(packed.transApis[0].systemPrompt).toBe(customSystemPrompt);
    expect(packed.transApis[0]).not.toHaveProperty("subtitlePrompt");
    expect(packed.transApis[0]).not.toHaveProperty("nobatchPrompt");
    expect(packed.transApis[0]).not.toHaveProperty("nobatchUserPrompt");
  });

  test("restores missing default prompt fields after import", () => {
    const customSubtitlePrompt = "用户自定义字幕提示词";
    const unpacked = unpackSettingFromBackup({
      transApis: [
        {
          apiSlug: defaultOpenAiApi.apiSlug,
          apiName: defaultOpenAiApi.apiName,
          apiType: defaultOpenAiApi.apiType,
          subtitlePrompt: customSubtitlePrompt,
        },
      ],
    });

    expect(unpacked.transApis[0].systemPrompt).toBe(
      defaultOpenAiApi.systemPrompt
    );
    expect(unpacked.transApis[0].subtitlePrompt).toBe(customSubtitlePrompt);
    expect(unpacked.transApis[0].nobatchPrompt).toBe(
      defaultOpenAiApi.nobatchPrompt
    );
    expect(unpacked.transApis[0].nobatchUserPrompt).toBe(
      defaultOpenAiApi.nobatchUserPrompt
    );
  });
});
