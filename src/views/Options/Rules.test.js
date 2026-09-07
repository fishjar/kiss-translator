import { act } from "react";
import { createRoot } from "react-dom/client";
import Rules, {
  queueDisabledSubRuleRead,
  queueDisabledSubRuleRemoval,
  queueDisabledSubRuleUpdate,
} from "./Rules";
import { useRules } from "../../hooks/Rules";
import { useSubRules } from "../../hooks/SubRules";
import { useSyncCaches } from "../../hooks/Sync";
import { loadOrFetchSubRules, syncSubRules } from "../../libs/subRules";
import { syncShareRules } from "../../libs/sync";
import {
  delSubRules,
  getDisabledSubRules,
  getSyncWithDefault,
  removeDisabledSubRules,
  setDisabledSubRules,
} from "../../libs/storage";
import { OPT_SYNCTYPE_WORKER } from "../../config";
import { OPTIONS_STYLES } from "./styles";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Rules", () => ({
  useRules: jest.fn(),
}));

jest.mock("../../hooks/SubRules", () => ({
  useSubRules: jest.fn(),
}));

jest.mock("../../hooks/Sync", () => ({
  useSyncCaches: jest.fn(),
}));

const mockAlert = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
};

jest.mock("../../hooks/Alert", () => ({
  useAlert: () => mockAlert,
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: { injectRules: true },
    updateSetting: jest.fn(),
  }),
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => jest.fn(),
}));

jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({
    enabledApis: [{ apiSlug: "Tencent", apiName: "Tencent" }],
  }),
}));

jest.mock("../../hooks/CustomStyles", () => ({
  useAllTextStyles: () => ({
    allTextStyles: [
      { styleSlug: "style_none", styleName: "style_none" },
      { styleSlug: "marker", styleName: "marker" },
    ],
  }),
}));

jest.mock("./HelpButton", () => {
  return function HelpButton() {
    return <span data-testid="help-button" />;
  };
});

jest.mock("../../libs/subRules", () => ({
  syncSubRules: jest.fn(),
  loadOrFetchSubRules: jest.fn(),
}));

jest.mock("../../libs/sync", () => ({
  syncShareRules: jest.fn(),
}));

jest.mock("../../libs/storage", () => ({
  delSubRules: jest.fn(() => Promise.resolve()),
  getSyncWithDefault: jest.fn(() => Promise.resolve({})),
  getDisabledSubRules: jest.fn(() => Promise.resolve([])),
  setDisabledSubRules: jest.fn(() => Promise.resolve()),
  removeDisabledSubRules: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../libs/log", () => ({
  kissLog: jest.fn(),
  LogLevel: {
    INFO: { value: 3 },
  },
}));

let mockSubRules;
const mockPutRule = jest.fn();
const mockUpdateDataCache = jest.fn();
const mockDeleteDataCache = jest.fn();
const mockReloadSync = jest.fn();

function createSubRules(overrides = {}) {
  return {
    subList: [{ url: "https://rules.example/main.json", selected: true }],
    selectSub: jest.fn(),
    addSub: jest.fn(),
    delSub: jest.fn(),
    selectedSub: { url: "https://rules.example/main.json", selected: true },
    selectedUrl: "https://rules.example/main.json",
    selectedRules: [{ pattern: "en.wikipedia.org" }],
    setSelectedRulesForUrl: jest.fn(),
    loading: false,
    ...overrides,
  };
}

