import { applyDefaultApiToRules, applyDefaultApiToSetting } from "./defaultApi";

describe("applyDefaultApiToSetting", () => {
  test("updates input, tranbox, and subtitle api fields only", () => {
    expect(
      applyDefaultApiToSetting(
        {
          inputRule: { apiSlug: "Microsoft", toLang: "en" },
          tranboxSetting: { apiSlugs: ["Microsoft"], toLang: "zh-CN" },
          subtitleSetting: { apiSlug: "Microsoft", toLang: "zh-CN" },
        },
        "OpenAI"
      )
    ).toMatchObject({
      inputRule: { apiSlug: "OpenAI", toLang: "en" },
      tranboxSetting: { apiSlugs: ["OpenAI"], toLang: "zh-CN" },
      subtitleSetting: { apiSlug: "OpenAI", toLang: "zh-CN" },
    });
  });
});

describe("applyDefaultApiToRules", () => {
  test("updates the global rule when it exists", () => {
    expect(
      applyDefaultApiToRules(
        [{ pattern: "*", apiSlug: "Microsoft" }, { pattern: "example.com" }],
        "OpenAI"
      )[0]
    ).toMatchObject({ pattern: "*", apiSlug: "OpenAI" });
  });

  test("creates the global rule when it is missing", () => {
    expect(
      applyDefaultApiToRules([{ pattern: "example.com" }], "OpenAI")
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pattern: "*", apiSlug: "OpenAI" }),
      ])
    );
  });
});
