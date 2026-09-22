import { act } from "react";
import { createRoot } from "react-dom/client";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import RuleEditor from ".";
import { storage } from "../../libs/storage";
import {
  cloneStorageValue,
  isSameStorageValue,
} from "../../libs/storageEquality";
import {
  STOKEY_RULE_EDITOR_POSITION,
  STOKEY_RULE_INSPECTOR_POSITION,
} from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light" }),
}));
jest.mock("../../hooks/SystemColorScheme", () => ({
  useSystemDarkPreference: () => false,
}));
jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../libs/storage", () => ({
  storage: {
    getObj: jest.fn(),
    setObj: jest.fn(),
    withTransaction: jest.fn(),
    saveEdit: jest.fn(),
  },
}));
jest.mock("../../libs/sync", () => ({ syncData: jest.fn() }));

let root, container, cache, session, originalResizeObserver;
beforeEach(() => {
  storage.getObj.mockReset().mockResolvedValue(null);
  storage.setObj.mockReset().mockResolvedValue();
  storage.withTransaction
    .mockReset()
    .mockImplementation((operation) => operation(storage));
  storage.saveEdit
    .mockReset()
    .mockImplementation((key, valueOrFn, _syncKey, options = {}) =>
      storage.withTransaction(async (transaction) => {
        const previous = cloneStorageValue(
          (await transaction.getObj(key)) ?? options.defaultValue
        );
        const value = cloneStorageValue(
          typeof valueOrFn === "function" ? valueOrFn(previous) : valueOrFn
        );
        const changed = !isSameStorageValue(previous, value);
        if (changed) await transaction.setObj(key, value);
        return { value, changed, updateAt: 0 };
      })
    );
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  cache = createCache({ key: "rule-editor-test" });
  const state = {
    context: { effective: { autoScan: "false" } },
    field: "selector",
    entries: [{ selector: ".story", count: 2, source: "global" }],
    input: ".story",
    matches: [],
    ancestors: [],
    candidates: [],
    pattern: "localhost",
    domainOptions: ["localhost", "localhost:*"],
    dirty: true,
  };
  session = {
    subscribe: () => () => {},
    getSnapshot: () => state,
    edit: jest.fn(),
    remove: jest.fn(),
    hover: jest.fn(),
    refresh: jest.fn(),
    closeInspector: jest.fn(),
    save: jest.fn(),
    updateDraft: jest.fn(),
    requestAction: jest.fn(),
    confirmAction: jest.fn(),
    emit: jest.fn(),
    showWhole: jest.fn(),
    showTranslation: jest.fn(),
    setField: jest.fn(),
    setPattern: jest.fn(),
    commitPattern: jest.fn(),
  };
});
afterEach(() => {
  act(() => root.unmount());
  cache.sheet.flush();
  container.remove();
  globalThis.ResizeObserver = originalResizeObserver;
});
const render = () =>
  act(async () =>
    root.render(
      <CacheProvider value={cache}>
        <RuleEditor session={session} />
      </CacheProvider>
    )
  );
const mountInShadow = () => {
  act(() => root.unmount());
  cache.sheet.flush();
  const shadow = container.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "notranslate";
  shadow.appendChild(wrapper);
  cache = createCache({ key: "rule-editor-test", container: shadow });
  root = createRoot(wrapper);
  return shadow;
};
const click = (element) =>
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));

test("the entire rule card selects the entry while delete acts independently", async () => {
  await render();
  const card = container.querySelector('button[aria-label=".story"]');
  click(card.querySelector(".MuiChip-root"));
  click(card.querySelector(".MuiTypography-root"));
  click(card);
  expect(session.edit).toHaveBeenCalledTimes(3);
  expect(session.edit).toHaveBeenLastCalledWith(".story");
  click(container.querySelector('[aria-label="rule_editor_delete: .story"]'));
  expect(session.remove).toHaveBeenCalledWith(".story");
  expect(session.edit).toHaveBeenCalledTimes(3);
});

