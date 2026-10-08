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
import SettingsSearchTarget, {
  findSettingsSearchTarget,
} from "./SettingsSearchTarget";

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

const mockConfirm = jest.fn();

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => mockConfirm,
}));

jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({
    enabledApis: [
      { apiSlug: "Tencent", apiName: "Tencent" },
      { apiSlug: "Microsoft", apiName: "Microsoft" },
    ],
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

beforeEach(() => {
  mockReloadSync.mockResolvedValue(undefined);
  mockConfirm.mockReset().mockResolvedValue(false);
  mockPutRule.mockReset();
});

function createSubRules(overrides = {}) {
  return {
    subList: [{ url: "https://rules.example/main.json", selected: true }],
    selectSub: jest.fn(),
    beginSubAdd: () => ({ isCurrent: () => true, finish: jest.fn() }),
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

function renderRules(searchNavigation = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = () => (
    <SettingsSearchTarget
      target={searchNavigation.target}
      label={searchNavigation.target}
      navigationKey={searchNavigation.navigationKey}
    >
      <Rules />
    </SettingsSearchTarget>
  );

  act(() => {
    root.render(render());
  });

  return {
    container,
    root,
    rerender: (navigation = searchNavigation) => {
      searchNavigation = navigation;
      act(() => {
        root.render(render());
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

function changeField(container, name, value) {
  const input = container.querySelector(`[name="${name}"]`);
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function unloadIsBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
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

describe("Rules search navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRules.mockReturnValue({
      list: [
        { pattern: "example.com", apiSlug: "Tencent" },
        { pattern: "*", apiSlug: "Tencent" },
      ],
      put: jest.fn(),
    });
    useSubRules.mockReturnValue(createSubRules());
    useSyncCaches.mockReturnValue({
      dataCaches: {},
      updateDataCache: mockUpdateDataCache,
      deleteDataCache: mockDeleteDataCache,
      reloadSync: mockReloadSync,
    });
  });

  test("locates the global field after replacing an expanded personal editor", async () => {
    const view = renderRules();
    await openPersonalTab(view);
    const summary = Array.from(
      view.container.querySelectorAll(".MuiAccordionSummary-root")
    ).find((element) => element.textContent.includes("example.com"));
    await act(async () => summary.click());
    expect(
      view.container.querySelector('#kt-rules-personal-panel [name="apiSlug"]')
    ).not.toBeNull();

    await act(async () =>
      view.rerender({ target: "translate_service", navigationKey: "first" })
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

    const highlighted = view.container.querySelector(
      '[data-settings-search-target="translate_service"]'
    );
    expect(highlighted).not.toBeNull();
    expect(highlighted.closest("#kt-rules-global-panel")).not.toBeNull();
    expect(document.activeElement).toBe(highlighted);
    view.unmount();
  });

  test("reopens the subscription tab on repeated search", async () => {
    const view = renderRules({
      target: "subscribe_url",
      navigationKey: "first",
    });
    expect(
      view.container.querySelector("#kt-rules-subscribe-panel").hidden
    ).toBe(false);
    await act(async () =>
      getByRole(view.container, "tab", "global_rule").click()
    );

    view.rerender({ target: "subscribe_url", navigationKey: "second" });

    expect(
      view.container.querySelector("#kt-rules-subscribe-panel").hidden
    ).toBe(false);
    expect(
      findSettingsSearchTarget(view.container, "subscribe_url")
    ).toBeDefined();
    view.unmount();
  });
});

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

  test("refreshes sync cache on entry without repeating it for rule edits", async () => {
    const view = renderRules();
    await openSubscribeTab(view);

    expect(view.container.textContent).toContain("en.wikipedia.org");
    expect(mockReloadSync).toHaveBeenCalledTimes(1);

    mockSubRules = createSubRules({
      selectedRules: [
        { pattern: "en.wikipedia.org" },
        { pattern: "news.ycombinator.com" },
      ],
    });
    view.rerender();
    await flushEffects();

    expect(view.container.textContent).toContain("news.ycombinator.com");
    expect(mockReloadSync).toHaveBeenCalledTimes(1);

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
      "https://rules.example/cancelled.json",
      { shouldCommit: expect.any(Function) }
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

describe("Options Rules drafts", () => {
  let ruleList;
  let view;

  beforeEach(() => {
    ruleList = [
      { pattern: "example.com", enabled: true, apiSlug: "Tencent" },
      {
        pattern: "*",
        rootsSelector: "body",
        selector: "p",
        apiSlug: "Tencent",
      },
    ];
    useRules.mockImplementation(() => ({
      list: ruleList,
      put: mockPutRule,
      add: jest.fn(),
    }));
    useSubRules.mockReturnValue(createSubRules({ selectedRules: [] }));
    useSyncCaches.mockReturnValue({
      dataCaches: {},
      updateDataCache: mockUpdateDataCache,
      deleteDataCache: mockDeleteDataCache,
      reloadSync: mockReloadSync,
    });
    view = renderRules();
  });

  afterEach(() => view.unmount());

  test("opens editable with a disabled save, and cancel keeps fields editable", async () => {
    const rootField = view.container.querySelector('[name="rootsSelector"]');
    expect(rootField.disabled).toBe(false);
    expect(getButtonByText(view.container, "save").disabled).toBe(true);
    expect(view.container.textContent).not.toContain("cancel");
    expect(getButtonByText(view.container, "restore_default")).toBeDefined();
    expect(unloadIsBlocked()).toBe(false);

    changeField(view.container, "rootsSelector", "main");
    expect(getButtonByText(view.container, "save").disabled).toBe(false);
    expect(unloadIsBlocked()).toBe(true);
    await act(async () => getButtonByText(view.container, "cancel").click());
    expect(rootField.value).toBe("body");
    expect(rootField.disabled).toBe(false);
    expect(getButtonByText(view.container, "save").disabled).toBe(true);
    expect(unloadIsBlocked()).toBe(false);
  });

  test("locates and highlights auto scan without changing settings or losing a draft", async () => {
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    const scroll = jest.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      changeField(view.container, "rootsSelector", "main");
      const jump = getButtonByLabel(view.container, "go_to_auto_scan_page");
      await act(async () => jump.click());
      const autoScan = view.container
        .querySelector('input[name="autoScan"]')
        .closest(".MuiFormControl-root");
      expect(scroll).toHaveBeenCalledWith({
        block: "center",
        behavior: "smooth",
      });
      expect(document.activeElement).toBe(autoScan);
      expect(autoScan.getAttribute("data-settings-search-target")).toBe(
        "auto_scan_page"
      );
      expect(view.container.querySelector('input[name="autoScan"]').value).toBe(
        "true"
      );
      expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
        "main"
      );
      expect(unloadIsBlocked()).toBe(true);
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockPutRule).not.toHaveBeenCalled();
      await act(async () => jump.click());
      expect(scroll).toHaveBeenCalledTimes(2);
      await selectOption(view.container, "autoScan", "disable");
      expect(view.container.querySelector('[name="selector"]').disabled).toBe(
        false
      );
      expect(
        view.container.querySelector(
          'button[aria-label="go_to_auto_scan_page"]'
        )
      ).toBeNull();
    } finally {
      if (originalScroll) HTMLElement.prototype.scrollIntoView = originalScroll;
      else delete HTMLElement.prototype.scrollIntoView;
    }
  });

  test.each([
    ["fully visible", 200, 248, false],
    ["below the viewport", 760, 808, true],
    ["covered by the mobile header", 32, 80, true],
  ])(
    "only scrolls when auto scan is not fully visible (%s)",
    async (_, top, bottom, shouldScroll) => {
      const originalScroll = HTMLElement.prototype.scrollIntoView;
      const scroll = jest.fn();
      HTMLElement.prototype.scrollIntoView = scroll;
      const header = document.createElement("header");
      header.className = "kt-options-mobile-header";
      document.body.appendChild(header);
      jest
        .spyOn(header, "getBoundingClientRect")
        .mockReturnValue({ bottom: 64 });
      const autoScan = view.container
        .querySelector('input[name="autoScan"]')
        .closest(".MuiFormControl-root");
      jest
        .spyOn(autoScan, "getBoundingClientRect")
        .mockReturnValue({ top, bottom, height: bottom - top });
      try {
        await act(async () =>
          getButtonByLabel(view.container, "go_to_auto_scan_page").click()
        );
        expect(scroll).toHaveBeenCalledTimes(shouldScroll ? 1 : 0);
        expect(document.activeElement).toBe(autoScan);
        expect(autoScan.getAttribute("data-settings-search-target")).toBe(
          "auto_scan_page"
        );
        expect(unloadIsBlocked()).toBe(false);
        expect(mockPutRule).not.toHaveBeenCalled();
      } finally {
        header.remove();
        if (originalScroll)
          HTMLElement.prototype.scrollIntoView = originalScroll;
        else delete HTMLElement.prototype.scrollIntoView;
      }
    }
  );

  test("clears the warning only after persistence succeeds and remains editable", async () => {
    let finishSave;
    mockPutRule.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      })
    );
    changeField(view.container, "rootsSelector", "main");
    await act(async () => getButtonByText(view.container, "save").click());
    expect(unloadIsBlocked()).toBe(true);
    expect(getButtonByText(view.container, "save").disabled).toBe(true);
    await act(async () => finishSave());
    expect(unloadIsBlocked()).toBe(false);
    expect(
      view.container.querySelector('[name="rootsSelector"]').disabled
    ).toBe(false);
    changeField(view.container, "rootsSelector", "article");
    await act(async () => getButtonByText(view.container, "cancel").click());
    expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
      "main"
    );
  });

  test("keeps the draft and unload warning after a failed save", async () => {
    mockPutRule.mockRejectedValueOnce(new Error("Storage unavailable"));
    changeField(view.container, "rootsSelector", "main");
    await act(async () => getButtonByText(view.container, "save").click());
    expect(unloadIsBlocked()).toBe(true);
    expect(getButtonByText(view.container, "save").disabled).toBe(false);
    expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
      "main"
    );
    expect(mockAlert.error).toHaveBeenCalledWith("Storage unavailable");
  });

  test("preserves cancelled tab switches and discards only after confirmation", async () => {
    changeField(view.container, "rootsSelector", "main");
    await openPersonalTab(view);
    expect(mockConfirm).toHaveBeenCalledWith({
      message: "discard_rule_changes_confirm",
      confirmText: "discard_changes",
      cancelText: "cancel",
    });
    expect(view.container.querySelector("#kt-rules-global-panel").hidden).toBe(
      false
    );
    expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
      "main"
    );
    mockConfirm.mockResolvedValueOnce(true);
    await openPersonalTab(view);
    expect(
      view.container.querySelector("#kt-rules-personal-panel").hidden
    ).toBe(false);
    expect(unloadIsBlocked()).toBe(false);
    expect(mockPutRule).not.toHaveBeenCalled();
  });

  test("confirms collapse and warns again when a cancelled collapse is retried", async () => {
    changeField(view.container, "rootsSelector", "main");
    const summary = view.container.querySelector(".MuiAccordionSummary-root");
    await act(async () => summary.click());
    expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
      "main"
    );
    mockConfirm.mockResolvedValueOnce(true);
    await act(async () => summary.click());
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('[name="rootsSelector"]')).toBeNull();
    expect(unloadIsBlocked()).toBe(false);
  });

  test("preserves dirty drafts during settings search and retries cancelled search", async () => {
    changeField(view.container, "rootsSelector", "main");
    await act(async () =>
      view.rerender({ target: "subscribe_url", navigationKey: "first" })
    );
    expect(view.container.querySelector("#kt-rules-global-panel").hidden).toBe(
      false
    );
    expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
      "main"
    );
    mockConfirm.mockResolvedValueOnce(true);
    await act(async () =>
      view.rerender({ target: "subscribe_url", navigationKey: "second" })
    );
    expect(
      view.container.querySelector("#kt-rules-subscribe-panel").hidden
    ).toBe(false);
    expect(unloadIsBlocked()).toBe(false);
  });

  test("retains drafts when equivalent objects or unrelated rule fields update", async () => {
    changeField(view.container, "rootsSelector", "main");
    ruleList = ruleList.map((rule) => ({ ...rule }));
    view.rerender();
    expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
      "main"
    );
    ruleList = ruleList.map((rule) => ({ ...rule, enabled: false }));
    view.rerender();
    expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
      "main"
    );
    await act(async () => getButtonByText(view.container, "save").click());
    expect(mockPutRule).toHaveBeenCalledWith(
      "*",
      expect.objectContaining({ rootsSelector: "main", enabled: false })
    );
  });

  test("removes the warning when an input returns to its saved value", () => {
    changeField(view.container, "rootsSelector", "main");
    expect(unloadIsBlocked()).toBe(true);
    changeField(view.container, "rootsSelector", "body");
    expect(unloadIsBlocked()).toBe(false);
    expect(getButtonByText(view.container, "save").disabled).toBe(true);
  });

  test.each([
    ["transOnlyRevertDelay", 0.5, "0.6", "0.5"],
    ["transOnlyRevertDelay", "0.5", "0.6", "0.50"],
    ["transOnlyRevertDelay", 0, "0.1", "0"],
    ["splitLength", "100", "101", "100"],
  ])(
    "does not warn when %s returns to the same numeric value (%p)",
    async (name, initial, changed, restored) => {
      ruleList = ruleList.map((rule) =>
        rule.pattern === "*" ? { ...rule, [name]: initial } : rule
      );
      view.rerender();
      const blurField = () => {
        const input = view.container.querySelector(`[name="${name}"]`);
        act(() =>
          input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
        );
      };
      changeField(view.container, name, changed);
      blurField();
      expect(unloadIsBlocked()).toBe(true);
      changeField(view.container, name, restored);
      blurField();
      expect(unloadIsBlocked()).toBe(false);
      expect(getButtonByText(view.container, "save").disabled).toBe(true);
      expect(view.container.textContent).not.toContain("cancel");
      await openPersonalTab(view);
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(
        view.container.querySelector("#kt-rules-personal-panel").hidden
      ).toBe(false);
    }
  );

  test.each([
    ["transOnlyRevertDelay", 0, "0", true],
    ["transOnlyRevertDelay", "0", "0.00", false],
    ["splitLength", "0", "0", true],
  ])(
    "preserves personal zero inheritance when editing %s (%p)",
    async (name, initial, changed, modified) => {
      const { mergeRules } = jest.requireActual("../../libs/rules");
      ruleList = ruleList.map((rule) =>
        rule.pattern === "example.com" ? { ...rule, [name]: initial } : rule
      );
      view.rerender();
      await openPersonalTab(view);
      // This suite drives React DOM directly without Testing Library queries.
      // eslint-disable-next-line testing-library/no-container
      const summary = view.container.querySelector(".MuiAccordionSummary-root");
      await act(async () => summary.click());
      changeField(view.container, name, "1");
      changeField(view.container, name, changed);
      if (name === "splitLength") {
        // eslint-disable-next-line testing-library/no-container
        const input = view.container.querySelector(`[name="${name}"]`);
        act(() =>
          input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
        );
      }
      expect(unloadIsBlocked()).toBe(modified);
      expect(getButtonByText(view.container, "save").disabled).toBe(!modified);
      if (!modified) return;

      await act(async () => getButtonByText(view.container, "save").click());
      const saved = mockPutRule.mock.calls[0][1];
      const global = { [name]: "10" };
      expect(mergeRules(global, { [name]: initial })[name]).not.toEqual(
        mergeRules(global, saved)[name]
      );
      expect(unloadIsBlocked()).toBe(false);
    }
  );

  test("does not warn after typing and clearing an omitted optional field", async () => {
    await openPersonalTab(view);
    await act(async () =>
      view.container.querySelector(".MuiAccordionSummary-root").click()
    );
    await act(async () => getButtonByText(view.container, "more").click());
    changeField(view.container, "injectCss", "body { color: red; }");
    expect(unloadIsBlocked()).toBe(true);
    changeField(view.container, "injectCss", "");
    expect(unloadIsBlocked()).toBe(false);
    expect(getButtonByText(view.container, "save").disabled).toBe(true);
    await openSubscribeTab(view);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  test("clearing a personal delay restores inheritance without treating zero as empty", async () => {
    await openPersonalTab(view);
    await act(async () =>
      view.container.querySelector(".MuiAccordionSummary-root").click()
    );
    changeField(view.container, "transOnlyRevertDelay", "0.6");
    expect(unloadIsBlocked()).toBe(true);
    changeField(view.container, "transOnlyRevertDelay", "0");
    expect(unloadIsBlocked()).toBe(true);
    changeField(view.container, "transOnlyRevertDelay", "");
    expect(unloadIsBlocked()).toBe(false);
    expect(getButtonByText(view.container, "save").disabled).toBe(true);
    await openSubscribeTab(view);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  test("reverting one option still warns when another option remains changed", async () => {
    changeField(view.container, "rootsSelector", "main");
    await selectOption(view.container, "autoScan", "disable");
    await selectOption(view.container, "autoScan", "enable");
    expect(unloadIsBlocked()).toBe(true);
    await openPersonalTab(view);
    expect(mockConfirm).toHaveBeenCalled();
    expect(view.container.querySelector('[name="rootsSelector"]').value).toBe(
      "main"
    );
  });

  test("warns for an unfinished new rule and clears the warning on cancel", async () => {
    await openPersonalTab(view);
    await act(async () => getButtonByText(view.container, "add").click());
    expect(unloadIsBlocked()).toBe(false);
    changeField(view.container, "pattern", "new.example");
    expect(unloadIsBlocked()).toBe(true);
    await act(async () => getButtonByText(view.container, "cancel").click());
    expect(unloadIsBlocked()).toBe(false);
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

    const saveButton = getButtonByText(view.container, "save");
    expect(saveButton.disabled).toBe(true);
    expect(window.getComputedStyle(saveButton.parentElement).flexWrap).toBe(
      "wrap"
    );
    await selectOption(view.container, "wrapOriginal", "enable");

    expect(
      view.container.querySelector('input[name="wrapOriginal"]')?.value
    ).toBe("true");
    expect(
      view.container.querySelector('input[name="originalTextStyle"]')
    ).not.toBeNull();

    expect(saveButton.disabled).toBe(false);
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
