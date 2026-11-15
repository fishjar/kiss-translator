import { act } from "react";
import { createRoot } from "react-dom/client";
import { ServiceTestResult } from "./ServiceForm";
import { useAlert } from "../../hooks/Alert";

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../hooks/Alert", () => ({ useAlert: jest.fn() }));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: {} }),
}));
jest.mock("../../hooks/ProviderI18n", () => ({
  useProviderI18n: () => (key) => key,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("copies the complete current result and reports clipboard success or failure", async () => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const alert = { success: jest.fn(), error: jest.fn() };
  useAlert.mockReturnValue(alert);
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  try {
    const result = JSON.stringify(
      { text: "recognized\ntext", items: [] },
      null,
      2
    );
    await act(async () => root.render(<ServiceTestResult result={result} />));
    expect(node.querySelector("textarea").readOnly).toBe(true);
    await act(async () =>
      node.querySelector('button[aria-label="copy"]').click()
    );
    expect(writeText).toHaveBeenLastCalledWith(result);
    expect(alert.success).toHaveBeenCalledWith("copy_success");
    await act(async () => root.render(<ServiceTestResult result="updated" />));
    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () =>
      node.querySelector('button[aria-label="copy"]').click()
    );
    expect(writeText).toHaveBeenLastCalledWith("updated");
    expect(alert.error).toHaveBeenCalledWith(
      "plugin_copy_failed_copy_manually_from_the_read_only_field"
    );
  } finally {
    await act(async () => root.unmount());
    node.remove();
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
    else delete navigator.clipboard;
  }
});
