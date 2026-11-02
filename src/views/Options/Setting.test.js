/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
// Direct React DOM fixtures require act and explicit DOM queries.
import { act } from "react";
import { createRoot } from "react-dom/client";
import Settings, {
  AutoTranslateClipboardSetting,
  ExtCommands,
} from "./Setting";
import UploadButton from "./UploadButton";
import {
  DEFAULT_SETTING,
  OPT_TRANS_GEMINI,
  SETTINGS_VERSION_V1,
} from "../../config";
import { browser } from "../../libs/browser";
import { useAlert } from "../../hooks/Alert";
import { useSetting } from "../../hooks/Setting";
import { useFab } from "../../hooks/Fab";
import { useShortcut } from "../../hooks/Shortcut";
import { tryClearCaches } from "../../libs/cache";
import {
  hasClipboardReadPermission,
  requestClipboardReadPermission,
} from "../../libs/clipboard";
import {
  getRedactionStatus,
  readModelStatus,
  requestModelReset,
  requestModelRetry,
  subscribeModelStatus,
} from "../../libs/aifw";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/browser", () => ({
  browser: {
    commands: { getAll: jest.fn() },
    tabs: { create: jest.fn() },
    permissions: {
      onAdded: { addListener: jest.fn(), removeListener: jest.fn() },
      onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
    },
  },
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Alert", () => ({
  useAlert: jest.fn(),
}));

jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));
let mockIsExt = true;
jest.mock("../../libs/client", () => ({
  isAutoTranslateClipboardSupported: true,
  get isExt() {
    return mockIsExt;
  },
}));
jest.mock("../../libs/clipboard", () => ({
  CLIPBOARD_READ_PERMISSION: "clipboardRead",
  hasClipboardReadPermission: jest.fn(),
  requestClipboardReadPermission: jest.fn(),
}));
jest.mock("../../hooks/Shortcut", () => ({ useShortcut: jest.fn() }));
jest.mock("./ShortcutInput", () => () => null);
jest.mock("../../hooks/Fab", () => ({ useFab: jest.fn() }));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../../libs/cache", () => ({ tryClearCaches: jest.fn() }));
jest.mock("../../libs/aifw", () => ({
  getRedactionStatus: jest.fn(),
  readModelStatus: jest.fn(),
  subscribeModelStatus: jest.fn(),
  requestModelReset: jest.fn(),
  requestModelRetry: jest.fn(),
}));
jest.mock("../../libs/log", () =>
  jest.requireActual("../../testUtils/scopedLogMock").withScopedLogMock(
    (() => ({
      kissLog: jest.fn(),
      LogLevel: { INFO: { value: 3 } },
    }))()
  )
);
jest.mock("./UploadButton", () => jest.fn(() => null));
jest.mock("./DownloadButton", () => () => null);
jest.mock("../../hooks/ValidationInput", () => () => null);
jest.mock("./OverviewHero", () => () => null);

const commands = [
  {
    name: "toggleTranslate",
    description: "Toggle Translate",
    shortcut: "Alt+Q",
  },
];
const alert = {
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
};
const originalUserAgent = navigator.userAgent;

function setUserAgent(userAgent) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

async function renderCommands() {
  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => {
    root.render(<ExtCommands />);
  });

  return { container, root };
}

async function renderSettings() {
  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => {
    root.render(<Settings />);
  });

  return { container, root };
}

describe("Settings overview layout", () => {
  test("legacy native detector instances are projected without enabling disabled entries", async () => {
    browser.commands.getAll.mockResolvedValue([]);
    useAlert.mockReturnValue(alert);
    useSetting.mockReturnValue({
      setting: {
        uiLang: "zh",
        logLevel: 3,
        clearCache: false,
        langDetector: "legacy-google",
        transApis: [
          {
            apiSlug: "legacy-google",
            apiType: "Google",
            apiName: "Legacy detector",
          },
          {
            apiSlug: "disabled-google",
            apiType: "Google",
            apiName: "Disabled detector",
            isDisabled: true,
          },
        ],
      },
      updateSetting: jest.fn(),
    });
    useFab.mockReturnValue({ fab: {}, updateFab: jest.fn() });
    const { container, root } = await renderSettings();
    try {
      expect(container.textContent).toContain("Legacy detector");
      const field = [...container.querySelectorAll("input")]
        .find((input) => input.value === "legacy-google")
        .closest(".MuiFormControl-root");
      act(() =>
        field
          .querySelector('[role="combobox"]')
          .dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, button: 0 })
          )
      );
      expect(
        [...document.querySelectorAll('[role="option"]')].map(
          (option) => option.textContent
        )
      ).not.toContain("Disabled detector");
    } finally {
      act(() => root.unmount());
    }
  });
  test("keeps the list-style grid free of spacing gutters", async () => {
    browser.commands.getAll.mockResolvedValue([]);
    useAlert.mockReturnValue({ info: jest.fn(), success: jest.fn() });
    useSetting.mockReturnValue({
      setting: { uiLang: "zh", logLevel: 3, clearCache: false },
      updateSetting: jest.fn(),
    });
    useFab.mockReturnValue({ fab: {}, updateFab: jest.fn() });

    const { container, root } = await renderSettings();
    const overviewGrid = container.querySelector(
      ".kt-overview-settings > .MuiGrid-container"
    );

    expect(overviewGrid).not.toBeNull();
    expect(overviewGrid.className).not.toMatch(/MuiGrid-spacing-xs-/);

    act(() => root.unmount());
  });
});

