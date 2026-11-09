import { act } from "react";
import { createRoot } from "react-dom/client";
import TerminologyTables from "./TerminologyTables";
import {
  readTerminologyTable,
  saveTerminologyTable,
} from "../../libs/terminologyStorage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-router-dom", () => ({
  useBlocker: () => ({ state: "unblocked" }),
}));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) =>
    ({
      terminology_invalid: "请修正普通术语中的错误后再保存。",
      terminology_error_operation: "操作失败",
    })[key] || key,
}));
jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => async () => true,
}));
jest.mock("../../hooks/Terminology", () => ({
  useTerminologyDirectory: () => ({
    tables: [{ id: "current", name: "Current" }],
  }),
}));
jest.mock("../../libs/terminologyStorage", () => ({
  readTerminologyTable: jest.fn(),
  saveTerminologyTable: jest.fn(),
}));
jest.mock("../../libs/terminologySync", () => ({ syncTerminology: jest.fn() }));
jest.mock("../Selection/CopyBtn", () => () => null);
jest.mock("../../hooks/useTextareaHeightLock", () => ({
  __esModule: true,
  default: () => ({ releaseHeight: () => {}, rootProps: {}, textareaRef: {} }),
  useTextareaGripStyle: () => "hidden",
  useReleaseOnGripHidden: () => {},
}));

test("invalid text imported into a regex table shows the localized error only once and does not save", async () => {
  const originalCrypto = globalThis.crypto;
  globalThis.crypto = { randomUUID: () => "import-id" };
  readTerminologyTable.mockResolvedValue({
    id: "current",
    name: "Current",
    description: "",
    terms: "",
    aiTerms: "",
    normalMatchMode: "regex",
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const click = async (element) => act(async () => element.click());
  try {
    await act(async () => root.render(<TerminologyTables />));
    await click(
      [...host.querySelectorAll("button, [role=button]")].find(
        (node) => node.textContent === "Current"
      )
    );
    const input = host.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      value: [{ name: "terms.txt", text: async () => "[,literal bracket" }],
    });
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true }))
    );
    const dialog = document.querySelector('[role="dialog"]');
    const destination = dialog.querySelectorAll('[role="combobox"]')[2];
    await act(async () =>
      destination.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    );
    await click(
      document.querySelector('[role="option"][data-value="current"]')
    );
    await click(
      [...dialog.querySelectorAll("button")].find(
        (node) => node.textContent === "import"
      )
    );
    expect(dialog.querySelector('[role="alert"]').textContent).toBe(
      "请修正普通术语中的错误后再保存。"
    );
    expect(saveTerminologyTable).not.toHaveBeenCalled();
  } finally {
    globalThis.crypto = originalCrypto;
    act(() => root.unmount());
    host.remove();
  }
});
