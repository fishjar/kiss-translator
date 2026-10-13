/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import GlobalFeatures from "./GlobalFeatures";
import { usePopupFeatureToggles } from "./usePopupFeatureToggles";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("./usePopupFeatureToggles", () => ({
  usePopupFeatureToggles: jest.fn(),
}));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) =>
    key === "popup_global_feature_scope"
      ? "{feature}: applies to all websites"
      : key,
}));

describe("persistent global feature segments", () => {
  let container;
  let root;
  let model;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    model = {
      features: [
        { name: "selection", enabled: true, pending: false, failed: false },
        { name: "hover", enabled: false, pending: false, failed: false },
        { name: "input", enabled: false, pending: false, failed: false },
      ],
      handleTransboxToggle: jest.fn(),
      handleMouseHoverToggle: jest.fn(),
      handleInputToggle: jest.fn(),
    };
    usePopupFeatureToggles.mockImplementation(() => model);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = (props = {}) =>
    act(() => root.render(<GlobalFeatures {...props} />));

  test("uses an accessible independent toggle group with active check and inactive feature icons", () => {
    render();
    const group = container.querySelector('[role="group"]');
    expect(group.getAttribute("aria-label")).toBe("popup_global_features");
    expect(group.querySelectorAll("button")).toHaveLength(3);
    expect(
      group
        .querySelector('[data-feature="selection"]')
        .getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      group.querySelector(
        '[data-feature="selection"] [data-testid="CheckRoundedIcon"]'
      )
    ).not.toBeNull();
    expect(
      group.querySelector(
        '[data-feature="hover"] [data-testid="MouseRoundedIcon"]'
      )
    ).not.toBeNull();
    expect(
      group.querySelector(
        '[data-feature="input"] [data-testid="KeyboardRoundedIcon"]'
      )
    ).not.toBeNull();
    expect(group.querySelector('[role="radio"]')).toBeNull();
    expect(group.querySelector("h1, h2, h3, p")).toBeNull();
    expect(group.querySelector('[data-feature="hover"]').title).toBe(
      "popup_hover_translation: applies to all websites"
    );
  });

  test("switches each feature independently", () => {
    render();
    act(() => {
      container.querySelector('[data-feature="selection"]').click();
      container.querySelector('[data-feature="hover"]').click();
      container.querySelector('[data-feature="input"]').click();
    });
    expect(model.handleTransboxToggle).toHaveBeenCalledWith(false);
    expect(model.handleMouseHoverToggle).toHaveBeenCalledWith(true);
    expect(model.handleInputToggle).toHaveBeenCalledWith(true);
  });

  test("keeps global preferences operable while the website is disabled", () => {
    render({ isDisabledPage: true });
    expect(
      Array.from(container.querySelectorAll("button")).every(
        (button) => !button.disabled
      )
    ).toBe(true);
    act(() => container.querySelector('[data-feature="hover"]').click());
    expect(model.handleMouseHoverToggle).toHaveBeenCalledWith(true);
    expect(usePopupFeatureToggles).toHaveBeenCalledWith(
      expect.objectContaining({ isDisabledPage: true })
    );
  });

  test("keeps pending feedback in the affected segment and leaves its siblings available", () => {
    model.features[1].pending = true;
    render();
    const pending = container.querySelector('[data-feature="hover"]');
    expect(pending.disabled).toBe(false);
    expect(pending.getAttribute("aria-disabled")).toBe("true");
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector('[data-feature="selection"]').disabled).toBe(
      false
    );
    expect(container.querySelectorAll("button")).toHaveLength(3);
    act(() => pending.click());
    expect(model.handleMouseHoverToggle).not.toHaveBeenCalled();
  });

  test("announces a failure inside the affected segment without a popup message", () => {
    model.features[1].failed = true;
    render();
    const failed = container.querySelector('[data-feature="hover"]');
    expect(failed.getAttribute("data-error")).toBe("true");
    expect(failed.getAttribute("aria-label")).toBe("popup_hover_translation");
    expect(failed.querySelector('[role="status"]').textContent).toBe(
      "popup_global_toggle_failed"
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  test("renders only permitted segments and omits the group when none are available", () => {
    model.features = model.features.filter(
      (feature) => feature.name === "input"
    );
    render();
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector('[data-feature="input"]')).not.toBeNull();
    model.features = [];
    render();
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  test("prevents new actions while its page panel is hidden", () => {
    render({ isVisible: false });
    act(() => container.querySelector('[data-feature="selection"]').click());
    expect(model.handleTransboxToggle).not.toHaveBeenCalled();
    expect(
      Array.from(container.querySelectorAll("button")).every(
        (button) => button.disabled
      )
    ).toBe(true);
  });
});
