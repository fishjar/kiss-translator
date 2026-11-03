import { act } from "react";
import { createRoot } from "react-dom/client";
import FileTranslateSettings from "./FileTranslateSettings";

jest.mock("../../hooks/I18n", () => {
  throw new Error("The standalone file page must not import settings hooks");
});
jest.mock("../../hooks/Terminology", () => {
  throw new Error(
    "The standalone file page must not import terminology storage"
  );
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("uses only the bridge-provided directory and language for terminology selection", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changed = jest.fn();
  try {
    await act(async () =>
      root.render(
        <FileTranslateSettings
          i18n={(key, fallback) => fallback || key}
          scene={{
            fromLang: "auto",
            toLang: "zh-CN",
            apiSlug: "",
            termsList: ["topic"],
          }}
          services={[]}
          prompts={[]}
          terminologyDirectory={[
            { id: "topic", name: "Topic" },
            { id: "next", name: "Next" },
          ]}
          onChange={changed}
        />
      )
    );
    const select = [...host.querySelectorAll('[role="combobox"]')].find(
      (node) => node.textContent.includes("Topic")
    );
    expect(select).toBeDefined();
    await act(async () =>
      select.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    );
    await act(async () =>
      document.querySelector('[role="option"][data-value="next"]').click()
    );
    expect(changed).toHaveBeenLastCalledWith({ termsList: ["topic", "next"] });
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
