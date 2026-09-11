/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import DarkModeButton from "./DarkModeButton";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockMode = "light";
const mockToggleDarkMode = jest.fn();

jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({
    darkMode: mockMode,
    toggleDarkMode: mockToggleDarkMode,
  }),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n:
    () =>
    (key, fallback = "") =>
      ({
        settings_appearance_mode: "Appearance mode",
        settings_appearance_mode_transition: "Current {0}; upcoming {1}",
        settings_theme_light: "Light",
        settings_theme_dark: "Dark",
        settings_theme_system: "System",
      })[key] || fallback,
}));

describe("DarkModeButton", () => {
  let container;
  let root;

  beforeEach(() => {
    mockToggleDarkMode.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test.each([
    ["light", "Light", "Dark"],
    ["dark", "Dark", "System"],
    ["auto", "System", "Light"],
  ])("names the %s mode and its next state", (mode, current, next) => {
    mockMode = mode;
    act(() => root.render(<DarkModeButton />));

    const button = container.querySelector("button");
    const expectedLabel = `Current ${current}; upcoming ${next}`;
    expect(button.getAttribute("aria-label")).toBe(expectedLabel);
    expect(button.title).toBe(expectedLabel);

    act(() => button.click());
    expect(mockToggleDarkMode).toHaveBeenCalledTimes(1);
  });
});
