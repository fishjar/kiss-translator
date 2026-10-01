/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
// Direct React DOM fixtures verify preview drafts independently from persistence.
import { act } from "react";
import { createRoot } from "react-dom/client";
import FabAppearanceSetting from "./FabAppearanceSetting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("@mui/material/Slider", () => {
  return function MockSlider({
    name,
    value,
    min,
    max,
    step,
    componentsProps,
    onChange,
    onChangeCommitted,
    "aria-labelledby": labelledBy,
  }) {
    const ReactApi = jest.requireActual("react");
    return ReactApi.createElement("input", {
      ...componentsProps?.input,
      type: "range",
      name,
      value,
      min,
      max,
      step,
      "aria-labelledby": labelledBy,
      onInput: (event) => onChange(event, Number(event.currentTarget.value)),
      onMouseUp: (event) =>
        onChangeCommitted(event, Number(event.currentTarget.value)),
    });
  };
});

function renderAppearance(fab = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChange = jest.fn();
  const render = (nextFab) => {
    act(() =>
      root.render(<FabAppearanceSetting fab={nextFab} onChange={onChange} />)
    );
  };
  render(fab);
  return {
    container,
    onChange,
    render,
    button: () => container.querySelector(".kt-content-fab"),
    opacityLayer: () => container.querySelector(".kt-fab-preview-opacity"),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function dragSlider(input, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("floating button appearance preview", () => {
  test("previews each slider draft before committing its own preference", () => {
    const view = renderAppearance({ opacity: 0.5, size: 56, halfHide: true });
    const opacity = view.container.querySelector('input[name="opacity"]');
    const size = view.container.querySelector('input[name="size"]');

    try {
      dragSlider(opacity, 20);
      expect(view.opacityLayer().style.opacity).toBe("0.2");
      expect(
        view.container.querySelector("#fab-opacity-value").textContent
      ).toBe("20%");
      expect(view.onChange).not.toHaveBeenCalled();

      act(() =>
        opacity.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      );
      expect(view.onChange.mock.calls).toEqual([[{ opacity: 0.2 }]]);

      dragSlider(size, 96);
      expect(view.button().style.getPropertyValue("--kt-fab-size")).toBe(
        "96px"
      );
      expect(
        view.container.querySelector(".kt-fab-preview-dimensions").textContent
      ).toBe("96 × 96 px");
      expect(view.opacityLayer().style.opacity).toBe("0.2");
      expect(view.onChange).toHaveBeenCalledTimes(1);

      act(() =>
        size.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      );
      expect(view.onChange.mock.calls).toEqual([
        [{ opacity: 0.2 }],
        [{ size: 96 }],
      ]);
    } finally {
      view.unmount();
    }
  });

  test("resynchronizes saved appearance without resetting the local preview theme", () => {
    const view = renderAppearance({ opacity: 0.5, size: 56 });

    try {
      act(() => view.button().click());
      expect(
        view.container.querySelector(".kt-fab-preview-stage").dataset.theme
      ).toBe("dark");
      dragSlider(view.container.querySelector('input[name="size"]'), 96);
      view.render({ opacity: 0.3, size: 32, isHide: true, halfHide: true });

      expect(view.container.querySelector('input[name="opacity"]').value).toBe(
        "30"
      );
      expect(view.container.querySelector('input[name="size"]').value).toBe(
        "32"
      );
      expect(view.button().style.getPropertyValue("--kt-fab-size")).toBe(
        "32px"
      );
      expect(view.opacityLayer().style.opacity).toBe("0.3");
      expect(view.button().getAttribute("aria-pressed")).toBe("true");
      expect(
        view.container.querySelector(".kt-fab-preview-stage").dataset.theme
      ).toBe("dark");
      expect(view.onChange).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });
});
