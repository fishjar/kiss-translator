import { TERMINOLOGY_I18N } from "./terminology";
import { UI_LANGS } from "../i18n";

test.each(Object.entries(TERMINOLOGY_I18N))(
  "%s covers every supported UI language",
  (key, values) => {
    for (const [language] of UI_LANGS) {
      expect(typeof values[language]).toBe("string");
      expect(values[language].trim()).not.toBe("");
      expect(values[language]).not.toBe(key);
    }
  }
);
