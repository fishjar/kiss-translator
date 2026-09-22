/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import ValidationInput from "./ValidationInput";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderInput(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ValidationInput {...props} />));
  return {
    container,
    input: container.querySelector('input[type="number"]'),
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test("forwards integer bounds to the native input and clamps on blur", () => {
  const onChange = jest.fn();
  const view = renderInput({
    value: 5,
    min: 1,
    max: 10,
    name: "count",
    label: "Count",
    onChange,
  });

  expect(view.input.min).toBe("1");
  expect(view.input.max).toBe("10");
  expect(view.input.step).toBe("1");

  act(() => Simulate.change(view.input, { target: { value: "20" } }));
  act(() => Simulate.blur(view.input));

  expect(view.input.value).toBe("10");
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ target: { name: "count", value: 10 } })
  );
  view.cleanup();
});

test("uses an unrestricted native step for floating-point settings", () => {
  const view = renderInput({
    value: 0.5,
    min: 0,
    max: 2,
    isFloat: true,
    name: "temperature",
    label: "Temperature",
    onChange: jest.fn(),
  });

  expect(view.input.min).toBe("0");
  expect(view.input.max).toBe("2");
  expect(view.input.step).toBe("any");
  view.cleanup();
});
