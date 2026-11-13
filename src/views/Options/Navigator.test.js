import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import Navigator from "./Navigator";
import { I18N } from "../../config/i18n";
import * as settingsSearch from "./search";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockUiLang = "en";
let mockLabels = {};

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => {
    const { useMemo } = jest.requireActual("react");
    const labels = mockLabels;
    return useMemo(
      () =>
        (key, defaultText = key) =>
          labels[key] ?? defaultText,
      [labels]
    );
  },
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: { uiLang: mockUiLang } }),
}));
const mockOpenFileTranslatePage = jest.fn();
jest.mock("../../libs/navigation", () => ({
  openFileTranslatePage: () => mockOpenFileTranslatePage(),
}));
jest.mock("../../libs/client", () => ({
  isAutoTranslateClipboardSupported: true,
}));

beforeEach(() => {
  mockUiLang = "en";
  mockLabels = {};
  mockOpenFileTranslatePage.mockReset();
});

function renderSearchNavigator() {
  mockUiLang = "zh";
  mockLabels = Object.fromEntries(
    Object.entries(I18N).map(([key, translations]) => [key, translations.zh])
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = () =>
    act(() =>
      root.render(
        <MemoryRouter>
          <Navigator open />
        </MemoryRouter>
      )
    );
  render();
  const input = container.querySelector('input[type="search"]');
  const nav = container.querySelector("nav");
  const change = (value, isComposing = false) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(input, value);
      input.dispatchEvent(
        new InputEvent("input", { bubbles: true, isComposing })
      );
    });
  const composition = (type) =>
    act(() =>
      input.dispatchEvent(new CompositionEvent(type, { bubbles: true }))
    );
  return {
    container,
    input,
    nav,
    change,
    composition,
    rerender: render,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

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
      mockLabels = { prompt_management: "Templates", prompt_name: label };
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
      expect(link.textContent).toBe("Templates");
      const field = container.querySelector(
        'a[href="/prompts?setting=prompt_name"]'
      );
      expect(field.textContent).toBe(label);
      expect(field.querySelector("mark").textContent).toBe(label.split(" ")[0]);
      expect(link.querySelector("mark")).toBeNull();

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

  test("clicking file-translate external button invokes openFileTranslatePage", () => {
    mockLabels = { file_translate: "文件翻译" };
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

    const buttons = Array.from(
      container.querySelectorAll("button.kt-options-nav__link")
    );
    const fileTranslateBtn = buttons.find((btn) =>
      btn.textContent.includes("文件翻译")
    );
    expect(fileTranslateBtn).toBeDefined();

    act(() => fileTranslateBtn.click());
    expect(mockOpenFileTranslatePage).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);

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
  expect(target.querySelector("mark").textContent).toBe("超时");
  act(() => target.click());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(target.getAttribute("aria-current")).toBe("location");

  search("字幕");
  const subtitle = container.querySelector('a[href="/subtitle"]').parentElement;
  const subtitleFields = [
    ...subtitle.querySelectorAll(".kt-options-nav__setting"),
  ];
  expect(subtitleFields.map((field) => field.getAttribute("href"))).toEqual([
    "/subtitle?setting=toggle_subtitle_translate",
    "/subtitle?setting=settings_subtitle_auto_start",
    "/subtitle?setting=show_subtitle_list",
    "/subtitle?setting=subtitle_loading_notification",
    "/subtitle?setting=remember_subtitle_position",
  ]);
  for (const field of subtitleFields)
    expect(field.querySelector("mark").textContent).toBe("字幕");
  const latex = container.querySelector('a[href="/?setting=parse_latex"]');
  expect(latex.querySelector(".kt-options-nav__match-detail").textContent).toBe(
    I18N.parse_latex_helper.zh
  );
  expect(latex.querySelector("mark").textContent).toBe("字幕");
  expect(container.querySelector(".kt-options-nav__link mark")).toBeNull();

  search("深色");
  const appearance = container.querySelector(
    'a[href="/styles?setting=settings_appearance_mode"]'
  );
  expect(
    appearance.querySelector(".kt-options-nav__match-detail mark").textContent
  ).toBe("深色");

  search("通用");
  expect(container.querySelector(".kt-options-nav__empty")).not.toBeNull();

  search("无此设置xyz");
  expect(container.querySelector(".kt-options-nav__empty").textContent).toBe(
    I18N.options_no_results.zh
  );
  search("  ");
  expect(container.querySelectorAll(".kt-options-nav__link")).toHaveLength(17);
  expect(
    container.querySelectorAll('.kt-options-nav__link[href="/image-translate"]')
  ).toHaveLength(1);
  expect(container.querySelectorAll(".kt-options-nav__setting")).toHaveLength(
    0
  );
  act(() => root.unmount());
  container.remove();
});

test("shows clear while text is present, including after blur, and clears its target while preserving the page", () => {
  function Location() {
    const location = useLocation();
    return (
      <output>
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
    );
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <MemoryRouter
        initialEntries={["/input?setting=combo_timeout&other=keep#section"]}
      >
        <Navigator open />
        <Location />
      </MemoryRouter>
    )
  );
  const input = container.querySelector('input[type="search"]');
  expect(container.querySelector(".kt-options-search__clear")).toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(input, "timeout");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(
    container.querySelectorAll(".kt-options-nav__setting").length
  ).toBeGreaterThan(0);
  const clear = container.querySelector(
    'button[aria-label="options_clear_search"]'
  );
  expect(clear).not.toBeNull();
  input.focus();
  input.blur();
  expect(container.querySelector(".kt-options-search__clear")).toBe(clear);
  act(() => clear.click());
  expect(input.value).toBe("");
  expect(container.querySelectorAll(".kt-options-nav__link")).toHaveLength(17);
  expect(
    container.querySelectorAll('.kt-options-nav__link[href="/image-translate"]')
  ).toHaveLength(1);
  expect(container.querySelectorAll(".kt-options-nav__setting")).toHaveLength(
    0
  );
  expect(container.querySelector("output").textContent).toBe(
    "/input?other=keep#section"
  );
  expect(container.querySelector(".kt-options-search__clear")).toBeNull();
  act(() => root.unmount());
  container.remove();
});

