jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({}),
}));

import { handleTranslate } from "./trans";
import { DEFAULT_API_LIST, OPT_TRANS_DEEPL, OPT_TRANS_DEEPLX } from "../config";
import { fetchData } from "../libs/fetch";

const translate = async (apiType, response) => {
  const apiSetting = {
    ...DEFAULT_API_LIST.find((api) => api.apiType === apiType),
    apiSlug: `${apiType}_test`,
    key: "test-key",
    fetchInterval: 0,
    fetchLimit: 1,
    httpTimeout: 1000,
  };
  fetchData.mockResolvedValueOnce(response);

  for await (const _ of handleTranslate(["hello"], {
    from: "ZH",
    to: "ZH-HANT",
    fromLang: "zh-TW",
    toLang: "zh-TW",
    langMap: new Map(),
    glossary: "",
    apiSetting,
    usePool: false,
  })) {
    // The assertions below cover the generated request.
  }
};

describe("DeepL request language variants", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("sends DeepL's generic Chinese source and Traditional Chinese target", async () => {
    await translate(OPT_TRANS_DEEPL, {
      translations: [{ text: "繁體譯文", detected_source_language: "ZH" }],
    });

    expect(JSON.parse(fetchData.mock.calls[0][1].body)).toMatchObject({
      source_lang: "ZH",
      target_lang: "ZH-HANT",
    });
  });

  test("sends DeepLX's generic Chinese source and Traditional Chinese target", async () => {
    await translate(OPT_TRANS_DEEPLX, {
      data: "繁體譯文",
      source_lang: "ZH",
    });

    expect(JSON.parse(fetchData.mock.calls[0][1].body)).toMatchObject({
      source_lang: "ZH",
      target_lang: "ZH-HANT",
    });
  });
});
