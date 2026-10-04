import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Navigator from "./Navigator";
import { I18N } from "../../config/i18n";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockUiLang = "en";
let mockLabels = {};

jest.mock("../../hooks/I18n", () => ({
  useI18n:
    () =>
    (key, defaultText = key) =>
      mockLabels[key] ?? defaultText,
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: { uiLang: mockUiLang } }),
}));
jest.mock("../../components/Logo", () => {
  const React = require("react");
  return () => React.createElement("span", null, "logo");
});

beforeEach(() => {
  mockUiLang = "en";
  mockLabels = {};
});

describe("settings navigator semantics", () => {
  test.each([
    ["tr", "İstem Yönetimi", "istem"],
    ["tr", "İstem Yönetimi", "İSTEM"],
    ["tr_TR", "İstem Yönetimi", "istem"],
    ["zh_TW", "Prompt Management", "PROMPT"],
    [undefined, "Prompt Management", "PROMPT"],
    ["invalid_locale!", "Prompt Management", "PROMPT"],
  ])(
    "filters with UI locale %s, label %s, and query %s",
    (uiLang, label, query) => {
      mockUiLang = uiLang;
      mockLabels = { prompt_management: label };
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() =>
        root.render(
          <MemoryRouter>
            <Navigator open />
          </MemoryRouter>
        )
      );

      const input = container.querySelector('input[type="search"]');
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set.call(input, query);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      const link = container.querySelector(
        '.kt-options-nav__link[href="/prompts"]'
      );
      expect(link).not.toBeNull();
      expect(link.textContent).toBe(label);

      act(() => root.unmount());
      container.remove();
    }
  );

  test("exposes dialog semantics only for the open mobile navigator", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleClose = jest.fn();

    act(() =>
      root.render(
        <MemoryRouter>
          <Navigator open isMobile onClose={handleClose} />
        </MemoryRouter>
      )
    );

    const navigation = container.querySelector("#kt-options-navigation");
    expect(navigation.getAttribute("role")).toBe("dialog");
    expect(navigation.getAttribute("aria-modal")).toBe("true");
    expect(navigation.getAttribute("aria-labelledby")).toBe(
      "kt-options-navigation-title"
    );
    expect(navigation.getAttribute("tabindex")).toBe("-1");
    expect(
      container.querySelector("#kt-options-navigation-title").textContent
    ).toBe("app_name");
    const closeButton = container.querySelector(
      'button[aria-label="options_close_navigation"]'
    );
    expect(closeButton).not.toBeNull();
    act(() => closeButton.click());
    expect(handleClose).toHaveBeenCalledTimes(1);

    act(() =>
      root.render(
        <MemoryRouter>
          <Navigator open={false} isMobile={false} />
        </MemoryRouter>
      )
    );
    expect(navigation.hasAttribute("role")).toBe(false);
    expect(navigation.hasAttribute("aria-modal")).toBe(false);
    expect(navigation.hasAttribute("tabindex")).toBe(false);
    expect(
      container.querySelector('button[aria-label="options_close_navigation"]')
    ).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});

test("groups concrete Chinese settings below their navigation category and links to the field", () => {
  mockUiLang = "zh";
  mockLabels = Object.fromEntries(
    Object.entries(I18N).map(([key, translations]) => [key, translations.zh])
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = jest.fn();
  act(() =>
    root.render(
      <MemoryRouter>
        <Navigator open isMobile onClose={onClose} />
      </MemoryRouter>
    )
  );
  const input = container.querySelector('input[type="search"]');
  const search = (value) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  search("超时");
  const results = [...container.querySelectorAll(".kt-options-nav__result")];
  expect(results).toHaveLength(3);
  for (const result of results) {
    const category = result.querySelector(".kt-options-nav__link");
    const list = result.querySelector("ul");
    expect(list.getAttribute("aria-label")).toBe(category.textContent);
    expect(category.nextElementSibling).toBe(list);
  }
  const target = container.querySelector(
    'a[href="/input?setting=combo_timeout"]'
  );
  expect(target.textContent).toBe(I18N.combo_timeout.zh);
  act(() => target.click());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(target.getAttribute("aria-current")).toBe("location");

  search("无此设置xyz");
  expect(container.querySelector(".kt-options-nav__empty").textContent).toBe(
    I18N.options_no_results.zh
  );
  search("  ");
  expect(container.querySelectorAll(".kt-options-nav__link")).toHaveLength(13);
  expect(container.querySelectorAll(".kt-options-nav__setting")).toHaveLength(
    0
  );
  act(() => root.unmount());
  container.remove();
});
