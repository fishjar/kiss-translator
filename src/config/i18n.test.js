import fs from "fs";
import path from "path";
import { parseSync } from "@babel/core";
import { LOCAL_AI_I18N } from "./locales/localAi";
import { FILE_TRANSLATE_I18N } from "./locales/fileTranslate";
import { RULE_EDITOR_I18N } from "./i18n.ruleEditor";
import { SUBTITLE_PLAYGROUND_I18N } from "./locales/subtitlePlayground";
import { TERMINOLOGY_PLAYGROUND_I18N } from "./locales/terminologyPlayground";
import { CUSTOM_API_HELP_I18N } from "./locales/customApiHelp";
import { I18N, UI_LANGS, newI18n } from "./i18n";
import { RU_I18N } from "./i18n.ru";
import { TEXTAREA_GRIP_STYLE_KEYS } from "./textareaGripStyles";

test("covers every supported locale for every registered label", () => {
  const locales = UI_LANGS.map(([locale]) => locale);
  const missing = Object.entries(I18N).flatMap(([key, translations]) =>
    locales
      .filter((locale) => !translations[locale])
      .map((locale) => `${key}:${locale}`)
  );

  expect(missing).toEqual([]);
});

// i18n.js 以 `I18N[key].ru = RU_I18N[key] ?? I18N[key].en` 英文兜底填充
// ru（i18n.js 合并段），上述全语言遍历断言对 ru 缺键恒绿——RU_I18N 的
// 键完整性必须单独对账。本断言锁定 textarea 拉伸手柄功能域 18 键：任一
// 键在 RU_I18N 缺失或为空即红（俄语用户静默回退英文文案的回归守护）。
test("ships every textarea grip label as a native Russian translation", () => {
  // grip_style_* 键从单一事实源 TEXTAREA_GRIP_STYLE_KEYS（config 层手写
  // 清单，与组件内 GRIP_SVGS 注册表的有序恒等由 TextareaResizeGrip.test.js
  // 的双向对账用例锁定）派生：清单键为连字符形态，i18n 键为下划线形态，
  // 派生时以 replace(/-/g, "_") 归一——新增样式须先更新清单方能进入本守护；
  // 4 个功能键与样式清单无关联，保留字面量。
  const gripKeys = [
    "field_resize_height",
    "field_resize_unlock_hint",
    "settings_textarea_grip_style",
    "settings_textarea_grip_style_desc",
    ...TEXTAREA_GRIP_STYLE_KEYS.map(
      (key) => `grip_style_${key.replace(/-/g, "_")}`
    ),
  ];
  const missing = gripKeys.filter(
    (key) =>
      !Object.prototype.hasOwnProperty.call(RU_I18N, key) || !RU_I18N[key]
  );
  expect(missing).toEqual([]);
});

test("provides distinct popup loading and domain status labels", () => {
  expect(I18N.popup_loading.en).toBe("Loading…");
  expect(I18N.popup_loading.en).not.toBe(I18N.popup_translating.en);
  expect(I18N.popup_domain_allowed.en).toBe("Not blocked");
  expect(I18N.popup_domain_allowed.en).not.toBe(I18N.popup_domain_active.en);
  expect(I18N.popup_more_services.en).toBe("More translation services");
});

test("integrates Russian translations with M3 labels and product identity", () => {
  expect(UI_LANGS.map(([locale]) => locale)).toContain("ru");
  expect(I18N.app_name.ru).toBe("KISS Translator");
  expect(I18N.translate.ru).toBe("Перевести");
  expect(I18N.discard_api_changes_confirm.ru).toBe(
    I18N.discard_api_changes_confirm.en
  );
});

test("provides default text when key is not found", () => {
  const i18n = newI18n("en");
  expect(i18n("nonexistent_key")).toBe("nonexistent_key");
  expect(i18n("nonexistent_key", "Fallback")).toBe("Fallback");
  expect(i18n("nonexistent_key", "")).toBe("");
  expect(i18n("app_name")).not.toBe("app_name");
});

test("all static UI translation keys are registered, including calls with a fallback", () => {
  const dictionary = {
    ...I18N,
    ...LOCAL_AI_I18N,
    ...FILE_TRANSLATE_I18N,
    ...RULE_EDITOR_I18N,
    ...SUBTITLE_PLAYGROUND_I18N,
    ...TERMINOLOGY_PLAYGROUND_I18N,
    ...CUSTOM_API_HELP_I18N,
  };
  const missing = [];
  const duplicateLocaleKeys = [];
  const visit = (node, file) => {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "ObjectExpression" &&
      file.includes(`${path.sep}locales${path.sep}`)
    ) {
      const keys = node.properties
        .filter(
          (property) => property.type === "ObjectProperty" && !property.computed
        )
        .map((property) => property.key.name || property.key.value);
      keys.forEach((key, index) => {
        if (keys.indexOf(key) !== index)
          duplicateLocaleKeys.push(`${file}:${key}`);
      });
    }
    if (
      node.type === "CallExpression" &&
      node.callee?.name === "i18n" &&
      node.arguments[0]?.type === "StringLiteral" &&
      !dictionary[node.arguments[0].value]
    ) {
      missing.push(file + ":" + node.arguments[0].value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((item) => visit(item, file));
      else if (value && typeof value === "object") visit(value, file);
    }
  };
  const scan = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (file.endsWith(".js") && !file.includes(".test.")) {
        visit(
          parseSync(fs.readFileSync(file, "utf8"), {
            babelrc: false,
            configFile: false,
            parserOpts: { plugins: ["jsx"] },
          }),
          file
        );
      }
    }
  };
  scan(path.resolve(__dirname, ".."));
  expect(missing).toEqual([]);
  expect(duplicateLocaleKeys).toEqual([]);
});
