/* eslint-disable testing-library/no-container, testing-library/no-node-access, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import ScenePromptSelect from "./ScenePromptSelect";

jest.mock("../Options/SettingsCard", () => ({
  SettingsSelect: ({ options, value, onChange }) =>
    require("react").createElement(
      "select",
      { value, onChange: (event) => onChange(event.target.value) },
      options.map((option) =>
        require("react").createElement(
          "option",
          { key: option.value, value: option.value },
          option.label
        )
      )
    ),
}));
const prompts = [
  { slug: "single", name: "Single", category: "user prompt" },
  { slug: "batch", name: "Batch", category: "batch system prompt" },
  ...[
    "subtitle prompt",
    "summary prompt",
    "dictionary prompt",
    "vlm prompt",
    "unknown",
  ].map((category) => ({ slug: category, name: category, category })),
];
const api = (slug, supported, useBatchFetch = false) => ({
  apiSlug: slug,
  useBatchFetch,
  provider: { capabilities: { translate: { batch: { supported } } } },
});
let container, root, onChange;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onChange = jest.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});
const render = (props) =>
  act(() =>
    root.render(
      <ScenePromptSelect
        i18n={(key, fallback) => fallback || key}
        prompts={prompts}
        value=""
        onChange={onChange}
        {...props}
      />
    )
  );
const options = () =>
  [...container.querySelectorAll("option")].map((option) => option.value);

test("VLM choices include only the current service presets and host VLM prompts", () => {
  const recognitionApi = {
    provider: {
      id: "vision",
      source: { pluginId: "test", serviceId: "vision" },
      defaultPrompts: {
        vlm: [
          { id: "ocr", name: "OCR", userPrompt: "OCR:" },
          { id: "table", name: "Table", userPrompt: "Table Recognition:" },
        ],
      },
    },
  };
  render({ category: "vlm prompt", recognitionApi });
  expect(options()).toEqual([
    "",
    "plugin:test:vision:vlm:ocr",
    "plugin:test:vision:vlm:table",
    "vlm prompt",
  ]);
  render({
    category: "vlm prompt",
    recognitionApi: {
      provider: {
        ...recognitionApi.provider,
        id: "other",
        source: { pluginId: "another", serviceId: "other" },
      },
    },
  });
  expect(options()).not.toContain("plugin:test:vision:vlm:ocr");
  expect(options()).toContain("plugin:another:other:vlm:ocr");
});

test.each([false, true])(
  "batch capability allows both translation categories regardless of switch %s",
  (enabled) => {
    render({ scene: { apiSlug: "a" }, apis: [api("a", true, enabled)] });
    expect(options()).toEqual(["", "single", "batch"]);
  }
);
test("non-batch services only allow single prompts even if their switch is on", () => {
  render({ scene: { apiSlug: "a" }, apis: [api("a", false, true)] });
  expect(options()).toEqual(["", "single"]);
});
test("multiple services use the union of batch capabilities", () => {
  render({
    scene: { apiSlugs: ["a", "b"] },
    apis: [api("a", false), api("b", true)],
  });
  expect(options()).toEqual(["", "single", "batch"]);
  render({ scene: { apiSlugs: ["a"] }, apis: [api("a", false)] });
  expect(options()).toEqual(["", "single"]);
});
test("switching to an incompatible service resets a batch selection once", () => {
  const apis = [api("a", true), api("b", false)];
  render({ value: "batch", scene: { apiSlug: "a" }, apis });
  expect(onChange).not.toHaveBeenCalled();
  render({ value: "batch", scene: { apiSlug: "b" }, apis });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith("");
  expect(container.querySelector("select").value).toBe("");
});
test("unknown inheritance or temporarily missing metadata does not erase saved prompts", () => {
  render({ value: "batch", scene: { apiSlug: "*" }, apis: [] });
  expect(options()).toEqual(["", "single", "batch"]);
  render({ value: "batch", scene: { apiSlug: "a" }, apis: [] });
  render({ value: "batch", scene: { apiSlug: "a" }, apis: [api("a", false)] });
  expect(onChange).not.toHaveBeenCalled();
});
test("explicit recognition category is independent of translation capabilities", () => {
  render({
    category: "vlm prompt",
    scene: { apiSlug: "a" },
    apis: [api("a", false)],
  });
  expect(options()).toEqual(["", "vlm prompt"]);
});