test("selector input and save live only in the closable inspector", async () => {
  session.getSnapshot().inspectorOpen = true;
  session.getSnapshot().editing = ".story";
  await render();
  const main = container.querySelector('aside[aria-label="rule_editor_title"]');
  const inspector = container.querySelector(
    'aside[aria-label="rule_editor_editSelector"]'
  );
  expect(main.querySelector("textarea")).toBeNull();
  expect(inspector.querySelector("textarea").value).toBe(".story");
  expect(inspector.textContent).toContain("rule_editor_update");
  click(
    inspector.querySelector('button[aria-label="rule_editor_closeInspector"]')
  );
  expect(session.closeInspector).toHaveBeenCalledTimes(1);
});

test("the M3 scan switch keeps string values and the purpose menu keeps settings labels", async () => {
  await render();
  expect(container.querySelector("select")).toBeNull();
  const scan = container.querySelector('input[aria-label="auto_scan_page"]');
  expect(scan.checked).toBe(false);
  expect(container.textContent).toContain("auto_scan_page");
  const purpose = container.querySelector('div[role="combobox"]');
  expect(purpose.textContent).toContain("target_selector");
  click(scan);
  expect(session.updateDraft).toHaveBeenCalledWith({ autoScan: "true" });
  expect(session.save).not.toHaveBeenCalled();
  session.getSnapshot().context.effective.autoScan = "true";
  await render();
  expect(scan.checked).toBe(true);
  click(scan);
  expect(session.updateDraft).toHaveBeenLastCalledWith({ autoScan: "false" });
  act(() =>
    purpose.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    )
  );
  click(document.querySelector('[role="option"][data-value="ignoreSelector"]'));
  expect(session.setField).toHaveBeenCalledWith("ignoreSelector");
});

test("conflicts appear in the footer and take precedence over stale save notices", async () => {
  Object.assign(session.getSnapshot(), {
    error: "rule-conflict",
    notice: "saved",
  });
  await render();
  const footer = container.querySelector("footer");
  expect(footer.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(container.querySelector(".MuiSnackbar-root")).toBeNull();
  expect(footer.textContent).not.toContain("rule_editor_saved");
  expect(footer.textContent.indexOf("rule_editor_whole")).toBeLessThan(
    footer.textContent.indexOf("rule_editor_rule-conflict")
  );
});

test("save confirmation follows its panel without entering the layout", async () => {
  session.getSnapshot().notice = "saved";
  await render();
  const footer = container.querySelector("footer");
  const snackbar = container.querySelector(".MuiSnackbar-root");
  expect(snackbar.querySelector('[role="alert"]').textContent).toContain(
    "rule_editor_saved"
  );
  expect(snackbar.closest("aside")).toBeNull();
  expect(snackbar.closest(".kt-m3-root")).toBe(
    container.querySelector(".kt-m3-root")
  );
  const notification = snackbar.closest("[data-rule-editor-notification]");
  expect(getComputedStyle(notification).position).toBe("fixed");
  const previousLeft = parseFloat(getComputedStyle(notification).left);
  const move = container.querySelector("aside [data-rule-editor-move]");
  await act(async () =>
    move.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
      })
    )
  );
  expect(parseFloat(getComputedStyle(notification).left)).toBe(
    previousLeft - 24
  );
  expect(footer.querySelector('[role="alert"]')).toBeNull();
  click(snackbar.querySelector("button"));
  expect(session.emit).toHaveBeenCalledWith({ notice: "" });
});

