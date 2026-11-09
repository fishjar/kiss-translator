/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Diagnostics from "./Diagnostics";
import { diagnosticRequest } from "../../libs/diagnostics/transport";
jest.mock("../../libs/diagnostics/transport", () => ({
  diagnosticRequest: jest.fn(),
}));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../libs/browser", () => ({
  browser: { runtime: { getManifest: () => ({ version: "test" }) } },
}));
global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
const record = {
  id: 1,
  time: 1,
  module: "translation",
  environment: "content",
  level: "debug",
  event: "task.started",
  context: { taskId: "existing" },
};
beforeEach(() => {
  diagnosticRequest.mockReset().mockResolvedValue({
    ok: true,
    records: [record],
    stats: { count: 1, bytes: 100, dropped: 2 },
    consoleLevel: 4,
    next: null,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});
const render = async () => {
  await act(async () => root.render(<Diagnostics />));
};
const button = (label) =>
  Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === label
  );

test("shows DEBUG records with SILENT console, task filtering and expandable metadata", async () => {
  await render();
  expect(container.textContent).toContain("SILENT");
  expect(container.textContent).toContain("DEBUG");
  expect(container.querySelector("details").textContent).toContain(
    '"taskId": "existing"'
  );
  await act(async () => button("existing").click());
  expect(diagnosticRequest).toHaveBeenLastCalledWith("query", {
    filter: { taskId: "existing" },
    page: { before: undefined, limit: 100 },
  });
});

test("selection copies records and a storage failure remains visible", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue() },
  });
  await render();
  await act(async () =>
    container.querySelector('input[aria-label="Select 1"]').click()
  );
  await act(async () => button("diagnostics_copy").click());
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining("task.started")
  );
  diagnosticRequest.mockRejectedValueOnce(new Error("LOG_STORAGE_FAILED"));
  await act(async () => button("diagnostics_refresh").click());
  expect(container.textContent).toContain("LOG_STORAGE_FAILED");
});

test("clearing is explicit and resets selection and displayed records", async () => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
  await render();
  diagnosticRequest.mockImplementation(async (operation) =>
    operation === "clear"
      ? { ok: true }
      : { ok: true, records: [], stats: { count: 0 }, consoleLevel: 4 }
  );
  await act(async () => button("diagnostics_clear").click());
  expect(diagnosticRequest).toHaveBeenCalledWith("clear");
  expect(container.textContent).not.toContain("task.started");
});

