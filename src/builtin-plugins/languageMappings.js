import {
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_QWENMT,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_APIMART,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_YANDEX,
  OPT_TRANS_YANDEXFREE,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
  OPT_TRANS_RUNCRATE,
  OPT_TRANS_CUSTOMIZE,
} from "../config/apiConstants";
import {
  OPT_LANGS_SPEC_NAME,
  OPT_LANGS_SPEC_DEFAULT,
  OPT_LANGS_SPEC_DEFAULT_UC,
} from "../providers/sdk/languageDictionary";

// Vendor code aliases stay with compiled adapters; SDK exposes the common dictionary.
export const OPT_LANGS_TO_SPEC = {
  [OPT_TRANS_BUILTINAI]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_GOOGLE]: OPT_LANGS_SPEC_DEFAULT,
  [OPT_TRANS_GOOGLE_2]: OPT_LANGS_SPEC_DEFAULT,
  [OPT_TRANS_GOOGLE_CLOUD]: OPT_LANGS_SPEC_DEFAULT,
  [OPT_TRANS_YANDEX]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["nb", "no"],
  ]),
  [OPT_TRANS_YANDEXFREE]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", ""],
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["nb", "no"],
  ]),
  [OPT_TRANS_MICROSOFT]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", ""],
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_AZUREAI]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", ""],
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_DEEPL]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT_UC,
    ["auto", ""],
    ["zh-CN", "ZH-HANS"],
    ["zh-TW", "ZH-HANT"],
  ]),
  [OPT_TRANS_DEEPLFREE]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT_UC,
    ["auto", "auto"],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
  [OPT_TRANS_DEEPLX]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT_UC,
    ["auto", "auto"],
    ["zh-CN", "ZH-HANS"],
    ["zh-TW", "ZH-HANT"],
  ]),
  [OPT_TRANS_DEEPSEEK]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OPENCODEGO]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_SILICONFLOW]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_XIAOMIMIMO]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_ALIYUNBAILIAN]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_QWENMT]: new Map([...OPT_LANGS_SPEC_NAME, ["auto", "auto"]]),
  [OPT_TRANS_CEREBRAS]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_ZAI]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_VOLCENGINE]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", "auto"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_BAIDU]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["zh-CN", "zh"],
    ["zh-TW", "cht"],
    ["ar", "ara"],
    ["bg", "bul"],
    ["ca", "cat"],
    ["hr", "hrv"],
    ["da", "dan"],
    ["et", "est"],
    ["fi", "fin"],
    ["fr", "fra"],
    ["hi", "mai"],
    ["ja", "jp"],
    ["ko", "kor"],
    ["lv", "lav"],
    ["ms", "may"],
    ["mt", "mlt"],
    ["nb", "nor"],
    ["ro", "rom"],
    ["ru", "ru"],
    ["sl", "slo"],
    ["es", "spa"],
    ["sv", "swe"],
    ["ta", "tam"],
    ["te", "tel"],
    ["uk", "ukr"],
    ["vi", "vie"],
  ]),
  [OPT_TRANS_TENCENT]: new Map([
    ["auto", "auto"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["en", "en"],
    ["ar", "ar"],
    ["de", "de"],
    ["ru", "ru"],
    ["fr", "fr"],
    ["fi", "fil"],
    ["ko", "ko"],
    ["ms", "ms"],
    ["pt", "pt"],
    ["ja", "ja"],
    ["th", "th"],
    ["tr", "tr"],
    ["es", "es"],
    ["it", "it"],
    ["hi", "hi"],
    ["id", "id"],
    ["vi", "vi"],
  ]),
  [OPT_TRANS_EPHONEAI]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_APIMART]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OPENAI]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_GEMINI]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_GEMINI_2]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_CLAUDE]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OLLAMA]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OPENROUTER]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_ORCAROUTER]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_REQUESTY]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_RUNCRATE]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_CLOUDFLAREAI]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", "en"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
  ]),
  [OPT_TRANS_CUSTOMIZE]: OPT_LANGS_SPEC_NAME,
};

export const OPT_LANGS_FROM_SPEC = {
  ...OPT_LANGS_TO_SPEC,
  [OPT_TRANS_DEEPL]: new Map([
    ...OPT_LANGS_TO_SPEC[OPT_TRANS_DEEPL],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
  [OPT_TRANS_DEEPLX]: new Map([
    ...OPT_LANGS_TO_SPEC[OPT_TRANS_DEEPLX],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
};

const specToCode = (m) =>
  new Map(
    Array.from(m.entries()).map(([k, v]) => {
      if (v === "") {
        return ["auto", "auto"];
      }
      if (v === "zh" || v === "ZH") {
        return [v, "zh-CN"];
      }
      return [v, k];
    })
  );

// 名称->CODE
export const OPT_LANGS_TO_CODE = {};
Object.entries(OPT_LANGS_TO_SPEC).forEach(([t, m]) => {
  OPT_LANGS_TO_CODE[t] = specToCode(m);
});
[OPT_TRANS_DEEPL, OPT_TRANS_DEEPLX].forEach((apiType) => {
  OPT_LANGS_TO_CODE[apiType].set("ZH", "zh-CN");
});