function renderRules() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Rules />);
  });

  return {
    container,
    root,
    rerender: () => {
      act(() => {
        root.render(<Rules />);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openSubscribeTab(view) {
  const tab = getByRole(view.container, "tab", "subscribe_rules");
  await act(async () => {
    tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flushEffects();
}

async function openPersonalTab(view) {
  const tab = getByRole(view.container, "tab", "personal_rules");
  await act(async () => {
    tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flushEffects();
}

function getByRole(container, role, name) {
  const elements = Array.from(container.querySelectorAll(`[role="${role}"]`));
  const element = elements.find((item) => item.textContent === name);
  if (!element) {
    throw new Error(`Unable to find ${role} named ${name}`);
  }
  return element;
}

function getButtonByLabel(container, label) {
  const button = container.querySelector(`button[aria-label="${label}"]`);
  if (!button) {
    throw new Error(`Unable to find button labelled ${label}`);
  }
  return button;
}

function getButtonByText(container, text) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent === text
  );
  if (!button) {
    throw new Error(`Unable to find button named ${text}`);
  }
  return button;
}

async function selectOption(container, inputName, optionName) {
  const input = container.querySelector(`input[name="${inputName}"]`);
  const select = input?.parentElement?.querySelector('[role="combobox"]');
  if (!select) {
    throw new Error(`Unable to find select named ${inputName}`);
  }

  await act(async () => {
    select.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      })
    );
  });

  const option = getByRole(document.body, "option", optionName);
  await act(async () => {
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flushEffects();
}

describe("Options Rules switch spacing", () => {
  let optionsStyle;

  beforeEach(() => {
    jest.clearAllMocks();
    useRules.mockReturnValue({
      list: [
        { pattern: "example.com", enabled: true },
        { pattern: "*", selector: "p" },
      ],
      put: mockPutRule,
    });
    mockSubRules = createSubRules();
    useSubRules.mockImplementation(() => mockSubRules);
    useSyncCaches.mockReturnValue({
      dataCaches: {},
      updateDataCache: mockUpdateDataCache,
      deleteDataCache: mockDeleteDataCache,
      reloadSync: mockReloadSync,
    });
    getDisabledSubRules.mockResolvedValue([]);
    optionsStyle = document.createElement("style");
    // jsdom cannot parse the container queries that follow the base page styles.
    optionsStyle.textContent = OPTIONS_STYLES.split("@container")[0];
  });

  afterEach(() => {
    optionsStyle.remove();
  });

  test.each([
    ["personal rules", openPersonalTab, "Toggle personal rule example.com"],
    [
      "subscription rules",
      openSubscribeTab,
      "Toggle subscription rule en.wikipedia.org",
    ],
    [
      "injected subscription rules",
      openPersonalTab,
      "Toggle subscription rule en.wikipedia.org",
    ],
  ])(
    "reserves a title gutter for %s with the page styles applied",
    async (_name, openTab, switchLabel) => {
      const view = renderRules();
      view.container.classList.add("kt-options-page");

      try {
        await openTab(view);
        document.head.appendChild(optionsStyle);
        const input = view.container.querySelector(
          `input[aria-label="${switchLabel}"]`
        );
        const control = input.closest(".kt-rule-enable-control");
        const accordion = control.closest(".kt-rule-accordion");
        const summary = accordion.querySelector(".MuiAccordionSummary-root");
        const switchStyle = getComputedStyle(input.closest(".MuiSwitch-root"));
        const controlStyle = getComputedStyle(control);
        const summaryStyle = getComputedStyle(summary);
        const switchEnd =
          parseFloat(controlStyle.insetInlineStart) +
          parseFloat(switchStyle.width);

        expect(switchStyle.width).toBe("52px");
        expect(controlStyle.position).toBe("absolute");
        expect(summary.contains(control)).toBe(false);
        expect(
          parseFloat(summaryStyle.paddingInlineStart)
        ).toBeGreaterThanOrEqual(switchEnd + 8);
      } finally {
        view.unmount();
      }
    }
  );

  test("keeps the normal page gutter for the global rule without a switch", () => {
    const view = renderRules();
    view.container.classList.add("kt-options-page");
    document.head.appendChild(optionsStyle);

    try {
      const accordion = view.container.querySelector(".kt-rule-accordion");
      const summary = accordion.querySelector(".MuiAccordionSummary-root");

      expect(accordion.querySelector(".kt-rule-enable-control")).toBeNull();
      expect(summary.classList).not.toContain("kt-rule-summary--with-switch");
      expect(getComputedStyle(summary).paddingInline).toBe("18px");
    } finally {
      view.unmount();
    }
  });
});

describe("Options Rules subscription tab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRules.mockReturnValue({ list: [] });
    mockSubRules = createSubRules();
    useSubRules.mockImplementation(() => mockSubRules);
    useSyncCaches.mockReturnValue({
      dataCaches: {},
      updateDataCache: mockUpdateDataCache,
      deleteDataCache: mockDeleteDataCache,
      reloadSync: mockReloadSync,
    });
    syncSubRules.mockResolvedValue([{ pattern: "fresh.example" }]);
    getDisabledSubRules.mockResolvedValue([]);
    setDisabledSubRules.mockResolvedValue(undefined);
    Object.values(mockAlert).forEach((alertMethod) => alertMethod.mockClear());
  });

  test("links every rule tab to its panel", () => {
    const view = renderRules();
    const tablist = view.container.querySelector('[role="tablist"]');
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    expect(tablist.getAttribute("aria-label")).toBe("rules_setting");
    expect(tabs).toHaveLength(3);
    tabs.forEach((tab) => {
      const panel = view.container.querySelector(
        `#${tab.getAttribute("aria-controls")}`
      );
      expect(panel.getAttribute("role")).toBe("tabpanel");
      expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
    });
    view.unmount();
  });

  test("does not reload sync cache when subscription rules render or change", async () => {
    const view = renderRules();
    await openSubscribeTab(view);

    expect(view.container.textContent).toContain("en.wikipedia.org");
    expect(mockReloadSync).not.toHaveBeenCalled();

    mockSubRules = createSubRules({
      selectedRules: [
        { pattern: "en.wikipedia.org" },
        { pattern: "news.ycombinator.com" },
      ],
    });
    view.rerender();
    await flushEffects();

    expect(view.container.textContent).toContain("news.ycombinator.com");
    expect(mockReloadSync).not.toHaveBeenCalled();

    view.unmount();
  });

  test("waits for subscription rule state before enabling its switch", async () => {
    let resolveDisabledRules;
    getDisabledSubRules.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDisabledRules = resolve;
      })
    );
    const view = renderRules();
    await openSubscribeTab(view);

    const switchInput = view.container.querySelector(
      'input[aria-label="Toggle subscription rule en.wikipedia.org"]'
    );
    expect(switchInput).not.toBeNull();
    expect(switchInput.disabled).toBe(true);
    expect(switchInput.getAttribute("aria-busy")).toBe("true");
    const control = switchInput.closest(".kt-rule-enable-control");
    expect(control).not.toBeNull();
    expect(control.closest(".kt-rule-accordion")).not.toBeNull();
    expect(control.closest(".MuiAccordionSummary-root")).toBeNull();
    act(() => control.click());
    expect(view.container.querySelector('input[name="pattern"]')).toBeNull();

    await act(async () => {
      resolveDisabledRules([]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(switchInput.disabled).toBe(false);
    expect(switchInput.checked).toBe(true);
    expect(switchInput.getAttribute("aria-busy")).toBe("false");
    view.unmount();
  });

  test("falls back to enabled when subscription rule state cannot be read", async () => {
    getDisabledSubRules.mockRejectedValueOnce(new Error("read failed"));
    const view = renderRules();
    await openSubscribeTab(view);

    const switchInput = view.container.querySelector(
      'input[aria-label="Toggle subscription rule en.wikipedia.org"]'
    );
    expect(switchInput.disabled).toBe(false);
    expect(switchInput.checked).toBe(true);
    expect(switchInput.getAttribute("aria-busy")).toBe("false");
    view.unmount();
  });

  test("disables a pending subscription switch and rolls back a failed write", async () => {
    let rejectWrite;
    setDisabledSubRules.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectWrite = reject;
      })
    );
    const view = renderRules();
    await openSubscribeTab(view);
    const switchInput = view.container.querySelector(
      'input[aria-label="Toggle subscription rule en.wikipedia.org"]'
    );
    expect(switchInput.checked).toBe(true);

    await act(async () => {
      switchInput.click();
      await Promise.resolve();
    });
    expect(switchInput.checked).toBe(false);
    expect(switchInput.disabled).toBe(true);
    expect(switchInput.getAttribute("aria-busy")).toBe("true");
    switchInput.click();
    expect(setDisabledSubRules).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectWrite(new Error("write failed"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(switchInput.checked).toBe(true);
    expect(switchInput.disabled).toBe(false);
    expect(switchInput.getAttribute("aria-busy")).toBe("false");
    expect(mockAlert.error).toHaveBeenCalledWith("rule_toggle_failed");
    view.unmount();
  });

  test("serializes disabled-rule writes for the same subscription", async () => {
    let storedPatterns = [];
    const readDisabled = jest.fn(async () => [...storedPatterns]);
    const writeDisabled = jest.fn(async (_url, patterns) => {
      storedPatterns = [...patterns];
    });

    await Promise.all([
      queueDisabledSubRuleUpdate("source", "a.example", true, {
        readDisabled,
        writeDisabled,
      }),
      queueDisabledSubRuleUpdate("source", "b.example", true, {
        readDisabled,
        writeDisabled,
      }),
    ]);

    expect(storedPatterns.sort()).toEqual(["a.example", "b.example"]);
    expect(readDisabled).toHaveBeenCalledTimes(2);
    expect(writeDisabled).toHaveBeenLastCalledWith("source", [
      "a.example",
      "b.example",
    ]);
  });

  test("serializes disabled-rule writes across subscription sources", async () => {
    let releaseFirstWrite;
    const firstWrite = new Promise((resolve) => {
      releaseFirstWrite = resolve;
    });
    const readDisabled = jest.fn(async () => []);
    const writeDisabled = jest
      .fn()
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValueOnce(undefined);

    const sourceA = queueDisabledSubRuleUpdate("source-a", "a.example", true, {
      readDisabled,
      writeDisabled,
    });
    const sourceB = queueDisabledSubRuleUpdate("source-b", "b.example", true, {
      readDisabled,
      writeDisabled,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(readDisabled).toHaveBeenCalledTimes(1);
    expect(readDisabled).toHaveBeenCalledWith("source-a");

    releaseFirstWrite();
    await Promise.all([sourceA, sourceB]);
    expect(readDisabled).toHaveBeenNthCalledWith(2, "source-b");
  });

  test("serializes disabled-rule reads and removals behind pending writes", async () => {
    let releaseWrite;
    let markWriteStarted;
    const order = [];
    const pendingWrite = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    const writeStarted = new Promise((resolve) => {
      markWriteStarted = resolve;
    });
    const write = queueDisabledSubRuleUpdate("source", "a.example", true, {
      readDisabled: async () => [],
      writeDisabled: async () => {
        order.push("write-start");
        markWriteStarted();
        await pendingWrite;
        order.push("write-end");
      },
    });
    const read = queueDisabledSubRuleRead("source", async () => {
      order.push("read");
      return ["a.example"];
    });
    const remove = queueDisabledSubRuleRemoval("source", async () => {
      order.push("remove");
    });
    await writeStarted;
    expect(order).toEqual(["write-start"]);

    releaseWrite();
    await Promise.all([write, read, remove]);
    expect(order.slice(0, 2)).toEqual(["write-start", "write-end"]);
    expect(new Set(order.slice(2))).toEqual(new Set(["read", "remove"]));
  });

  test("discards a pending subscription add after cancellation", async () => {
    let resolveSync;
    syncSubRules.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSync = resolve;
      })
    );
    const view = renderRules();
    await openSubscribeTab(view);
    act(() => getButtonByText(view.container, "add").click());
    const input = view.container.querySelector('input[type="text"]');
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set;
      setValue.call(input, "https://rules.example/cancelled.json");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      getButtonByText(view.container, "save").click();
      await Promise.resolve();
    });
    expect(syncSubRules).toHaveBeenCalledWith(
      "https://rules.example/cancelled.json"
    );
    expect(getButtonByText(view.container, "cancel").disabled).toBe(false);
    act(() => getButtonByText(view.container, "cancel").click());
    expect(view.container.querySelector('input[type="text"]')).toBeNull();

    await act(async () => {
      resolveSync([{ pattern: "cancelled.example" }]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSubRules.addSub).not.toHaveBeenCalled();
    expect(mockUpdateDataCache).not.toHaveBeenCalled();
    view.unmount();
  });

  test("manual subscription sync still updates the selected rules cache time", async () => {
    const view = renderRules();
    await openSubscribeTab(view);

    const syncButton = getButtonByLabel(
      view.container,
      "Sync subscription https://rules.example/main.json"
    );
    await act(async () => {
      syncButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(syncSubRules).toHaveBeenCalledWith(
      "https://rules.example/main.json"
    );
    expect(mockSubRules.setSelectedRulesForUrl).toHaveBeenCalledWith(
      "https://rules.example/main.json",
      [{ pattern: "fresh.example" }]
    );
    expect(mockUpdateDataCache).toHaveBeenCalledWith(
      "https://rules.example/main.json"
    );

    view.unmount();
  });

  test("keeps the subscription sync control mounted while loading", async () => {
    let resolveSync;
    syncSubRules.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSync = resolve;
      })
    );
    const view = renderRules();
    await openSubscribeTab(view);

    const syncButton = getButtonByLabel(
      view.container,
      "Sync subscription https://rules.example/main.json"
    );
    await act(async () => {
      syncButton.click();
      await Promise.resolve();
    });
    expect(syncButton.getAttribute("aria-busy")).toBe("true");
    expect(syncButton.getAttribute("aria-disabled")).toBe("true");
    expect(syncButton.disabled).toBe(true);
    expect(
      syncButton.querySelector(".MuiCircularProgress-root")
    ).not.toBeNull();
    syncButton.click();
    expect(syncSubRules).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSync([{ pattern: "fresh.example" }]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(syncButton.getAttribute("aria-busy")).toBe("false");
    expect(syncButton.getAttribute("aria-disabled")).toBe("false");
    expect(syncButton.disabled).toBe(false);
    expect(syncButton.querySelector(".MuiCircularProgress-root")).toBeNull();
    expect(syncButton.querySelector('[data-testid="SyncIcon"]')).not.toBeNull();

    view.unmount();
  });

  test("deleting a subscription still deletes its cache time", async () => {
    mockSubRules = createSubRules({
      subList: [
        { url: "https://rules.example/main.json", selected: true },
        { url: "https://rules.example/old.json", selected: false },
      ],
    });
    const view = renderRules();
    await openSubscribeTab(view);

    const deleteButton = getButtonByLabel(
      view.container,
      "Delete subscription https://rules.example/old.json"
    );
    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(mockSubRules.delSub).toHaveBeenCalledWith(
      "https://rules.example/old.json"
    );
    expect(delSubRules).toHaveBeenCalledWith("https://rules.example/old.json");
    expect(mockDeleteDataCache).toHaveBeenCalledWith(
      "https://rules.example/old.json"
    );
    expect(removeDisabledSubRules).toHaveBeenCalledWith(
      "https://rules.example/old.json"
    );

    view.unmount();
  });

  test("allows subscription action rows to wrap on narrow screens", async () => {
    const view = renderRules();
    await openSubscribeTab(view);

    const addButton = getButtonByText(view.container, "add");
    const subscriptionRadio = view.container.querySelector(
      'input[type="radio"]'
    );

    expect(window.getComputedStyle(addButton.parentElement).flexWrap).toBe(
      "wrap"
    );
    expect(
      window.getComputedStyle(subscriptionRadio.closest(".MuiStack-root"))
        .flexWrap
    ).toBe("wrap");

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    const saveButton = getButtonByText(view.container, "save");
    expect(window.getComputedStyle(saveButton.parentElement).flexWrap).toBe(
      "wrap"
    );

    view.unmount();
  });
});

