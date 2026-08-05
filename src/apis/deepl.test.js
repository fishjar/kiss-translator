import { genDeeplFree } from "./deepl";

describe("genDeeplFree", () => {
  const getCommonJobParams = (toLang) =>
    genDeeplFree({
      texts: ["hello"],
      from: "EN",
      to: "ZH",
      toLang,
    }).body.params.commonJobParams;

  test("sets the Simplified Chinese regional variant", () => {
    expect(getCommonJobParams("zh-CN")).toMatchObject({
      regionalVariant: "zh-Hans",
    });
  });

  test("sets the Traditional Chinese regional variant", () => {
    expect(getCommonJobParams("zh-TW")).toMatchObject({
      regionalVariant: "zh-Hant",
    });
  });

  test("omits the regional variant for non-Chinese targets", () => {
    expect(getCommonJobParams("en")).not.toHaveProperty("regionalVariant");
  });
});