describe("Settings cache feedback", () => {
  beforeEach(() => {
    browser.commands.getAll.mockResolvedValue([]);
    alert.success.mockReset();
    alert.error.mockReset();
    useAlert.mockReturnValue(alert);
    useSetting.mockReturnValue({
      setting: { uiLang: "zh", logLevel: 3, clearCache: false },
      updateSetting: jest.fn(),
    });
    useFab.mockReturnValue({ fab: {}, updateFab: jest.fn() });
    tryClearCaches.mockReset();
  });

  test.each([true, false])(
    "waits for cache completion before reporting success=%s",
    async (cleared) => {
      let resolveClear;
      tryClearCaches.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveClear = resolve;
          })
      );
      const { container, root } = await renderSettings();
      const button = Array.from(container.querySelectorAll("button")).find(
        (element) => element.textContent === "clear_all_cache_now"
      );
      act(() => button.click());
      expect(tryClearCaches).toHaveBeenCalledTimes(1);
      expect(alert.success).not.toHaveBeenCalled();
      expect(alert.error).not.toHaveBeenCalled();

      await act(async () => resolveClear(cleared));
      expect(cleared ? alert.success : alert.error).toHaveBeenCalledWith(
        cleared ? "clear_success" : "clear_failed"
      );
      expect(cleared ? alert.error : alert.success).not.toHaveBeenCalled();
      act(() => root.unmount());
    }
  );
});

describe("Settings backup import", () => {
  test("identifies a versionless JSON backup as V1 while preserving its fields", async () => {
    browser.commands.getAll.mockResolvedValue([]);
    useAlert.mockReturnValue(alert);
    const updateSetting = jest.fn();
    useSetting.mockReturnValue({
      setting: { version: 3, uiLang: "zh", logLevel: 3, clearCache: false },
      updateSetting,
    });
    useFab.mockReturnValue({ fab: {}, updateFab: jest.fn() });
    UploadButton.mockClear();
    const imported = {
      darkMode: true,
      uiLang: "en",
      transApis: [
        {
          apiSlug: "legacy-gemini",
          apiType: OPT_TRANS_GEMINI,
          url: "https://generativelanguage.googleapis.com/v1beta2/interactions",
          systemPrompt: "Preserve the imported custom batch prompt.",
          key: "imported-api-key",
        },
      ],
      customStyles: [{ styleSlug: "custom", styleCode: "color: blue;" }],
    };
    const { root } = await renderSettings();

    try {
      const { handleImport } = UploadButton.mock.calls.at(-1)[0];
      await handleImport(JSON.stringify(imported));

      expect(updateSetting).toHaveBeenCalledTimes(1);
      expect(updateSetting).toHaveBeenCalledWith({
        ...imported,
        version: SETTINGS_VERSION_V1,
      });
    } finally {
      act(() => root.unmount());
    }
  });
});

describe("ExtCommands", () => {
  beforeEach(() => {
    browser.commands.getAll.mockResolvedValue(commands);
    browser.tabs.create.mockReset();
    alert.info.mockReset();
    useAlert.mockReturnValue(alert);
  });

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

  test("shows Firefox shortcut-management instructions without opening a tab", async () => {
    setUserAgent("Mozilla/5.0 Firefox/141.0");
    const { container, root } = await renderCommands();

    await act(async () => {
      container.querySelector("button").click();
    });

    expect(alert.info).toHaveBeenCalledWith("firefox_shortcut_edit_hint");
    expect(browser.tabs.create).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("opens Chromium's extension shortcut page", async () => {
    setUserAgent("Mozilla/5.0 Chrome/139.0.0.0 Safari/537.36");
    const { container, root } = await renderCommands();

    await act(async () => {
      container.querySelector("button").click();
    });

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "chrome://extensions/shortcuts",
    });
    expect(alert.info).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("uses a two-column layout at large breakpoints", async () => {
    const { container, root } = await renderCommands();
    const commandGridItem = container.querySelector(".MuiGrid-item");

    expect(commandGridItem.classList.contains("MuiGrid-grid-lg-6")).toBe(true);
    expect(commandGridItem.classList.contains("MuiGrid-grid-lg-3")).toBe(false);
    act(() => root.unmount());
  });
});

async function chooseSelectOption(
  container,
  value,
  name = "autoTranslateClipboard"
) {
  const input = container.querySelector(`input[name="${name}"]`);
  const button = input
    .closest(".MuiInputBase-root")
    .querySelector('[role="combobox"]');

  await act(async () => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    document.body
      .querySelector(`[role="option"][data-value="${value}"]`)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Settings floating button click action", () => {
  const updateSetting = jest.fn();
  const updateFab = jest.fn();
  const storedFab = {
    isHide: false,
    hideExceptionList: "https://example.com/*",
    halfHide: true,
    opacity: 0.4,
    size: 72,
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    mockIsExt = true;
    updateSetting.mockReset();
    updateFab.mockReset();
    useSetting.mockReturnValue({
      setting: {
        uiLang: "en",
        minLength: 2,
        maxLength: 100000,
        logLevel: 3,
        clearCache: false,
      },
      updateSetting,
    });
    useFab.mockReturnValue({ fab: storedFab, updateFab });
    useShortcut.mockReturnValue({ shortcut: [], setShortcut: jest.fn() });
    browser.commands.getAll.mockResolvedValue([]);
    hasClipboardReadPermission.mockResolvedValue(false);
    useAlert.mockReturnValue(alert);
  });

  async function openSettings() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Settings />);
    });
    return { container, root };
  }

  test.each([
    [0, "fab_click_menu"],
    [1, "fab_click_translate"],
    [2, "fab_click_popup"],
  ])(
    "saves and restores floating button click action %s",
    async (action, label) => {
      useFab.mockReturnValue({
        fab: { ...storedFab, fabClickAction: action === 0 ? 2 : 0 },
        updateFab,
      });
      const { container, root } = await openSettings();

      try {
        await chooseSelectOption(container, action, "fabClickAction");

        expect(updateFab).toHaveBeenCalledTimes(1);
        expect(updateFab).toHaveBeenCalledWith({ fabClickAction: action });
        expect(updateSetting).not.toHaveBeenCalled();
      } finally {
        act(() => root.unmount());
      }

      const savedFab = { ...storedFab, ...updateFab.mock.calls[0][0] };
      updateFab.mockClear();
      useFab.mockReturnValue({ fab: savedFab, updateFab });
      const reopened = await openSettings();

      try {
        const input = reopened.container.querySelector(
          'input[name="fabClickAction"]'
        );
        expect(input.value).toBe(String(action));
        expect(
          input.closest(".MuiInputBase-root").querySelector('[role="combobox"]')
            .textContent
        ).toBe(label);
        expect(
          reopened.container.querySelector('input[name="opacity"]').value
        ).toBe("40");
        expect(
          reopened.container.querySelector('textarea[name="hideExceptionList"]')
            .value
        ).toBe(storedFab.hideExceptionList);
        expect(updateFab).not.toHaveBeenCalled();
      } finally {
        act(() => reopened.root.unmount());
      }
    }
  );

  test("offers the translation panel action outside extension mode", async () => {
    mockIsExt = false;
    const { container, root } = await openSettings();

    try {
      expect(
        container.querySelector('input[name="fabClickAction"]').value
      ).toBe("0");
      await chooseSelectOption(container, 2, "fabClickAction");
      expect(updateFab).toHaveBeenCalledWith({ fabClickAction: 2 });
      expect(updateSetting).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  });
});