describe("Options Rules global tab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRules.mockReturnValue({
      list: [
        {
          pattern: "*",
          selector: "p",
          textStyle: "style_none",
          wrapOriginal: "false",
          originalTextStyle: "style_none",
        },
      ],
      put: mockPutRule,
    });
    mockSubRules = createSubRules({ selectedRules: [] });
    useSubRules.mockImplementation(() => mockSubRules);
    useSyncCaches.mockReturnValue({
      dataCaches: {},
      updateDataCache: mockUpdateDataCache,
      deleteDataCache: mockDeleteDataCache,
      reloadSync: mockReloadSync,
    });
  });

  test("renders one text style control without the duplicate style preview", () => {
    const view = renderRules();

    expect(
      view.container.querySelectorAll('input[name="textStyle"]')
    ).toHaveLength(1);
    expect(view.container.querySelector(".kt-rule-style-grid")).toBeNull();
    expect(
      view.container.querySelector('input[name="wrapOriginal"]')
    ).not.toBeNull();
    expect(view.container.querySelector(".MuiGrid-grid-lg-3")).toBeNull();

    view.unmount();
  });
});

describe("Options Rules personal tab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRules.mockReturnValue({
      list: [
        { pattern: "example.com", enabled: true },
        { pattern: "*", selector: "p" },
      ],
      put: mockPutRule,
    });
    mockSubRules = createSubRules({ selectedRules: [] });
    useSubRules.mockImplementation(() => mockSubRules);
    useSyncCaches.mockReturnValue({
      dataCaches: {},
      updateDataCache: mockUpdateDataCache,
      deleteDataCache: mockDeleteDataCache,
      reloadSync: mockReloadSync,
    });
    Object.values(mockAlert).forEach((alertMethod) => alertMethod.mockClear());
  });

  test("renders a switch for personal rules but not the global rule", async () => {
    const view = renderRules();
    await openPersonalTab(view);

    const switchInput = view.container.querySelector(
      'input[aria-label="Toggle personal rule example.com"]'
    );

    expect(view.container.textContent).toContain("example.com");
    expect(switchInput).not.toBeNull();
    expect(switchInput.checked).toBe(true);

    view.unmount();
  });

  test("toggles personal rule enabled state without deleting or expanding it", async () => {
    const view = renderRules();
    await openPersonalTab(view);

    const switchInput = view.container.querySelector(
      'input[aria-label="Toggle personal rule example.com"]'
    );
    await act(async () => {
      switchInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(mockPutRule).toHaveBeenCalledWith("example.com", {
      enabled: false,
    });
    expect(view.container.querySelector('input[name="pattern"]')).toBeNull();

    view.unmount();
  });

  test("prevents duplicate rule sharing while the upload is pending", async () => {
    let resolveShare;
    getSyncWithDefault.mockResolvedValue({
      syncType: OPT_SYNCTYPE_WORKER,
      syncUrl: "https://sync.example",
      syncKey: "secret",
    });
    loadOrFetchSubRules.mockResolvedValue([{ pattern: "sub.example" }]);
    syncShareRules.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveShare = resolve;
      })
    );
    const openWindow = jest.spyOn(window, "open").mockImplementation(() => {});
    const view = renderRules();
    await openPersonalTab(view);
    const shareButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "share");

    await act(async () => {
      shareButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(shareButton.disabled).toBe(true);
    expect(shareButton.getAttribute("aria-busy")).toBe("true");
    shareButton.click();
    expect(syncShareRules).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveShare("https://share.example/rules");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(shareButton.disabled).toBe(false);
    expect(shareButton.getAttribute("aria-busy")).toBe("false");
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledWith(
      "https://share.example/rules",
      "_blank"
    );
    openWindow.mockRestore();
    view.unmount();
  });

  test("shows original style when a rule enables original wrapping", async () => {
    useRules.mockReturnValue({
      list: [
        {
          pattern: "example.com",
          enabled: true,
          wrapOriginal: "true",
          originalTextStyle: "style_none",
        },
        {
          pattern: "*",
          selector: "p",
          wrapOriginal: "false",
          originalTextStyle: "style_none",
        },
      ],
      put: mockPutRule,
    });
    const view = renderRules();
    await openPersonalTab(view);

    const wrappedRule = Array.from(
      view.container.querySelectorAll('[role="button"]')
    ).find((item) => item.textContent.includes("example.com"));
    expect(wrappedRule).toBeDefined();
    await act(async () => {
      wrappedRule.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    expect(
      view.container.querySelector('input[name="wrapOriginal"]')?.value
    ).toBe("true");
    expect(
      view.container.querySelector('input[name="originalTextStyle"]')?.value
    ).toBe("style_none");
    expect(
      view.container.querySelector(".kt-rule-original-settings")
    ).toBeNull();

    view.unmount();
  });

  test("resolves inherited original wrapping from the global rule", async () => {
    useRules.mockReturnValue({
      list: [
        {
          pattern: "example.com",
          enabled: true,
          wrapOriginal: "*",
          originalTextStyle: "*",
        },
        {
          pattern: "*",
          selector: "p",
          wrapOriginal: "true",
          originalTextStyle: "marker",
        },
      ],
      put: mockPutRule,
    });
    const view = renderRules();
    await openPersonalTab(view);

    const inheritedRule = Array.from(
      view.container.querySelectorAll('[role="button"]')
    ).find((item) => item.textContent.includes("example.com"));
    await act(async () => {
      inheritedRule.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    const wrapOriginalControl = view.container.querySelector(
      'input[name="wrapOriginal"]'
    );
    const originalStyleControl = view.container.querySelector(
      'input[name="originalTextStyle"]'
    );
    expect(wrapOriginalControl?.value).toBe("*");
    expect(originalStyleControl?.value).toBe("*");

    view.unmount();
  });

  test("updates original wrapping from the regular form grid", async () => {
    useRules.mockReturnValue({
      list: [
        {
          pattern: "example.com",
          enabled: true,
          wrapOriginal: "false",
          originalTextStyle: "style_none",
        },
        {
          pattern: "*",
          selector: "p",
          wrapOriginal: "false",
          originalTextStyle: "style_none",
        },
      ],
      put: mockPutRule,
    });
    const view = renderRules();
    await openPersonalTab(view);

    const ruleSummary = Array.from(
      view.container.querySelectorAll('[role="button"]')
    ).find((item) => item.textContent.includes("example.com"));
    await act(async () => {
      ruleSummary.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    const editButton = getButtonByText(view.container, "edit");
    expect(window.getComputedStyle(editButton.parentElement).flexWrap).toBe(
      "wrap"
    );
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    await selectOption(view.container, "wrapOriginal", "enable");

    expect(
      view.container.querySelector('input[name="wrapOriginal"]')?.value
    ).toBe("true");
    expect(
      view.container.querySelector('input[name="originalTextStyle"]')
    ).not.toBeNull();

    const saveButton = getButtonByText(view.container, "save");
    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    expect(mockPutRule).toHaveBeenCalledWith(
      "example.com",
      expect.objectContaining({ wrapOriginal: "true" })
    );

    view.unmount();
  });
});
