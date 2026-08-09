import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Navigator from "./Navigator";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../components/Logo", () => {
  const React = require("react");
  return () => React.createElement("span", null, "logo");
});

describe("settings navigator semantics", () => {
  test("exposes dialog semantics only for the open mobile navigator", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleClose = jest.fn();

    act(() =>
      root.render(
        <MemoryRouter>
          <Navigator open isMobile onClose={handleClose} />
        </MemoryRouter>
      )
    );

    const navigation = container.querySelector("#kt-options-navigation");
    expect(navigation.getAttribute("role")).toBe("dialog");
    expect(navigation.getAttribute("aria-modal")).toBe("true");
    expect(navigation.getAttribute("aria-labelledby")).toBe(
      "kt-options-navigation-title"
    );
    expect(navigation.getAttribute("tabindex")).toBe("-1");
    expect(
      container.querySelector("#kt-options-navigation-title").textContent
    ).toBe("app_name");
    const closeButton = container.querySelector(
      'button[aria-label="options_close_navigation"]'
    );
    expect(closeButton).not.toBeNull();
    act(() => closeButton.click());
    expect(handleClose).toHaveBeenCalledTimes(1);

    act(() =>
      root.render(
        <MemoryRouter>
          <Navigator open={false} isMobile={false} />
        </MemoryRouter>
      )
    );
    expect(navigation.hasAttribute("role")).toBe(false);
    expect(navigation.hasAttribute("aria-modal")).toBe(false);
    expect(navigation.hasAttribute("tabindex")).toBe(false);
    expect(
      container.querySelector('button[aria-label="options_close_navigation"]')
    ).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