describe("Settings floating button appearance", () => {
  const updateSetting = jest.fn();
  const updateFab = jest.fn();
  const visibility = {
    isHide: true,
    hideExceptionList: "https://example.com/*",
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    mockIsExt = true;
    updateSetting.mockReset();
    updateFab.mockReset();
    useSetting.mockReturnValue({
      setting: { uiLang: "en", logLevel: 3, clearCache: false },
      updateSetting,
    });
    useFab.mockReturnValue({
      fab: { ...visibility, halfHide: true, opacity: 0.4, size: 72 },
      updateFab,
    });
    useShortcut.mockReturnValue({ shortcut: [], setShortcut: jest.fn() });
    browser.commands.getAll.mockResolvedValue([]);
    hasClipboardReadPermission.mockResolvedValue(false);
    useAlert.mockReturnValue(alert);
  });

  async function renderAppearanceSettings() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Settings />);
    });
    return { container, root };
  }

  test.each([
    ["missing", undefined],
    ["legacy", { isHide: false }],
    ["invalid", { halfHide: "false", opacity: "invalid", size: "invalid" }],
  ])("shows safe defaults for %s appearance settings", async (_label, fab) => {
    useFab.mockReturnValue({ fab, updateFab });
    const { container, root } = await renderAppearanceSettings();

    try {
      expect(container.querySelector('input[name="halfHide"]').value).toBe(
        "true"
      );
      expect(container.querySelector('input[name="opacity"]').value).toBe(
        "100"
      );
      expect(container.querySelector("#fab-opacity-value").textContent).toBe(
        "100%"
      );
      expect(container.querySelector('input[name="size"]').value).toBe("56");
      expect(container.querySelector("#fab-size-value").textContent).toBe(
        "56 px"
      );
      expect(
        container
          .querySelector(".kt-content-fab")
          .style.getPropertyValue("--kt-fab-size")
      ).toBe("56px");
      expect(
        container.querySelector(".kt-fab-preview-opacity").style.opacity
      ).toBe("1");
      expect(updateFab).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  });

  test("keeps preview theme local while the floating button is globally hidden", async () => {
    const pageSetting = Object.freeze({
      uiLang: "en",
      darkMode: "dark",
      logLevel: 3,
      clearCache: false,
    });
    const fabSetting = Object.freeze({
      ...visibility,
      halfHide: true,
      opacity: 0.4,
      size: 72,
    });
    useSetting.mockReturnValue({ setting: pageSetting, updateSetting });
    useFab.mockReturnValue({ fab: fabSetting, updateFab });
    const { container, root } = await renderAppearanceSettings();

    try {
      const stage = container.querySelector(".kt-fab-preview-stage");
      const preview = stage.querySelector(".kt-content-fab");
      expect(stage.getAttribute("data-theme")).toBe("light");
      expect(preview.disabled).toBe(false);
      expect(preview.getAttribute("aria-pressed")).toBe("false");
      expect(preview.getAttribute("aria-label")).toBe("fab_preview_dark");
      expect(preview.querySelector("svg")).not.toBeNull();

      act(() => preview.click());
      expect(stage.getAttribute("data-theme")).toBe("dark");
      expect(preview.getAttribute("aria-pressed")).toBe("true");

      act(() => preview.click());
      expect(stage.getAttribute("data-theme")).toBe("light");
      expect(preview.getAttribute("aria-pressed")).toBe("false");
      expect(container.querySelector('input[name="isHide"]').value).toBe(
        "true"
      );
      expect(container.querySelector('input[name="halfHide"]').value).toBe(
        "true"
      );
      expect(container.querySelector('input[name="opacity"]').value).toBe("40");
      expect(container.querySelector('input[name="size"]').value).toBe("72");
      expect(pageSetting.darkMode).toBe("dark");
      expect(fabSetting).toEqual({
        ...visibility,
        halfHide: true,
        opacity: 0.4,
        size: 72,
      });
      expect(updateSetting).not.toHaveBeenCalled();
      expect(updateFab).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  });

  test.each([
    [false, true, false],
    [true, false, true],
  ])(
    "saves half hiding independently when globally hidden=%s",
    async (isHide, halfHide, nextHalfHide) => {
      useFab.mockReturnValue({
        fab: { ...visibility, isHide, halfHide, opacity: 0.4 },
        updateFab,
      });
      const { container, root } = await renderAppearanceSettings();

      try {
        await chooseSelectOption(container, nextHalfHide, "halfHide");

        expect(updateFab).toHaveBeenCalledTimes(1);
        expect(updateFab).toHaveBeenCalledWith({ halfHide: nextHalfHide });
        expect(updateSetting).not.toHaveBeenCalled();
        expect(container.querySelector('input[name="isHide"]').value).toBe(
          String(isHide)
        );
        expect(
          container.querySelector('textarea[name="hideExceptionList"]').value
        ).toBe(visibility.hideExceptionList);
      } finally {
        act(() => root.unmount());
      }
    }
  );

  test.each([
    [10, 0.1],
    [45, 0.45],
    [100, 1],
  ])(
    "saves %s%% opacity without changing visibility or exceptions",
    async (percent, opacity) => {
      const { container, root } = await renderAppearanceSettings();
      const slider = container.querySelector('input[name="opacity"]');

      try {
        expect(slider.disabled).toBe(false);
        expect(slider.min).toBe("10");
        expect(slider.max).toBe("100");
        expect(slider.step).toBe("5");
        expect(
          container.querySelector(`#${slider.getAttribute("aria-labelledby")}`)
            .textContent
        ).toBe("fab_opacity");
        expect(
          container.querySelector(`#${slider.getAttribute("aria-describedby")}`)
            .textContent
        ).toBe("fab_opacity_helper");

        act(() => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          ).set.call(slider, String(percent));
          slider.dispatchEvent(new Event("change", { bubbles: true }));
        });

        expect(container.querySelector("#fab-opacity-value").textContent).toBe(
          `${percent}%`
        );
        expect(slider.getAttribute("aria-valuetext")).toBe(`${percent}%`);
        expect(
          container.querySelector(".kt-fab-preview-opacity").style.opacity
        ).toBe(String(opacity));
        expect(updateFab).toHaveBeenCalledTimes(1);
        expect(updateFab).toHaveBeenCalledWith({ opacity });
        expect(updateSetting).not.toHaveBeenCalled();
        expect(container.querySelector('input[name="isHide"]').value).toBe(
          "true"
        );
        expect(
          container.querySelector('textarea[name="hideExceptionList"]').value
        ).toBe(visibility.hideExceptionList);
      } finally {
        act(() => root.unmount());
      }
    }
  );

  test.each([24, 32, 56, 96])(
    "saves %spx size without changing other floating button settings",
    async (size) => {
      const { container, root } = await renderAppearanceSettings();
      const slider = container.querySelector('input[name="size"]');

      try {
        expect(slider.disabled).toBe(false);
        expect(slider.value).toBe("72");
        expect(slider.min).toBe("24");
        expect(slider.max).toBe("96");
        expect(slider.step).toBe("4");
        expect(
          container.querySelector(`#${slider.getAttribute("aria-labelledby")}`)
            .textContent
        ).toBe("fab_size");
        expect(
          container.querySelector(`#${slider.getAttribute("aria-describedby")}`)
            .textContent
        ).toBe("fab_size_helper");

        act(() => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          ).set.call(slider, String(size));
          slider.dispatchEvent(new Event("change", { bubbles: true }));
        });

        expect(container.querySelector("#fab-size-value").textContent).toBe(
          `${size} px`
        );
        expect(slider.getAttribute("aria-valuetext")).toBe(`${size} px`);
        expect(
          container
            .querySelector(".kt-content-fab")
            .style.getPropertyValue("--kt-fab-size")
        ).toBe(`${size}px`);
        expect(updateFab).toHaveBeenCalledTimes(1);
        expect(updateFab).toHaveBeenCalledWith({ size });
        expect(updateSetting).not.toHaveBeenCalled();
        expect(container.querySelector('input[name="opacity"]').value).toBe(
          "40"
        );
        expect(container.querySelector('input[name="halfHide"]').value).toBe(
          "true"
        );
        expect(container.querySelector('input[name="isHide"]').value).toBe(
          "true"
        );
        expect(
          container.querySelector('textarea[name="hideExceptionList"]').value
        ).toBe(visibility.hideExceptionList);
      } finally {
        act(() => root.unmount());
      }
    }
  );

  test("reflects appearance updates received from another page", async () => {
    const { container, root } = await renderAppearanceSettings();

    try {
      const preview = container.querySelector(".kt-content-fab");
      act(() => preview.click());
      expect(
        container
          .querySelector(".kt-fab-preview-stage")
          .getAttribute("data-theme")
      ).toBe("dark");
      useFab.mockReturnValue({
        fab: { ...visibility, halfHide: false, opacity: 0.7, size: 88 },
        updateFab,
      });
      await act(async () => {
        root.render(<Settings />);
      });

      expect(container.querySelector('input[name="halfHide"]').value).toBe(
        "false"
      );
      expect(container.querySelector('input[name="opacity"]').value).toBe("70");
      expect(container.querySelector("#fab-opacity-value").textContent).toBe(
        "70%"
      );
      expect(container.querySelector('input[name="size"]').value).toBe("88");
      expect(container.querySelector("#fab-size-value").textContent).toBe(
        "88 px"
      );
      expect(
        container
          .querySelector(".kt-content-fab")
          .style.getPropertyValue("--kt-fab-size")
      ).toBe("88px");
      expect(
        container.querySelector(".kt-fab-preview-opacity").style.opacity
      ).toBe("0.7");
      expect(
        container
          .querySelector(".kt-fab-preview-stage")
          .getAttribute("data-theme")
      ).toBe("dark");
      expect(updateSetting).not.toHaveBeenCalled();
      expect(updateFab).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  });
});

