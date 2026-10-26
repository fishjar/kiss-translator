import { renderToStaticMarkup } from "react-dom/server";
import PluginUpdatePreview from "./PluginUpdatePreview";
import { previewServiceUpdate } from "../../providers/updatePreview";

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));

test("missing template is explained without claiming unchanged and source remains visible", () => {
  const view = renderToStaticMarkup(
    <PluginUpdatePreview
      preview={{
        incomplete: true,
        source: ["file", "https://example.invalid/plugin.zip"],
      }}
    />
  );
  expect(view).toContain("缺少旧模板");
  expect(view).toContain("https://example.invalid/plugin.zip");
  expect(view).not.toContain("无变化");
});

test("upgrade renders constraints, skipped fields and expandable redacted prompt changes", () => {
  const api = {
    provider: {
      settings: [{ key: "key", type: "password" }],
      defaultPrompts: { batch: { systemPrompt: "SECRET_123" } },
    },
    pluginConfig: { key: "SECRET_123" },
  };
  const service = {
    settings: [
      { key: "key", type: "text", required: true },
      {
        key: "addedRequired",
        type: "number",
        required: true,
        min: 1,
        defaultValue: 2,
      },
    ],
    defaultPrompts: { batch: { systemPrompt: "New SECRET_123" } },
  };
  const view = renderToStaticMarkup(
    <PluginUpdatePreview preview={previewServiceUpdate(api, {}, service)} />
  );
  expect(view).toContain("必填");
  expect(view).toContain("addedRequired");
  expect(view).toContain("number");
  expect(view).toContain("无法复制的配置项");
  expect(view).toContain("<details");
  expect(view).toContain("默认提示词变化");
  expect(view).toContain("[REDACTED]");
  expect(view).not.toContain("SECRET_123");
});
