import { dictHandlers } from "./DictHandler";

jest.mock("../../apis", () => ({
  apiMicrosoftDict: jest.fn(),
  apiYoudaoDict: jest.fn(),
}));

jest.mock("./AudioBtn", () => ({
  AudioBtn: () => null,
  BaiduAudioBtn: () => null,
}));

const translate = jest.fn();

beforeEach(() => {
  translate.mockImplementation(async (value) => `localized:${value}`);
});

test("localizes every rendered Bing definition field", async () => {
  const data = {
    word: "translator",
    trs: [{ pos: "网络", def: "翻译员" }],
    presents: ["复数: translators"],
    ecs: [{ pos: "n.", lis: ["翻译工作者"] }],
    sentences: [
      { eng: "A translator works.", chs: "翻译员工作。" },
      { eng: "Ask the translator.", chs: "询问翻译员。" },
      { eng: "Third hidden example.", chs: "第三个例句。" },
    ],
    aus: [{ key: "英", phonetic: "trænsˈleɪtə(r)" }],
  };

  expect(dictHandlers.Bing.getLocalizationValues(data)).toEqual([
    "网络",
    "翻译员",
    "复数",
    "翻译工作者",
    "翻译员工作。",
    "询问翻译员。",
    "详细释义",
    "例句",
  ]);
  const result = await dictHandlers.Bing.localize(data, translate);

  expect(result).toMatchObject({
    word: "translator",
    trs: [{ pos: "localized:网络", def: "localized:翻译员" }],
    presents: ["localized:复数: translators"],
    ecs: [{ pos: "n.", lis: ["localized:翻译工作者"] }],
    sentences: [
      { eng: "A translator works.", chs: "localized:翻译员工作。" },
      { eng: "Ask the translator.", chs: "localized:询问翻译员。" },
      { eng: "Third hidden example.", chs: "第三个例句。" },
    ],
    labels: {
      details: "localized:详细释义",
      examples: "localized:例句",
    },
  });
  expect(result.aus).toEqual([{ key: "UK", phonetic: "trænsˈleɪtə(r)" }]);
  expect(translate).toHaveBeenCalledWith("复数");
  expect(translate).not.toHaveBeenCalledWith("复数: translators");
});

test("keeps Bing English inflections when only the Chinese labels are translated", async () => {
  const data = {
    presents: ["复数: translators", "过去式: walked", "translators"],
  };
  const googleLike = jest.fn(async (value) => {
    const translated = {
      复数: "複数形",
      过去式: "過去形",
      "复数: translators": "複数形: 翻訳者",
      "过去式: walked": "過去形: 歩いた",
      translators: "翻訳者",
    };
    return translated[value] ?? value;
  });

  expect(dictHandlers.Bing.getLocalizationValues(data)).toEqual([
    "复数",
    "过去式",
  ]);
  const result = await dictHandlers.Bing.localize(data, googleLike, {
    toLang: "ja",
  });

  expect(googleLike.mock.calls.map(([value]) => value)).toEqual([
    "复数",
    "过去式",
    "详细释义",
    "例句",
  ]);
  expect(result.presents).toEqual([
    "複数形: translators",
    "過去形: walked",
    "translators",
  ]);
});

test("localizes every rendered Youdao definition field", async () => {
  const data = {
    ec: {
      word: {
        "return-phrase": "translator",
        trs: [{ pos: "n.", tran: "翻译员" }],
      },
    },
    blng_sents_part: {
      "sentence-pair": [
        {
          sentence: "A translator works.",
          "sentence-translation": "翻译员工作。",
        },
        {
          sentence: "Ask the translator.",
          "sentence-translation": "询问翻译员。",
        },
        {
          sentence: "Third hidden example.",
          "sentence-translation": "第三个例句。",
        },
      ],
    },
  };

  expect(dictHandlers.Youdao.getLocalizationValues(data)).toEqual([
    "n.",
    "翻译员",
    "翻译员工作。",
    "询问翻译员。",
    "例句",
  ]);
  const result = await dictHandlers.Youdao.localize(data, translate);

  expect(result).toMatchObject({
    ec: {
      word: {
        "return-phrase": "translator",
        trs: [{ pos: "localized:n.", tran: "localized:翻译员" }],
      },
    },
    blng_sents_part: {
      "sentence-pair": [
        { "sentence-translation": "localized:翻译员工作。" },
        { "sentence-translation": "localized:询问翻译员。" },
        { "sentence-translation": "第三个例句。" },
      ],
    },
    labels: {
      examples: "localized:例句",
      pronunciationUk: "UK",
      pronunciationUs: "US",
    },
  });
});

test("keeps Chinese pronunciation labels for a Traditional Chinese target", async () => {
  const bingData = {
    aus: [
      { key: "英", phonetic: "trænsˈleɪtə(r)" },
      { key: "美", phonetic: "trænsˈleɪtər" },
    ],
  };
  const youdaoData = { ec: { word: { trs: [] } } };

  const bingResult = await dictHandlers.Bing.localize(bingData, translate, {
    toLang: "zh-TW",
  });
  const youdaoResult = await dictHandlers.Youdao.localize(
    youdaoData,
    translate,
    { toLang: "zh-TW" }
  );

  expect(bingResult.aus.map(({ key }) => key)).toEqual(["英", "美"]);
  expect(youdaoResult.labels).toMatchObject({
    pronunciationUk: "英",
    pronunciationUs: "美",
  });
});