describe("AutoTranslateClipboardSetting", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    hasClipboardReadPermission.mockResolvedValue(false);
    requestClipboardReadPermission.mockReset();
    alert.success.mockReset();
    alert.warning.mockReset();
    useAlert.mockReturnValue(alert);
  });

  test("enables the setting only after permission is granted", async () => {
    requestClipboardReadPermission.mockResolvedValue(true);
    const onChange = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AutoTranslateClipboardSetting value={false} onChange={onChange} />
      );
      await Promise.resolve();
    });

    await chooseSelectOption(container, true);

    expect(requestClipboardReadPermission).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(alert.success).toHaveBeenCalledWith("clipboard_permission_granted");
    act(() => root.unmount());
  });

  test("keeps the setting disabled when permission is denied", async () => {
    requestClipboardReadPermission.mockResolvedValue(false);
    const onChange = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AutoTranslateClipboardSetting value={false} onChange={onChange} />
      );
      await Promise.resolve();
    });

    await chooseSelectOption(container, true);

    expect(onChange).toHaveBeenCalledWith(false);
    expect(alert.warning).toHaveBeenCalledWith("clipboard_permission_denied");
    act(() => root.unmount());
  });
});

describe("Settings popup default view", () => {
  const setting = {
    uiLang: "en",
    minLength: 2,
    maxLength: 100000,
    clearCache: false,
    logLevel: 3,
    popupDefaultView: "page",
  };
  const updateSetting = jest.fn();
  const updateFab = jest.fn();

  beforeEach(() => {
    document.body.innerHTML = "";
    mockIsExt = true;
    updateSetting.mockReset();
    updateFab.mockReset();
    useSetting.mockReturnValue({ setting, updateSetting });
    useFab.mockReturnValue({ fab: {}, updateFab });
    useShortcut.mockReturnValue({ shortcut: [], setShortcut: jest.fn() });
    browser.commands.getAll.mockResolvedValue([]);
    hasClipboardReadPermission.mockResolvedValue(false);
    useAlert.mockReturnValue(alert);
  });

  async function renderSettings() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Settings />);
      await Promise.resolve();
    });
    return { container, root };
  }

  test("saves the selected popup default view", async () => {
    const { container, root } = await renderSettings();
    const input = container.querySelector('input[name="popupDefaultView"]');
    const select = input
      .closest(".MuiInputBase-root")
      .querySelector('[role="combobox"]');

    expect(input.value).toBe("page");
    act(() => {
      select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    act(() => {
      document.body
        .querySelector('[role="option"][data-value="text"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith({ popupDefaultView: "text" });
    act(() => root.unmount());
  });

  test.each([
    ["missing", { ...setting, popupDefaultView: undefined }],
    ["invalid", { ...setting, popupDefaultView: "unsupported" }],
  ])("defaults a %s popup view to page", async (_label, currentSetting) => {
    useSetting.mockReturnValue({ setting: currentSetting, updateSetting });
    const { container, root } = await renderSettings();
    const input = container.querySelector('input[name="popupDefaultView"]');

    expect(input.value).toBe("page");
    act(() => root.unmount());
  });

  test("hides the popup default view outside extension mode", async () => {
    mockIsExt = false;
    const { container, root } = await renderSettings();

    expect(
      container.querySelector('input[name="popupDefaultView"]')
    ).toBeNull();
    act(() => root.unmount());
  });
});

describe("Settings check update", () => {
  const updateSetting = jest.fn();
  const updateFab = jest.fn();
  const setting = {
    checkUpdate: true,
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    mockIsExt = true;
    updateSetting.mockReset();
    updateFab.mockReset();
    useSetting.mockReturnValue({ setting, updateSetting });
    useFab.mockReturnValue({ fab: {}, updateFab });
    useShortcut.mockReturnValue({ shortcut: [], setShortcut: jest.fn() });
    browser.commands.getAll.mockResolvedValue([]);
    hasClipboardReadPermission.mockResolvedValue(false);
    useAlert.mockReturnValue({
      success: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    });
  });

  async function renderSettings() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Settings />);
      await Promise.resolve();
    });
    return { container, root };
  }

  test("renders checkUpdate enabled by default and saves changes", async () => {
    useSetting.mockReturnValue({ setting, updateSetting });
    const { container, root } = await renderSettings();
    const input = container.querySelector('input[name="checkUpdate"]');
    const select = input
      .closest(".MuiInputBase-root")
      .querySelector('[role="combobox"]');

    expect(input.value).toBe("true");
    act(() => {
      select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    act(() => {
      document.body
        .querySelector('[role="option"][data-value="false"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith({ checkUpdate: false });
    act(() => root.unmount());
  });

  test("renders checkUpdate as false when setting is disabled", async () => {
    useSetting.mockReturnValue({
      setting: { checkUpdate: false },
      updateSetting,
    });
    const { container, root } = await renderSettings();
    const input = container.querySelector('input[name="checkUpdate"]');

    expect(input.value).toBe("false");
    act(() => root.unmount());
  });
});

describe("Settings privacy mask", () => {
  const updateSetting = jest.fn();
  const updateFab = jest.fn();

  beforeEach(() => {
    document.body.innerHTML = "";
    mockIsExt = true;
    updateSetting.mockReset();
    updateFab.mockReset();
    getRedactionStatus.mockReset();
    getRedactionStatus.mockReturnValue({ enabled: false, state: "idle" });
    readModelStatus.mockReset();
    readModelStatus.mockReturnValue(null);
    subscribeModelStatus.mockReset();
    subscribeModelStatus.mockReturnValue(jest.fn());
    requestModelReset.mockReset();
    requestModelRetry.mockReset();
    useSetting.mockReturnValue({
      setting: { uiLang: "en", logLevel: 3, clearCache: false },
      updateSetting,
    });
    useFab.mockReturnValue({ fab: {}, updateFab });
    useShortcut.mockReturnValue({ shortcut: [], setShortcut: jest.fn() });
    browser.commands.getAll.mockResolvedValue([]);
    hasClipboardReadPermission.mockResolvedValue(false);
    useAlert.mockReturnValue(alert);
  });

  function privacySwitch(container) {
    return container.querySelector('input[aria-label="privacy_mask"]');
  }

  function unavailableHint(container) {
    return container.querySelector(".kt-privacy-mask-unavailable")?.textContent;
  }

  function modelRow(container) {
    return container.querySelector(".kt-privacy-mask-model");
  }

  function modelState(container) {
    return modelRow(container)?.querySelector("strong")?.textContent;
  }

  function modelDetail(container) {
    return modelRow(container)?.querySelector(".kt-privacy-mask-model-detail")
      ?.textContent;
  }

  function modelProgress(container) {
    return modelRow(container)?.querySelector('[role="progressbar"]');
  }

  function redownloadButton(container) {
    const buttons = modelRow(container)?.querySelectorAll("button") || [];
    return [...buttons].find(
      (button) => button.textContent === "privacy_mask_redownload"
    );
  }

  function retryButton(container) {
    const buttons = modelRow(container)?.querySelectorAll("button") || [];
    return [...buttons].find(
      (button) => button.textContent === "privacy_mask_retry"
    );
  }

  async function renderSettingsPage() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Settings />);
      await Promise.resolve();
    });
    return { container, root };
  }

  test("defaults the privacy mask switch to off and saves an explicit opt-in", async () => {
    expect(DEFAULT_SETTING.privacyMask).toBe(false);
    const { container, root } = await renderSettingsPage();

    try {
      const input = privacySwitch(container);
      expect(input).not.toBeNull();
      expect(input.checked).toBe(false);
      expect(input.disabled).toBe(false);
      // The engine status is read once on mount; the page never polls it.
      expect(getRedactionStatus).toHaveBeenCalledTimes(1);
      expect(unavailableHint(container)).toBeUndefined();
      expect(updateSetting).not.toHaveBeenCalled();

      act(() => input.click());

      expect(updateSetting).toHaveBeenCalledTimes(1);
      expect(updateSetting).toHaveBeenCalledWith({ privacyMask: true });
    } finally {
      act(() => root.unmount());
    }
  });

  test("saves an explicit opt-out when the privacy mask is on", async () => {
    useSetting.mockReturnValue({
      setting: { privacyMask: true },
      updateSetting,
    });
    const { container, root } = await renderSettingsPage();

    try {
      const input = privacySwitch(container);
      expect(input.checked).toBe(true);
      act(() => input.click());
      expect(updateSetting).toHaveBeenCalledWith({ privacyMask: false });
    } finally {
      act(() => root.unmount());
    }
  });

  test("shows no engine hint when the environment is supported", async () => {
    getRedactionStatus.mockReturnValue({ enabled: false, state: "ready" });
    const { container, root } = await renderSettingsPage();

    try {
      expect(privacySwitch(container).disabled).toBe(false);
      expect(unavailableHint(container)).toBeUndefined();
    } finally {
      act(() => root.unmount());
    }
  });

  test("disables the switch and explains an unavailable environment", async () => {
    getRedactionStatus.mockReturnValue({
      enabled: false,
      state: "unavailable",
    });
    const { container, root } = await renderSettingsPage();

    try {
      const input = privacySwitch(container);
      expect(input.disabled).toBe(true);
      expect(unavailableHint(container)).toBe(
        "privacy_mask_status_unavailable"
      );
    } finally {
      act(() => root.unmount());
    }
  });

  test("still allows turning off an enabled privacy mask when unavailable", async () => {
    getRedactionStatus.mockReturnValue({
      enabled: true,
      state: "unavailable",
    });
    useSetting.mockReturnValue({
      setting: { privacyMask: true },
      updateSetting,
    });
    const { container, root } = await renderSettingsPage();

    try {
      const input = privacySwitch(container);
      expect(input.checked).toBe(true);
      expect(input.disabled).toBe(false);
      expect(unavailableHint(container)).toBe(
        "privacy_mask_status_unavailable"
      );
      act(() => input.click());
      expect(updateSetting).toHaveBeenCalledWith({ privacyMask: false });
    } finally {
      act(() => root.unmount());
    }
  });

  test("renders the not-downloaded model state by default", async () => {
    const { container, root } = await renderSettingsPage();

    try {
      expect(readModelStatus).toHaveBeenCalledTimes(1);
      expect(modelState(container)).toBe("privacy_mask_state_idle");
      expect(modelDetail(container)).toBeUndefined();
      expect(modelProgress(container)).toBeNull();
      expect(redownloadButton(container).disabled).toBe(false);
    } finally {
      act(() => root.unmount());
    }
  });

  test("loads the async model status snapshot on mount", async () => {
    // The real readModelStatus() reads extension storage and resolves a Promise.
    readModelStatus.mockResolvedValue({
      state: "ready",
      sizeBytes: 1048576,
    });
    const { container, root } = await renderSettingsPage();

    try {
      expect(modelState(container)).toBe("privacy_mask_state_ready");
      expect(modelDetail(container)).toContain("1.0 MB");
    } finally {
      act(() => root.unmount());
    }
  });

  test("renders download progress, percentage and byte sizes", async () => {
    readModelStatus.mockReturnValue({
      state: "loading",
      downloadedBytes: 512 * 1024,
      totalBytes: 1024 * 1024,
      sizeBytes: 0,
      origin: "https://example.com",
    });
    const { container, root } = await renderSettingsPage();

    try {
      expect(modelState(container)).toBe("privacy_mask_state_loading");
      const progress = modelProgress(container);
      expect(progress).not.toBeNull();
      expect(progress.getAttribute("aria-valuenow")).toBe("50");
      expect(modelDetail(container)).toContain("512 KB / 1.0 MB");
      expect(
        container.querySelector(".kt-privacy-mask-percent").textContent
      ).toBe("50%");
      expect(modelDetail(container)).toContain(
        "privacy_mask_origin: https://example.com"
      );
      expect(redownloadButton(container).disabled).toBe(true);
    } finally {
      act(() => root.unmount());
    }
  });

  test("renders indeterminate progress while the total size is unknown", async () => {
    readModelStatus.mockReturnValue({
      state: "loading",
      downloadedBytes: 2048,
    });
    const { container, root } = await renderSettingsPage();

    try {
      const progress = modelProgress(container);
      expect(progress).not.toBeNull();
      expect(progress.getAttribute("aria-valuenow")).toBeNull();
      expect(progress.className).toContain("MuiLinearProgress-indeterminate");
      expect(container.querySelector(".kt-privacy-mask-percent")).toBeNull();
      expect(modelDetail(container)).toContain("2 KB");
    } finally {
      act(() => root.unmount());
    }
  });

  test("renders the cached model size and origin when ready", async () => {
    readModelStatus.mockReturnValue({
      state: "ready",
      sizeBytes: 2 * 1024 * 1024,
      totalBytes: 0,
      origin: "https://example.com",
    });
    const { container, root } = await renderSettingsPage();

    try {
      expect(modelState(container)).toBe("privacy_mask_state_ready");
      expect(modelDetail(container)).toContain("2.0 MB");
      expect(modelDetail(container)).toContain(
        "privacy_mask_origin: https://example.com"
      );
      expect(modelProgress(container)).toBeNull();
    } finally {
      act(() => root.unmount());
    }
  });

  test("renders the model load error text", async () => {
    readModelStatus.mockReturnValue({
      state: "error",
      error: "network down",
    });
    const { container, root } = await renderSettingsPage();

    try {
      expect(modelState(container)).toBe("privacy_mask_state_error");
      expect(modelDetail(container)).toContain("network down");
    } finally {
      act(() => root.unmount());
    }
  });

  test("requests a model redownload and reports when no page is active", async () => {
    readModelStatus.mockReturnValue({ state: "ready", sizeBytes: 1048576 });
    let resolveReset;
    requestModelReset.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReset = resolve;
        })
    );
    const { container, root } = await renderSettingsPage();

    try {
      const button = redownloadButton(container);
      expect(button).not.toBeNull();
      expect(button.disabled).toBe(false);

      await act(async () => {
        button.click();
      });
      expect(requestModelReset).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain(
        "privacy_mask_redownload_pending"
      );

      await act(async () => {
        // Host RPC failed / host unavailable -> { tabs: 0, delivered: 0 }.
        resolveReset({ tabs: 0, delivered: 0 });
      });
      expect(container.textContent).toContain("privacy_mask_redownload_hint");
    } finally {
      act(() => root.unmount());
    }
  });

  test("disables redownload when the environment is unavailable", async () => {
    getRedactionStatus.mockReturnValue({
      enabled: false,
      state: "unavailable",
    });
    readModelStatus.mockReturnValue({ state: "ready", sizeBytes: 1048576 });
    const { container, root } = await renderSettingsPage();

    try {
      expect(redownloadButton(container).disabled).toBe(true);
    } finally {
      act(() => root.unmount());
    }
  });

  test("updates with model status pushed by the subscription", async () => {
    let listener;
    const unsubscribe = jest.fn();
    subscribeModelStatus.mockImplementation((cb) => {
      listener = cb;
      return unsubscribe;
    });
    const { container, root } = await renderSettingsPage();

    try {
      expect(subscribeModelStatus).toHaveBeenCalledTimes(1);
      expect(modelState(container)).toBe("privacy_mask_state_idle");

      act(() => {
        listener({ state: "ready", sizeBytes: 1048576 });
      });
      expect(modelState(container)).toBe("privacy_mask_state_ready");
      expect(modelDetail(container)).toContain("1.0 MB");
    } finally {
      act(() => root.unmount());
    }
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["loading", true],
    ["error", true],
    ["ready", false],
    ["idle", false],
  ])("enables retry only for retryable states (%s)", async (state, enabled) => {
    readModelStatus.mockReturnValue(
      state === "idle" ? null : { state, sizeBytes: 1048576 }
    );
    const { container, root } = await renderSettingsPage();

    try {
      const button = retryButton(container);
      expect(button).not.toBeNull();
      expect(button.disabled).toBe(!enabled);
    } finally {
      act(() => root.unmount());
    }
  });

  test("retries a failed model download and reports an unavailable host", async () => {
    readModelStatus.mockReturnValue({ state: "error", error: "network down" });
    let resolveRetry;
    requestModelRetry.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve;
        })
    );
    const { container, root } = await renderSettingsPage();

    try {
      const button = retryButton(container);
      expect(button.disabled).toBe(false);

      await act(async () => {
        button.click();
      });
      expect(requestModelRetry).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("privacy_mask_retry_pending");
      expect(retryButton(container).disabled).toBe(true);

      await act(async () => {
        resolveRetry({ tabs: 0, delivered: 0 });
      });
      expect(container.textContent).toContain("privacy_mask_redownload_hint");
      expect(retryButton(container).disabled).toBe(false);
    } finally {
      act(() => root.unmount());
    }
  });

  test("keeps pending until the host reports the new state", async () => {
    let listener;
    subscribeModelStatus.mockImplementation((cb) => {
      listener = cb;
      return jest.fn();
    });
    readModelStatus.mockReturnValue({ state: "error", error: "network down" });
    requestModelRetry.mockResolvedValue({ tabs: 1, delivered: 1 });
    const { container, root } = await renderSettingsPage();

    try {
      await act(async () => {
        retryButton(container).click();
      });
      expect(requestModelRetry).toHaveBeenCalledTimes(1);
      expect(container.textContent).not.toContain(
        "privacy_mask_redownload_hint"
      );
      expect(container.textContent).toContain("privacy_mask_retry_pending");

      act(() => {
        listener({ state: "loading", downloadedBytes: 1, totalBytes: 10 });
      });
      expect(container.textContent).not.toContain("privacy_mask_retry_pending");
      expect(modelState(container)).toBe("privacy_mask_state_loading");
    } finally {
      act(() => root.unmount());
    }
  });

  test("disables retry when the environment is unavailable", async () => {
    getRedactionStatus.mockReturnValue({
      enabled: false,
      state: "unavailable",
    });
    readModelStatus.mockReturnValue({ state: "error", error: "network down" });
    const { container, root } = await renderSettingsPage();

    try {
      expect(retryButton(container).disabled).toBe(true);
    } finally {
      act(() => root.unmount());
    }
  });

  test("disables retry while another model request is pending", async () => {
    readModelStatus.mockReturnValue({ state: "error", error: "network down" });
    let resolveReset;
    requestModelReset.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReset = resolve;
        })
    );
    const { container, root } = await renderSettingsPage();

    try {
      await act(async () => {
        redownloadButton(container).click();
      });
      expect(retryButton(container).disabled).toBe(true);

      await act(async () => {
        resolveReset({ tabs: 1, delivered: 1 });
      });
    } finally {
      act(() => root.unmount());
    }
  });

  test("renders download speed, current file and per-file progress", async () => {
    const modelUrl = "https://example.com/models/onnx/model.onnx";
    readModelStatus.mockReturnValue({
      state: "loading",
      downloadedBytes: 512 * 1024,
      totalBytes: 1024 * 1024,
      speedBps: 512 * 1024,
      files: [
        {
          name: "onnx/model.onnx",
          url: modelUrl,
          downloadedBytes: 256 * 1024,
          totalBytes: 512 * 1024,
          done: false,
        },
        {
          name: "wasm/simd.wasm",
          url: "https://example.com/models/wasm/simd.wasm",
          downloadedBytes: 512 * 1024,
          totalBytes: 512 * 1024,
          done: true,
        },
      ],
    });
    const { container, root } = await renderSettingsPage();

    try {
      const detail = modelDetail(container);
      expect(detail).toContain("privacy_mask_speed: 512.0 KB/s");
      expect(detail).toContain("privacy_mask_current_file: onnx/model.onnx");
      expect(detail).toContain("privacy_mask_files");
      expect(detail).toContain("256 KB / 512 KB");

      const currentLink = container.querySelector(
        ".kt-privacy-mask-current-file a"
      );
      expect(currentLink).not.toBeNull();
      expect(currentLink.getAttribute("href")).toBe(modelUrl);
      expect(currentLink.getAttribute("target")).toBe("_blank");
      expect(currentLink.getAttribute("rel")).toBe("noreferrer");
      expect(currentLink.getAttribute("title")).toBe(modelUrl);

      const rows = container.querySelectorAll(".kt-privacy-mask-file");
      expect(rows).toHaveLength(2);
      expect(rows[0].getAttribute("data-done")).toBe("false");
      expect(rows[0].querySelector("a").getAttribute("href")).toBe(modelUrl);
      expect(rows[0].textContent).toContain("256 KB / 512 KB");
      expect(rows[1].getAttribute("data-done")).toBe("true");
      expect(rows[1].textContent).toContain("512 KB");
    } finally {
      act(() => root.unmount());
    }
  });

  test("keeps the loading state compact when files and speed are missing", async () => {
    readModelStatus.mockReturnValue({
      state: "loading",
      downloadedBytes: 2048,
      totalBytes: 4096,
    });
    const { container, root } = await renderSettingsPage();

    try {
      expect(modelDetail(container)).toContain("privacy_mask_speed: —");
      expect(container.querySelector(".kt-privacy-mask-files")).toBeNull();
      expect(
        container.querySelector(".kt-privacy-mask-current-file")
      ).toBeNull();
    } finally {
      act(() => root.unmount());
    }
  });

  test("lists model files when ready without a speed line", async () => {
    readModelStatus.mockReturnValue({
      state: "ready",
      sizeBytes: 2 * 1024 * 1024,
      files: [
        {
          name: "onnx/model.onnx",
          url: "https://example.com/models/onnx/model.onnx",
          downloadedBytes: 2 * 1024 * 1024,
          totalBytes: 2 * 1024 * 1024,
          done: true,
        },
      ],
    });
    const { container, root } = await renderSettingsPage();

    try {
      const detail = modelDetail(container);
      expect(detail).toContain("privacy_mask_files");
      expect(detail).toContain("onnx/model.onnx");
      expect(detail).not.toContain("privacy_mask_speed");
      expect(
        container.querySelector(".kt-privacy-mask-current-file")
      ).toBeNull();
      expect(container.querySelectorAll(".kt-privacy-mask-file")).toHaveLength(
        1
      );
    } finally {
      act(() => root.unmount());
    }
  });

  test("lists model files when the download failed", async () => {
    readModelStatus.mockReturnValue({
      state: "error",
      error: "network down",
      files: [
        {
          name: "onnx/model.onnx",
          url: "https://example.com/models/onnx/model.onnx",
          downloadedBytes: 1024,
          totalBytes: 2048,
          done: false,
        },
      ],
    });
    const { container, root } = await renderSettingsPage();

    try {
      const detail = modelDetail(container);
      expect(detail).toContain("network down");
      expect(detail).not.toContain("privacy_mask_speed");
      const rows = container.querySelectorAll(".kt-privacy-mask-file");
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain("1 KB / 2 KB");
    } finally {
      act(() => root.unmount());
    }
  });

  test("falls back to done and dash labels when per-file sizes are missing", async () => {
    readModelStatus.mockReturnValue({
      state: "ready",
      files: [
        { name: "a.onnx", url: "https://example.com/a.onnx", done: true },
        { name: "b.onnx", url: "https://example.com/b.onnx", done: false },
      ],
    });
    const { container, root } = await renderSettingsPage();

    try {
      const rows = container.querySelectorAll(".kt-privacy-mask-file");
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain("privacy_mask_done");
      expect(rows[1].textContent).toContain("—");
    } finally {
      act(() => root.unmount());
    }
  });
});
