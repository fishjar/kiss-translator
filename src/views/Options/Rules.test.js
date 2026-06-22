import { act } from "react";
import { createRoot } from "react-dom/client";
import Rules from "./Rules";
import { useRules } from "../../hooks/Rules";
import { useSubRules } from "../../hooks/SubRules";
import { useSyncCaches } from "../../hooks/Sync";
import { syncSubRules } from "../../libs/subRules";
import {
  delSubRules,
  getDisabledSubRules,
  removeDisabledSubRules,
} from "../../libs/storage";

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

jest.mock("../../hooks/Alert", () => ({
  useAlert: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  }),
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
  useApiList: () => ({ enabledApis: [] }),
}));

jest.mock("../../hooks/CustomStyles", () => ({
  useAllTextStyles: () => ({ allTextStyles: [] }),
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
    setSelectedRules: jest.fn(),
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
    expect(mockSubRules.setSelectedRules).toHaveBeenCalledWith([
      { pattern: "fresh.example" },
    ]);
    expect(mockUpdateDataCache).toHaveBeenCalledWith(
      "https://rules.example/main.json"
    );

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
});
