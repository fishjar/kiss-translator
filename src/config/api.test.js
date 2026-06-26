import {
  normalizeApiModelListUrls,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENAI,
} from "./api";

describe("normalizeApiModelListUrls", () => {
  test("旧数据缺少 modelListUrl 时按接口类型补充默认模型列表 URL", () => {
    const transApis = [
      {
        apiSlug: "DeepSeek",
        apiType: OPT_TRANS_DEEPSEEK,
      },
    ];

    const nextApis = normalizeApiModelListUrls(transApis);

    expect(nextApis).not.toBe(transApis);
    expect(nextApis[0]).toEqual({
      apiSlug: "DeepSeek",
      apiType: OPT_TRANS_DEEPSEEK,
      modelListUrl: "https://api.deepseek.com/models",
    });
  });

  test("用户已明确保存为空字符串时不覆盖 modelListUrl", () => {
    const transApis = [
      {
        apiSlug: "OpenAI",
        apiType: OPT_TRANS_OPENAI,
        modelListUrl: "",
      },
    ];

    const nextApis = normalizeApiModelListUrls(transApis);

    expect(nextApis).toBe(transApis);
    expect(nextApis[0].modelListUrl).toBe("");
  });

  test("没有官方默认模型列表接口的旧数据补为空字符串", () => {
    const transApis = [
      {
        apiSlug: "CloudflareAI",
        apiType: OPT_TRANS_CLOUDFLAREAI,
      },
    ];

    const nextApis = normalizeApiModelListUrls(transApis);

    expect(nextApis).not.toBe(transApis);
    expect(nextApis[0].modelListUrl).toBe("");
  });

  test("没有需要补充的字段时保持原数组引用", () => {
    const transApis = [
      {
        apiSlug: "DeepSeek",
        apiType: OPT_TRANS_DEEPSEEK,
        modelListUrl: "https://custom.example.com/models",
      },
    ];

    expect(normalizeApiModelListUrls(transApis)).toBe(transApis);
  });
});