test.each([false, true])(
  "save notifications contain wheel input and preserve browser zoom (shadow: %s)",
  async (inShadow) => {
    const scope = inShadow ? mountInShadow() : container;
    await render();
    session.getSnapshot().notice = "saved";
    await render();
    const notification = scope.querySelector(
      ".MuiSnackbar-root [role='alert']"
    );
    const pageWheel = jest.fn();
    document.addEventListener("wheel", pageWheel);
    try {
      for (const delta of [{ deltaY: 100 }, { deltaX: -100 }]) {
        const event = new WheelEvent("wheel", {
          ...delta,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        notification.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
      const zoom = new WheelEvent("wheel", {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      notification.dispatchEvent(zoom);
      expect(zoom.defaultPrevented).toBe(false);
      expect(pageWheel).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("wheel", pageWheel);
    }
  }
);

test("saving keeps the button label and preview borders stable", async () => {
  await render();
  const save = container.querySelector('[aria-label="rule_editor_save"]');
  const previews = [...container.querySelectorAll(".MuiToggleButton-root")];
  const borders = () =>
    previews.map((button) => {
      const style = getComputedStyle(button);
      return [style.borderTopWidth, style.borderBottomWidth];
    });
  const before = borders();
  session.getSnapshot().saving = true;
  await render();
  expect(save.textContent).toBe("rule_editor_save");
  expect(save.getAttribute("aria-busy")).toBe("true");
  expect(save.disabled).toBe(true);
  expect(
    save.querySelector('[role="progressbar"]').getAttribute("aria-label")
  ).toBe("rule_editor_saving");
  expect(borders()).toEqual(before);
  expect(container.querySelector("footer [role='alert']")).toBeNull();
});

test("both panels restore saved positions and persist keyboard movement", async () => {
  storage.getObj.mockImplementation(async (key) =>
    key === STOKEY_RULE_EDITOR_POSITION ? { x: 160, y: 80 } : { x: 32, y: 48 }
  );
  session.getSnapshot().inspectorOpen = true;
  await render();
  const panels = container.querySelectorAll("aside");
  expect(getComputedStyle(panels[0]).left).toBe("160px");
  expect(getComputedStyle(panels[0]).top).toBe("80px");
  expect(getComputedStyle(panels[1]).left).toBe("32px");
  for (const panel of panels) {
    await act(async () =>
      panel
        .querySelector("header button")
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
        )
    );
  }
  expect(storage.setObj).toHaveBeenCalledWith(STOKEY_RULE_EDITOR_POSITION, {
    x: 184,
    y: 80,
  });
  expect(storage.setObj).toHaveBeenCalledWith(STOKEY_RULE_INSPECTOR_POSITION, {
    x: 56,
    y: 48,
  });
});

test("invalid saved positions fall back to finite viewport coordinates", async () => {
  storage.getObj.mockResolvedValue({ x: "bad", y: null });
  await render();
  const rect = getComputedStyle(container.querySelector("aside"));
  expect(Number.isFinite(parseFloat(rect.left))).toBe(true);
  expect(Number.isFinite(parseFloat(rect.top))).toBe(true);
});

test("shadow-tree menus keep focus on options and support arrow navigation", async () => {
  const shadow = mountInShadow();
  await render();
  const scan = shadow.querySelector('div[role="combobox"]');
  act(() =>
    scan.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    )
  );
  const list = shadow.querySelector('[role="listbox"]');
  expect(list.closest(".kt-m3-root")).toBe(shadow.querySelector(".kt-m3-root"));
  const options = list.querySelectorAll('[role="option"]');
  expect(shadow.activeElement).toBe(options[0]);
  act(() =>
    options[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    )
  );
  expect(shadow.activeElement).toBe(options[1]);
  click(options[1]);
  expect(session.setField).toHaveBeenCalledWith("ignoreSelector");
});

test("site pattern supports custom input and dropdown choices without saving", async () => {
  await render();
  const input = container.querySelector('input[role="combobox"]');
  expect(input).not.toBeNull();
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(input, "https://localhost/custom/*");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(session.setPattern).toHaveBeenCalledWith("https://localhost/custom/*");
  act(() => input.blur());
  expect(session.commitPattern).toHaveBeenCalledTimes(1);
  click(container.querySelector(".MuiAutocomplete-popupIndicator"));
  const options = document.querySelectorAll('[role="option"]');
  expect(options[0].closest(".kt-m3-root")).toBe(
    container.querySelector(".kt-m3-root")
  );
  expect([...options].map((item) => item.textContent)).toEqual([
    "localhost",
    "localhost:*",
  ]);
  click(options[1]);
  expect(session.setPattern).toHaveBeenLastCalledWith("localhost:*");
  expect(session.save).not.toHaveBeenCalled();
});

test("the main save and exit controls use the explicit draft workflow", async () => {
  await render();
  click(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "rule_editor_save"
    )
  );
  expect(session.save).toHaveBeenCalledWith();
  click(container.querySelector('button[aria-label="rule_editor_exit"]'));
  expect(session.requestAction).toHaveBeenCalledWith("exit");
});

test("the unsaved dialog offers save, discard and keep editing", async () => {
  session.getSnapshot().confirmAction = "exit";
  await render();
  const dialog = container.querySelector('[role="dialog"]');
  const button = (name) =>
    [...dialog.querySelectorAll("button")].find(
      (element) => element.textContent === `rule_editor_${name}`
    );
  click(button("continueEditing"));
  expect(session.emit).toHaveBeenCalledWith({ confirmAction: "" });
  click(button("discard"));
  expect(session.confirmAction).toHaveBeenCalledWith(false);
  click(button("save"));
  expect(session.confirmAction).toHaveBeenCalledWith(true);
});

test("confirmation in a shadow tree keeps the editor host accessible", async () => {
  const shadow = mountInShadow();
  session.getSnapshot().confirmAction = "exit";
  await render();
  expect(shadow.querySelector('[role="dialog"]')).not.toBeNull();
  expect(
    shadow.querySelector('[role="dialog"]').closest('[aria-hidden="true"]')
  ).toBeNull();
  expect(container.getAttribute("aria-hidden")).not.toBe("true");
});

test("the editor keeps its M3 font, filled fields and pill buttons on small-root pages", async () => {
  const originalSize = document.documentElement.style.fontSize;
  document.documentElement.style.fontSize = "10px";
  try {
    await render();
    const themeRoot = container.querySelector(".kt-m3-root");
    expect(themeRoot.dataset.theme).toBe("light");
    expect(themeRoot.style.getPropertyValue("--kt-pri")).toBe("#0B57D0");
    const save = container.querySelector('[aria-label="rule_editor_save"]');
    expect(getComputedStyle(save).fontFamily).toContain("Google Sans");
    expect(getComputedStyle(save).fontSize).toBe("13px");
    expect(getComputedStyle(save).borderRadius).toBe("999px");
    expect(container.querySelector(".MuiFilledInput-root")).not.toBeNull();
    expect(container.querySelector(".MuiOutlinedInput-root")).toBeNull();
  } finally {
    document.documentElement.style.fontSize = originalSize;
  }
});

test.each([false, true])(
  "scope preview exposes its toggle state: %s",
  async (whole) => {
    session.getSnapshot().whole = whole;
    await render();
    const button = [...container.querySelectorAll("button")].find(
      (element) => element.textContent === "rule_editor_whole"
    );
    expect(button.getAttribute("aria-pressed")).toBe(String(whole));
    click(button);
    expect(session.showWhole).toHaveBeenCalledTimes(1);
  }
);

test("manual addition shows only the selector input and save action", async () => {
  Object.assign(session.getSnapshot(), { inspectorOpen: true, input: "" });
  await render();
  const inspector = container.querySelector(
    'aside[aria-label="rule_editor_manualAdd"]'
  );
  expect(inspector.querySelector("textarea")).not.toBeNull();
  expect(document.activeElement).toBe(inspector.querySelector("textarea"));
  expect(inspector.textContent).not.toContain("target_selector");
  expect(inspector.textContent).not.toContain("rule_editor_pick");
  expect(inspector.textContent).toContain("rule_editor_add");
});

test("selected candidate shows its current match inline without a bottom navigation bar", async () => {
  const element = document.createElement("p");
  Object.assign(session.getSnapshot(), {
    inspectorOpen: true,
    selected: element,
    ancestors: [element],
    candidates: [{ selector: ".story", count: 3, kind: "class" }],
    matchIndex: 2,
  });
  await render();
  const inspector = container.querySelector(
    'aside[aria-label="rule_editor_candidates"]'
  );
  expect(inspector.querySelector(".MuiChip-root").textContent).toBe("2 / 3");
  expect(inspector.textContent).toContain("rule_editor_navigateHelp");
  expect(
    inspector.querySelector('[aria-label="rule_editor_previous"]')
  ).toBeNull();
  expect(inspector.querySelector('[aria-label="rule_editor_next"]')).toBeNull();
});