test("level buttons are single-select and reset pagination through the existing filter", async () => {
  diagnosticRequest.mockResolvedValue({
    records: [record],
    stats: {},
    next: 1,
  });
  await render();
  const levels = container.querySelector(
    '[role="tablist"][aria-label="diagnostics_level"]'
  );
  const views = container.querySelector(
    '[role="tablist"][aria-label="diagnostics_view"]'
  );
  expect(levels.closest(".MuiTabs-root").parentElement).toBe(
    views.closest(".MuiTabs-root").parentElement
  );
  expect(
    Array.from(levels.querySelectorAll('[role="tab"]')).map(
      (node) => node.textContent
    )
  ).toEqual(["diagnostics_all", "DEBUG", "INFO", "WARN", "ERROR"]);
  await act(async () => {
    const all = button("diagnostics_all");
    all.focus();
    all.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
  });
  expect(document.activeElement).toBe(button("DEBUG"));
  await act(async () => button("diagnostics_next").click());
  expect(diagnosticRequest.mock.calls.at(-1)[1].page.before).toBe(1);
  await act(async () => button("WARN").click());
  expect(diagnosticRequest).toHaveBeenLastCalledWith("query", {
    filter: { level: "warn" },
    page: { before: undefined, limit: 100 },
  });
  expect(levels.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  expect(button("WARN").getAttribute("aria-selected")).toBe("true");
  await act(async () => button("diagnostics_all").click());
  expect(diagnosticRequest.mock.calls.at(-1)[1].filter.level).toBe("");
});

test("continuous mode expands full metadata and multiline stacks without querying or losing page/selection", async () => {
  const full = {
    ...record,
    origin: "https://example.com",
    frameId: 2,
    truncated: true,
    error: {
      name: "Error",
      code: "FAIL",
      stack:
        "    at first (extension.js:1:2)\n    at second (extension.js:3:4)",
    },
  };
  diagnosticRequest.mockResolvedValue({ records: [full], stats: {}, next: 1 });
  await render();
  await act(async () =>
    container.querySelector('input[aria-label="Select 1"]').click()
  );
  await act(async () => button("DEBUG").click());
  await act(async () => button("diagnostics_next").click());
  await act(async () =>
    container.querySelector('input[aria-label="Select 1"]').click()
  );
  const calls = diagnosticRequest.mock.calls.length;
  await act(async () => button("diagnostics_continuous").click());
  expect(diagnosticRequest).toHaveBeenCalledTimes(calls);
  expect(container.querySelector("details")).toBeNull();
  expect(container.querySelector("pre").textContent).toContain(
    full.error.stack
  );
  expect(container.querySelector("pre").textContent).toContain(
    '"origin": "https://example.com"'
  );
  expect(container.querySelector("pre").textContent).toContain(
    '"taskId": "existing"'
  );
  expect(container.querySelector("pre").textContent).toContain(
    '"code": "FAIL"'
  );
  expect(container.textContent.match(/task.started/g)).toHaveLength(1);
  expect(container.textContent).toContain("diagnostics_truncated");
  expect(container.querySelector('input[aria-label="Select 1"]').checked).toBe(
    true
  );
  expect(button("DEBUG").getAttribute("aria-selected")).toBe("true");
  expect(button("diagnostics_previous").disabled).toBe(false);
  await act(async () => button("diagnostics_cards").click());
  expect(diagnosticRequest).toHaveBeenCalledTimes(calls);
  expect(container.querySelector("details").open).toBe(false);
  expect(container.querySelector('input[aria-label="Select 1"]').checked).toBe(
    true
  );
});

test("continuous mode keeps task filtering and copying available", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue() },
  });
  await render();
  await act(async () => button("diagnostics_continuous").click());
  await act(async () => button("existing").click());
  expect(diagnosticRequest.mock.calls.at(-1)[1].filter.taskId).toBe("existing");
  expect(button("diagnostics_continuous").getAttribute("aria-selected")).toBe(
    "true"
  );
  await act(async () =>
    container.querySelector('input[aria-label="Select 1"]').click()
  );
  await act(async () => button("diagnostics_copy").click());
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining("task.started")
  );
});

test("detailed capture control and body inclusion are independent of filters", async () => {
  const full = {
    ...record,
    module: "http",
    request: {
      url: "https://example.com/v1/chat",
      method: "POST",
      preview: { text: "PRIVATE_BODY" },
    },
    response: { status: 429, preview: { text: "PRIVATE_RESULT" } },
    resultSummary: { type: "object", fields: ["error"] },
  };
  const response = { records: [full], stats: {}, consoleLevel: 4 };
  diagnosticRequest.mockImplementation(async (operation) =>
    operation === "setDetail"
      ? { detail: { enabled: true, expiresAt: Date.now() + 1800000 } }
      : response
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue() },
  });
  await render();
  expect(container.textContent).toContain("https://example.com/v1/chat");
  expect(container.textContent).toContain("HTTP 429");
  const check = (label) =>
    [...container.querySelectorAll("label")]
      .find((el) => el.textContent === label)
      .querySelector("input");
  await act(async () => check("diagnostics_detail").click());
  expect(diagnosticRequest).toHaveBeenLastCalledWith("setDetail", {
    enabled: true,
  });
  expect(container.textContent).toContain("diagnostics_remaining");
  await act(async () =>
    container.querySelector('input[aria-label="Select 1"]').click()
  );
  await act(async () => button("diagnostics_copy").click());
  expect(navigator.clipboard.writeText.mock.calls.at(-1)[0]).not.toContain(
    "PRIVATE_BODY"
  );
  await act(async () => check("diagnostics_include_bodies").click());
  await act(async () => button("diagnostics_copy").click());
  expect(navigator.clipboard.writeText.mock.calls.at(-1)[0]).toContain(
    "PRIVATE_RESULT"
  );
});

test("a stale query cannot undo the detailed diagnostics toggle", async () => {
  let finish;
  diagnosticRequest.mockImplementation((operation) =>
    operation === "query"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({
          detail: { enabled: true, expiresAt: Date.now() + 1800000 },
        })
  );
  await render();
  const checkbox = [...container.querySelectorAll("label")]
    .find((el) => el.textContent === "diagnostics_detail")
    .querySelector("input");
  await act(async () => checkbox.click());
  await act(async () =>
    finish({ records: [], stats: {}, detail: { enabled: false, expiresAt: 0 } })
  );
  expect(checkbox.checked).toBe(true);
});
