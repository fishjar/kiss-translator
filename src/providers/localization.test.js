import { I18N, UI_LANGS, newI18n } from "../config/i18n";
import { PROVIDER_PLUGINS_I18N } from "../config/locales/providerPlugins";
import { capabilityLabelKeys } from "./capabilityLabels";
import {
  localizeProviderText,
  localizeServiceName,
  providerTextKeys,
} from "./localization";
import { createServiceInstance } from "./instances";
import { packageServiceCatalog } from "./packageCatalog";
import { testManifest as manifest } from "./testSupport/packages";

test("plugin labels and capability labels cover every supported language and preserve placeholders", () => {
  const placeholders = (text) => (text.match(/\{\d+\}/g) || []).sort();
  for (const labels of Object.values(PROVIDER_PLUGINS_I18N)) {
    for (const [locale] of UI_LANGS) {
      expect(labels[locale]).toEqual(expect.any(String));
      expect(labels[locale]).not.toBe("");
      expect(placeholders(labels[locale])).toEqual(placeholders(labels.zh));
    }
  }
  for (const key of [
    ...Object.values(capabilityLabelKeys),
    ...Object.values(providerTextKeys),
  ]) {
    expect(I18N[key]).toBeDefined();
  }
});

test("metadata falls back to English and original text, without altering names or values", () => {
  const i18n = newI18n("en");
  const text = (value, translations) =>
    localizeProviderText(i18n, value, translations, "en");
  expect(text("翻译采样温度")).toBe("Translation temperature");
  expect(text("Custom label")).toBe("Custom label");
  expect(
    localizeProviderText(newI18n("ja"), "Original", { en: "English" }, "ja")
  ).toBe("English");
  expect(text("Original", { en: { invalid: true } })).toBe("Original");
  const api = {
    apiName: "文本生成与翻译",
    provider: { name: "文本生成与翻译" },
    pluginConfig: { model: "custom-model" },
  };
  const original = JSON.stringify(api);
  expect(localizeServiceName(api, text)).toBe(
    "Text generation and translation"
  );
  expect(localizeServiceName({ ...api, apiName: "我的服务" }, text)).toBe(
    "我的服务"
  );
  expect(JSON.stringify(api)).toBe(original);
});

test("localized metadata survives service snapshots and synced catalogs", () => {
  const instance = createServiceInstance(
    manifest,
    "chat-completions",
    "exports.chat = () => ({text:'ok'})",
    {},
    "localized"
  );
  expect(instance.provider.nameI18n).toEqual(manifest.services[0].nameI18n);
  expect(instance.provider.source.pluginNameI18n).toEqual(manifest.nameI18n);
  expect(
    instance.provider.settings.find((field) => field.key === "baseUrl")
      .labelI18n.en
  ).toBe("API URL");
  const catalog = packageServiceCatalog(manifest);
  expect(catalog[0].nameI18n).toEqual(manifest.services[0].nameI18n);
  expect(catalog[0].nameI18n).not.toBe(manifest.services[0].nameI18n);
});

test("Chinese capability names and legacy ASR metadata use the unified terminology", () => {
  for (const [locale, labels] of [
    [
      "zh",
      [
        "对话（LLM）",
        "语音识别（ASR）",
        "AI 词典",
        "智能决策（JEV）",
        "语音合成（TTS）",
        "系统朗读",
      ],
    ],
    [
      "zh_TW",
      [
        "對話（LLM）",
        "語音辨識（ASR）",
        "AI 詞典",
        "智慧決策（JEV）",
        "語音合成（TTS）",
        "系統朗讀",
      ],
    ],
  ]) {
    const i18n = newI18n(locale);
    [
      "chat",
      "transcribe",
      "dictionary",
      "evaluate",
      "synthesizeSpeech",
      "speak",
    ].forEach((capability, index) =>
      expect(i18n(capabilityLabelKeys[capability])).toBe(labels[index])
    );
    expect(localizeProviderText(i18n, "音频转写", undefined, locale)).toBe(
      labels[1]
    );
    expect(
      localizeProviderText(i18n, "语音识别（ASR）", undefined, locale)
    ).toBe(labels[1]);
  }
});
