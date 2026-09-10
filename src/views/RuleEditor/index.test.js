import { act } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from ".";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../hooks/Theme", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/WindowSize", () => ({
  __esModule: true,
  default: () => ({ w: 1440, h: 900 }),
}));

let root, container, session, originalResizeObserver;
beforeEach(() => {
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
  };
  session = {
    subscribe: () => () => {},
    getSnapshot: () => state,
    edit: jest.fn(),
    remove: jest.fn(),
    hover: jest.fn(),
    refresh: jest.fn(),
    closeInspector: jest.fn(),
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.ResizeObserver = originalResizeObserver;
});
const render = () =>
  act(() => root.render(<Editor session={session} onExit={jest.fn()} />));
const click = (element) =>
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));

test("the entire rule card selects the entry while delete acts independently", () => {
  render();
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

test("selector input and save live only in the closable inspector", () => {
  session.getSnapshot().inspectorOpen = true;
  session.getSnapshot().editing = ".story";
  render();
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
