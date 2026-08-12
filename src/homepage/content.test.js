import { homepageContent, languageOptions } from "./content";

const expectedStoreLocales = {
  en: { chromium: "en", firefox: "en-US" },
  zh_CN: { chromium: "zh-CN", firefox: "zh-CN" },
  zh_TW: { chromium: "zh-TW", firefox: "zh-TW" },
  ja: { chromium: "ja", firefox: "ja" },
  ko: { chromium: "ko", firefox: "ko" },
  fr: { chromium: "fr", firefox: "fr" },
  de: { chromium: "de", firefox: "de" },
  es: { chromium: "es", firefox: "es" },
  vi: { chromium: "vi", firefox: "vi" },
  ru: { chromium: "ru", firefox: "ru" },
};

const expectedOpenOptions = {
  en: "Open Script Settings",
  zh_CN: "打开脚本设置",
  zh_TW: "開啟腳本設定",
  ja: "スクリプト設定を開く",
  ko: "스크립트 설정 열기",
  fr: "Ouvrir les paramètres du script",
  de: "Skripteinstellungen öffnen",
  es: "Abrir configuración del script",
  vi: "Mở cài đặt tập lệnh",
  ru: "Открыть настройки скрипта",
};

describe("homepage content", () => {
  test("provides complete content for every homepage language", () => {
    expect(languageOptions.map(({ value }) => value)).toEqual(
      Object.keys(expectedStoreLocales)
    );

    languageOptions.forEach(({ value }) => {
      const content = homepageContent[value];

      expect(content.title).toBeTruthy();
      expect(content.subtitle).toBeTruthy();
      expect(content.videoTitle).toBeTruthy();
      expect(content.videoSubtitle).toBeTruthy();
      expect(content.videoLabel).toBeTruthy();
      expect(content.features).toHaveLength(9);
      expect(content.installs).toHaveLength(6);
      expect(content.ecosystemProjects).toHaveLength(2);
      expect(content.ecosystemProjects.map(({ name }) => name)).toEqual([
        "kiss-worker",
        "kiss-rules",
      ]);
    });
  });

  test("uses localized browser store links", () => {
    Object.entries(expectedStoreLocales).forEach(
      ([language, { chromium, firefox }]) => {
        const [chrome, edge, firefoxInstall] =
          homepageContent[language].installs;

        expect(chrome.href).toContain(`?hl=${chromium}`);
        expect(edge.href).toContain(`?hl=${chromium}`);
        expect(firefoxInstall.href).toContain(
          `addons.mozilla.org/${firefox}/firefox/`
        );
      }
    );
  });

  test("keeps non-store download targets unchanged", () => {
    const englishTargets = homepageContent.en.installs
      .slice(3)
      .map(({ href }) => href);

    languageOptions.forEach(({ value }) => {
      expect(
        homepageContent[value].installs.slice(3).map(({ href }) => href)
      ).toEqual(englishTargets);
    });
  });

  test("labels the options action as script settings in every language", () => {
    Object.entries(expectedOpenOptions).forEach(([language, label]) => {
      expect(homepageContent[language].openOptions).toBe(label);
    });
  });
});