test("terminology tables belong to the data group between sync and favorite words", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <MemoryRouter>
        <Navigator open />
      </MemoryRouter>
    )
  );
  const section = container
    .querySelector('a[href="/terms"]')
    .closest("section");
  expect(
    [...section.querySelectorAll("a")].map((link) => link.getAttribute("href"))
  ).toEqual(["/sync", "/terms", "/words"]);
  act(() => root.unmount());
});

test("does not show English fallback details when searching the Chinese interface", () => {
  const view = renderSearchNavigator();
  view.change("y");
  for (const key of [
    "context_menus",
    "translate_variants",
    "check_update",
    "fab_half_hide",
    "fab_exception_list",
    "fab_opacity",
    "if_clear_cache",
    "disabled_csplist",
  ])
    expect(
      view.container.querySelector(`a[href="/?setting=${key}"]`)
    ).toBeNull();
  view.change("Secondary");
  expect(view.container.querySelector(".kt-options-nav__empty")).not.toBeNull();
  view.unmount();
});

test.each(["input-first", "compositionend-first"])(
  "keeps results and highlights stable through IME pre-edit with %s event order",
  (order) => {
    const view = renderSearchNavigator();
    view.change("缓存");
    const before = view.nav.innerHTML;
    view.composition("compositionstart");
    for (const value of ["z", "zi", "zi'mu"]) {
      view.change(value, true);
      expect(view.input.value).toBe(value);
      expect(view.nav.innerHTML).toBe(before);
    }
    let beforeCommit = before;
    if (order === "input-first") {
      view.change("字幕");
      beforeCommit = view.nav.innerHTML;
      view.composition("compositionend");
    } else {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(view.input, "字幕");
      view.composition("compositionend");
      view.change("字幕");
    }
    expect(beforeCommit).toBe(before);
    expect(view.input.value).toBe("字幕");
    expect(view.nav.innerHTML).not.toBe(before);
    expect(
      view.container.querySelectorAll('a[href^="/subtitle?setting="]')
    ).toHaveLength(5);
    expect(view.nav.querySelector("mark").textContent).toBe("字幕");
    view.unmount();
  }
);

test("ignores native composing input even without a compositionstart event", () => {
  const view = renderSearchNavigator();
  const before = view.nav.innerHTML;
  view.change("y", true);
  expect(view.input.value).toBe("y");
  expect(view.nav.innerHTML).toBe(before);
  view.change("语言");
  expect(view.nav.innerHTML).not.toBe(before);
  view.unmount();
});

test("reuses filtering and highlighting until the IME query commits", () => {
  const filter = jest.spyOn(settingsSearch, "searchSettingsGroups");
  const highlight = jest.spyOn(
    settingsSearch,
    "getSettingsSearchHighlightParts"
  );
  const view = renderSearchNavigator();
  try {
    view.change("缓存");
    expect(highlight).toHaveBeenCalled();
    filter.mockClear();
    highlight.mockClear();
    view.composition("compositionstart");
    for (const value of ["z", "zi", "zi'mu"]) {
      view.change(value, true);
      expect(view.input.value).toBe(value);
    }
    expect(filter).not.toHaveBeenCalled();
    expect(highlight).not.toHaveBeenCalled();
    view.change("字幕");
    view.composition("compositionend");
    expect(filter).toHaveBeenCalledWith(expect.any(Array), "字幕", "zh");
    expect(highlight).toHaveBeenCalled();
    expect(view.nav.querySelector("mark").textContent).toBe("字幕");
  } finally {
    view.unmount();
    filter.mockRestore();
    highlight.mockRestore();
  }
});

test("refreshes cached results and highlights when the UI language changes", () => {
  const view = renderSearchNavigator();
  try {
    view.change("缓存");
    expect(view.nav.querySelector("mark").textContent).toBe("缓存");
    mockUiLang = "en";
    mockLabels = Object.fromEntries(
      Object.entries(I18N).map(([key, translations]) => [key, translations.en])
    );
    view.rerender();
    expect(view.input.value).toBe("缓存");
    expect(view.nav.querySelector("mark")).toBeNull();
    expect(view.nav.querySelector(".kt-options-nav__empty").textContent).toBe(
      I18N.options_no_results.en
    );
    view.change("cache");
    expect(view.nav.querySelector("mark").textContent.toLowerCase()).toBe(
      "cache"
    );
  } finally {
    view.unmount();
  }
});

test("cancels IME pre-edit and clears both the draft and committed search", () => {
  const view = renderSearchNavigator();
  view.change("字幕");
  const before = view.nav.innerHTML;
  view.composition("compositionstart");
  view.change("字幕y", true);
  view.change("字幕", true);
  view.composition("compositionend");
  expect(view.nav.innerHTML).toBe(before);
  view.composition("compositionstart");
  view.change("字幕y", true);
  act(() => view.container.querySelector(".kt-options-search__clear").click());
  expect(view.input.value).toBe("");
  expect(
    view.container.querySelectorAll(".kt-options-nav__setting")
  ).toHaveLength(0);
  expect(view.container.querySelector(".kt-options-search__clear")).toBeNull();
  view.change("超时");
  expect(view.nav.querySelector("mark").textContent).toBe("超时");
  view.unmount();
});
