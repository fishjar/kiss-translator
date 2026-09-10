import { act } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from ".";
import { storage } from "../../libs/storage";
import {
  STOKEY_RULE_EDITOR_POSITION,
  STOKEY_RULE_INSPECTOR_POSITION,
} from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../hooks/Theme", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../libs/storage", () => ({
  storage: { getObj: jest.fn(), setObj: jest.fn() },
}));
jest.mock("../../libs/sync", () => ({ syncData: jest.fn() }));

let root, container, session, originalResizeObserver;
beforeEach(() => {
  storage.getObj.mockReset().mockResolvedValue(null);
  storage.setObj.mockReset().mockResolvedValue();
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const state = {
    context: { effective: { autoScan: "false" } },
    field: "selector",
    entries: [{ selector: ".story", count: 2, source: "global" }],
    input: ".story",
    matches: [],
    ancestors: [],
    candidates: [],
    pattern: "hostname:localhost",
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
    setField: jest.fn(),
    setPattern: jest.fn(),
    commitPattern: jest.fn(),
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.ResizeObserver = originalResizeObserver;
});
const render = () =>
  act(async () => root.render(<Editor session={session} onExit={jest.fn()} />));
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
  click(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "rule_editor_delete"
    )
  );
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

test("themed menus reuse settings labels and keep automatic scanning values", async () => {
  await render();
  expect(container.querySelector("select")).toBeNull();
  const selects = container.querySelectorAll('[role="combobox"]');
  expect(selects[0].textContent).toContain("disable");
  expect(container.textContent).toContain("auto_scan_page");
  expect(selects[1].textContent).toContain("target_selector");
  act(() =>
    selects[0].dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    )
  );
  click(document.querySelector('[role="option"][data-value="true"]'));
  expect(session.save).toHaveBeenCalledWith({ autoScan: "true" });
  act(() =>
    selects[1].dispatchEvent(
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
  expect(footer.textContent).not.toContain("rule_editor_saved");
  expect(footer.textContent.indexOf("rule_editor_pagePreview")).toBeLessThan(
    footer.textContent.indexOf("rule_editor_rule-conflict")
  );
});

test("save confirmation appears after the preview in the footer", async () => {
  session.getSnapshot().notice = "saved";
  await render();
  const footer = container.querySelector("footer");
  expect(footer.querySelector('[role="alert"]').textContent).toContain(
    "rule_editor_saved"
  );
  expect(footer.textContent.indexOf("rule_editor_pagePreview")).toBeLessThan(
    footer.textContent.indexOf("rule_editor_saved")
  );
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
  act(() => root.unmount());
  const shadow = container.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "notranslate";
  shadow.appendChild(wrapper);
  root = createRoot(wrapper);
  await render();
  const scan = shadow.querySelector('[role="combobox"]');
  act(() =>
    scan.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    )
  );
  const list = shadow.querySelector('[role="listbox"]');
  const options = list.querySelectorAll('[role="option"]');
  expect(shadow.activeElement).toBe(options[0]);
  act(() =>
    options[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    )
  );
  expect(shadow.activeElement).toBe(options[1]);
  click(options[1]);
  expect(session.save).toHaveBeenCalledWith({ autoScan: "true" });
});

test("site pattern is editable and saves on blur or Enter", async () => {
  await render();
  const input = container.querySelector('input[value="hostname:localhost"]');
  expect(input).not.toBeNull();
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(input, "localhost");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(session.setPattern).toHaveBeenCalledWith("localhost");
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
  expect(session.commitPattern).toHaveBeenCalledTimes(1);
  act(() => {
    input.focus();
    input.blur();
  });
  expect(session.commitPattern).toHaveBeenCalledTimes(2);
});

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
