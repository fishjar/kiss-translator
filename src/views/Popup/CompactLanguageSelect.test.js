/* eslint-disable testing-library/no-unnecessary-act, testing-library/no-container */
import { act } from "react";
import { createRoot } from "react-dom/client";
import CompactLanguageSelect from "./CompactLanguageSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => (key === "popup_auto_detect" ? "Auto detect" : key),
}));
const options = [
  ["auto", "Auto detect"],
  ["en", "English - English"],
  ["zh-CN", "简体中文 - Simplified Chinese"],
];
function mount(props = {}) {
  const container = document.createElement("div");
  container.className = "kt-m3-root";
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChange = jest.fn();
  act(() =>
    root.render(
      <CompactLanguageSelect
        ariaLabel="Source language"
        value="zh-CN"
        options={options}
        onChange={onChange}
        {...props}
      />
    )
  );
  return {
    container,
    onChange,
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("CompactLanguageSelect", () => {
  test("keeps the trigger compact while exposing its complete language name", () => {
    const { container, close } = mount({ changed: true });
    const trigger = container.querySelector('[role="combobox"]');
    expect(trigger.getAttribute("aria-label")).toBe("Source language");
    expect(trigger.title).toBe("简体中文 - Simplified Chinese");
    expect(
      trigger.querySelector(".kt-popup-language-value__primary").textContent
    ).toBe("简体中文");
    expect(
      trigger.querySelector(".kt-popup-language-value__secondary")
    ).toBeNull();
    expect(trigger.querySelector(".kt-popup-dirty-dot")).not.toBeNull();
    close();
  });
  test("portals a bilingual listbox outside its trigger without locking scroll", () => {
    const { container, onChange, close } = mount();
    const trigger = container.querySelector('[role="combobox"]');
    act(() => trigger.click());
    const menu = container.querySelector(".kt-popup-language-menu");
    expect(menu).not.toBeNull();
    expect(menu.closest(".kt-m3-root")).toBe(container);
    expect(trigger.contains(menu)).toBe(false);
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(container.querySelector(".MuiDivider-root")).not.toBeNull();
    expect(
      menu.querySelector(".kt-popup-language-menu__secondary").textContent
    ).toBe("Simplified Chinese");
    expect(document.body.style.overflow).toBe("");
    const english = Array.from(menu.querySelectorAll('[role="option"]')).find(
      (item) => item.textContent === "English"
    );
    act(() => english.click());
    expect(onChange).toHaveBeenCalledWith({ target: { value: "en" } });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    close();
  });
  test("opens with an arrow key and respects disabled state", () => {
    const { container, close } = mount();
    const trigger = container.querySelector('[role="combobox"]');
    act(() =>
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      )
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    close();
    const disabled = mount({ disabled: true });
    expect(disabled.container.querySelector('[role="combobox"]').disabled).toBe(
      true
    );
    disabled.close();
  });
});
