import { renderToStaticMarkup } from "react-dom/server";
import PluginPromptPreview from "./PluginPromptPreview";

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));
jest.mock("../../hooks/Alert", () => ({
  useAlert: () => ({ success: jest.fn(), error: jest.fn() }),
}));

function preview(systemPrompt, userPrompt) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <PluginPromptPreview
      service={{
        defaultPrompts: {
          nobatch: [
            {
              id: "default",
              name: "Example",
              systemPrompt,
              userPrompt,
            },
          ],
        },
      }}
    />
  );
  return container;
}

test.each([undefined, "", " \t\n "])(
  "empty system prompt %j has no field, title or copy button",
  (empty) => {
    const view = preview(empty, "Translate {{text}}");
    expect(view.textContent).not.toContain("系统提示词");
    expect(view.textContent).toContain("用户提示词");
    expect(view.querySelectorAll(".MuiTextField-root")).toHaveLength(1);
    expect(view.querySelectorAll("button")).toHaveLength(1);
  }
);

test("empty user prompt is hidden while populated content stays unchanged", () => {
  const value = "  Preserve this spacing.\n";
  const view = preview(value, "   ");
  expect(view.textContent).toContain("系统提示词");
  expect(view.textContent).not.toContain("用户提示词");
  expect(view.querySelector("textarea").value).toBe(value);
  expect(view.querySelectorAll("button")).toHaveLength(1);
});

test("both populated prompt blocks remain visible", () => {
  const view = preview("System", "User");
  expect(view.querySelectorAll(".MuiTextField-root")).toHaveLength(2);
  expect(view.querySelectorAll("button")).toHaveLength(2);
});
