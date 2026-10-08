/* eslint-disable testing-library/no-unnecessary-act */
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import OptionsTheme from "./OptionsTheme";
import ReusableAutocomplete from "./ReusableAutocomplete";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light" }),
}));
jest.mock("../../hooks/SystemColorScheme", () => ({
  useSystemDarkPreference: () => false,
}));

let container;
let root;
const outsideClick = jest.fn();

beforeEach(() => {
  outsideClick.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mountSelect({ multiple = false } = {}) {
  function Harness() {
    const [value, setValue] = useState(multiple ? ["a"] : "a");
    return (
      <StrictMode>
        <OptionsTheme>
          <TextField
            select
            label="Mode"
            value={value}
            SelectProps={{ multiple }}
            onChange={(event) => setValue(event.target.value)}
          >
            <MenuItem value="a">First</MenuItem>
            <MenuItem value="b">Second</MenuItem>
          </TextField>
          <button onClick={outsideClick}>Other control</button>
        </OptionsTheme>
      </StrictMode>
    );
  }
  act(() => root.render(<Harness />));
  const trigger = container.querySelector('[role="combobox"]');
  trigger.parentElement.getBoundingClientRect = () => ({
    top: 100,
    bottom: 148,
    left: 100,
    right: 360,
    width: 260,
    height: 48,
  });
  act(() => Simulate.mouseDown(trigger, { button: 0 }));
  return trigger;
}

const listbox = () => document.querySelector('[role="listbox"]');
const dispatch = (target, event) => act(() => target.dispatchEvent(event));

test("keeps the page accessible and dismisses on the first unconsumed wheel gesture", () => {
  const trigger = mountSelect();
  expect(listbox()).not.toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(container.getAttribute("aria-hidden")).toBeNull();
  expect(document.activeElement.textContent).toBe("First");
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
  });
  dispatch(container, event);
  expect(event.defaultPrevented).toBe(false);
  expect(listbox()).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});

test.each(["wheel", "touchmove", "scroll"])(
  "keeps internal %s events in a multi-select menu, then closes on page scroll",
  (type) => {
    const trigger = mountSelect({ multiple: true });
    dispatch(listbox(), new Event(type, { bubbles: true, cancelable: true }));
    expect(listbox()).not.toBeNull();
    act(() => document.querySelector('[data-value="b"]').click());
    expect(trigger.textContent).toBe("First, Second");
    expect(listbox()).not.toBeNull();
    dispatch(document, new Event(type, { bubbles: true, cancelable: true }));
    expect(listbox()).toBeNull();
  }
);

test("allows another control to act on the same pointer press that closes the menu", () => {
  mountSelect();
  const button = container.querySelector("button");
  const event = new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  dispatch(button, event);
  expect(event.defaultPrevented).toBe(false);
  expect(listbox()).toBeNull();
  act(() => {
    button.focus();
    button.click();
  });
  expect(outsideClick).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(button);
});

test.each(["Escape", "Tab"])("closes on %s and restores the trigger", (key) => {
  const trigger = mountSelect();
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  dispatch(document.activeElement, event);
  expect(listbox()).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(event.defaultPrevented).toBe(key === "Escape");
});

test("closes when focus moves outside without stealing the new focus", () => {
  mountSelect();
  const button = container.querySelector("button");
  act(() => button.focus());
  expect(listbox()).toBeNull();
  expect(document.activeElement).toBe(button);
});

test("closes a free-text autocomplete on page scroll without committing a draft", () => {
  const onChange = jest.fn();
  act(() =>
    root.render(
      <OptionsTheme>
        <ReusableAutocomplete
          name="model"
          label="Model"
          freeSolo
          value=""
          options={["First", "Second"]}
          onChange={onChange}
        />
      </OptionsTheme>
    )
  );
  const input = container.querySelector("input");
  act(() => {
    input.focus();
    Simulate.keyDown(input, { key: "ArrowDown" });
  });
  expect(listbox()).not.toBeNull();
  dispatch(listbox(), new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
  expect(listbox()).not.toBeNull();
  dispatch(document, new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
  expect(listbox()).toBeNull();
  expect(document.activeElement).toBe(input);
  expect(onChange).not.toHaveBeenCalled();
});
