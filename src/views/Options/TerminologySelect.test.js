import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import TerminologySelect from "./TerminologySelect";

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));
jest.mock("../../hooks/Terminology", () => ({
  useTerminologyDirectory: () => ({
    tables: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    error: "",
  }),
}));

let host, root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const click = async (element) =>
  act(async () => {
    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    );
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

test("multi-select appends new choices and reselecting moves an item to the end", async () => {
  const changed = jest.fn();
  function Form() {
    const [value, setValue] = useState(["b"]);
    return (
      <TerminologySelect
        value={value}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  await act(async () => root.render(<Form />));
  await click(host.querySelector('[role="combobox"]'));
  const option = (id) =>
    document.querySelector(`[role="option"][data-value="${id}"]`);
  await click(option("a"));
  expect(changed).toHaveBeenLastCalledWith(["b", "a"]);
  await click(option("b"));
  expect(changed).toHaveBeenLastCalledWith(["a"]);
  await click(option("b"));
  expect(changed).toHaveBeenLastCalledWith(["a", "b"]);
});

test("missing IDs remain selected and can be removed explicitly", async () => {
  const changed = jest.fn();
  await act(async () =>
    root.render(
      <TerminologySelect value={["missing", "a"]} onChange={changed} />
    )
  );
  expect(host.querySelector('[role="alert"]').textContent).toContain(
    "本机未找到"
  );
  expect(changed).not.toHaveBeenCalled();
  const chip = [...host.querySelectorAll(".MuiChip-root")].find(
    (item) => item.textContent === "missing"
  );
  await click(chip.querySelector(".MuiChip-deleteIcon"));
  expect(changed).toHaveBeenCalledWith(["a"]);
});

test("accepts and applies custom sx property", async () => {
  await act(async () =>
    root.render(
      <TerminologySelect
        value={[]}
        onChange={() => {}}
        sx={{ gridColumn: "1 / -1" }}
      />
    )
  );
  const rootStack = host.firstElementChild;
  expect(rootStack).not.toBeNull();
  expect(
    window.getComputedStyle(rootStack).gridColumn.replace(/\s+/g, "")
  ).toBe("1/-1");
});

test("supports custom external i18n prop", async () => {
  const customI18n = jest.fn((key, fallback) => `CUSTOM_${key}`);
  await act(async () =>
    root.render(
      <TerminologySelect i18n={customI18n} value={[]} onChange={() => {}} />
    )
  );
  expect(host.querySelector("label").textContent).toContain(
    "CUSTOM_terminology_tables"
  );
});

test("supports showChips=false and showHelperText=false in compact mode", async () => {
  await act(async () =>
    root.render(
      <TerminologySelect
        value={["a"]}
        onChange={() => {}}
        showChips={false}
        showHelperText={false}
      />
    )
  );
  expect(host.querySelector(".MuiChip-root")).toBeNull();
  expect(host.querySelector(".MuiFormHelperText-root")).toBeNull();
  expect(host.textContent).toContain("A");
});
