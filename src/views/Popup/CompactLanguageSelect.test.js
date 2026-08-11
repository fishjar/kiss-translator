/* eslint-disable testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import CompactLanguageSelect from "./CompactLanguageSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("CompactLanguageSelect", () => {
  test("exposes an accessible MUI combobox", () => {
    const container = document.createElement("div");
    container.className = "kt-m3-root";
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CompactLanguageSelect
          ariaLabel="Source language"
          value="zh-CN"
          options={[
            ["en", "English - English"],
            ["zh-CN", "简体中文 - Simplified Chinese"],
          ]}
          onChange={jest.fn()}
        />
      );
    });

    const combobox = container.querySelector('[role="combobox"]');
    expect(combobox).not.toBeNull();
    expect(combobox.getAttribute("aria-label")).toBe("Source language");
    expect(
      combobox.querySelector(".kt-popup-language-value__primary").textContent
    ).toBe("简体中文");
    expect(
      combobox.querySelector(".kt-popup-language-value__secondary").textContent
    ).toBe("Simplified Chinese");
    expect(combobox.querySelector(".kt-popup-language-value").title).toBe(
      "简体中文 - Simplified Chinese"
    );

    act(() => root.unmount());
    container.remove();
  });

  test("mounts the open menu inside the theme root without locking scroll", () => {
    const container = document.createElement("div");
    container.className = "kt-m3-root";
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CompactLanguageSelect
          ariaLabel="Source language"
          value="en"
          options={[
            ["en", "English - English"],
            ["zh-CN", "简体中文 - Simplified Chinese"],
          ]}
          onChange={jest.fn()}
        />
      );
    });

    const combobox = container.querySelector('[role="combobox"]');
    expect(combobox.querySelector(".kt-popup-language-value").title).toBe(
      "English"
    );
    act(() => {
      combobox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    const menu = container.querySelector(".kt-popup-language-menu");
    expect(menu).not.toBeNull();
    expect(menu.closest(".kt-m3-root")).toBe(container);
    expect(container.getAttribute("aria-hidden")).toBeNull();
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll('[role="option"]')).map(
        (option) => option.textContent
      )
    ).toEqual(["English", "简体中文 - Simplified Chinese"]);
    expect(document.body.style.overflow).toBe("");

    act(() => root.unmount());
    container.remove();
  });
});
