import { I18N } from "./i18n";
import { RU_I18N } from "./i18n.ru";

// 主字典作者态 7 语；ru 由 i18n.js 初始化时从 i18n.ru.js 合并（合并语句见 i18n.js 末尾
// `Object.keys(I18N).forEach` 块：`I18N[key].ru = RU_I18N[key] ?? I18N[key].en`），
// 因此 entry.ru 非空不能证明俄语真实存在——必须直读 RU_I18N 断言。
const MAIN_LANGUAGES = ["zh", "en", "zh_TW", "ja", "ko", "tr", "vi"];

// 分支触及键 + 组件引用的操作键（copy/paste/submit 为基线键，此处作字典回归保护）
const AFFECTED_KEYS = [
  "tranbox_auto_height",
  "field_resize_height",
  "subtitle_playground_result",
  "subtitle_playground_source_json",
  "copy",
  "paste",
  "submit",
];

describe("i18n dictionary completeness for resize & playground keys", () => {
  test.each(AFFECTED_KEYS)(
    "key '%s' has non-empty translations across main languages and a real Russian entry",
    (key) => {
      const entry = I18N[key];
      expect(entry).toBeDefined();

      for (const lang of MAIN_LANGUAGES) {
        expect(typeof entry[lang]).toBe("string");
        expect(entry[lang].trim().length).toBeGreaterThan(0);
      }

      // 直读俄语专用字典，防止 en 回退造成假绿
      expect(typeof RU_I18N[key]).toBe("string");
      expect(RU_I18N[key].trim().length).toBeGreaterThan(0);
    }
  );

  test("field_resize_height stays distinct from the tranbox_auto_height setting label across all main languages", () => {
    expect(I18N.field_resize_height).toBeDefined();

    for (const lang of MAIN_LANGUAGES) {
      expect(I18N.field_resize_height[lang]).not.toBe(
        I18N.tranbox_auto_height[lang]
      );
    }
  });
});
