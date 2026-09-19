import { act, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import InteractionLock from "./InteractionLock";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Options interaction lock without native inert behavior", () => {
  let container;
  let portal;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    portal = document.createElement("div");
    document.body.append(container, portal);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    portal.remove();
  });

  const render = (children, locked = true) => {
    act(() => {
      root.render(
        <InteractionLock locked={locked}>{children}</InteractionLock>
      );
    });
  };

  const dispatch = (target, event) => {
    let allowed;
    act(() => {
      allowed = target.dispatchEvent(event);
    });
    return allowed;
  };

  test("keeps data visible while blocking activation, text edits, and submission", () => {
    const onClick = jest.fn();
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    function Editor() {
      const [value, setValue] = useState("Saved data");
      return (
        <form onSubmit={onSubmit}>
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              onChange(event.target.value);
            }}
          />
          <button type="button" onClick={onClick}>
            Save
          </button>
          <output>{value}</output>
        </form>
      );
    }
    render(<Editor />);
    const input = container.querySelector("input");
    const form = container.querySelector("form");
    expect(container.textContent).toContain("Saved data");
    expect(container.firstChild.getAttribute("inert")).toBe("");
    expect(container.firstChild.getAttribute("aria-busy")).toBe("true");

    act(() => {
      input.focus();
      container.querySelector("button").click();
    });
    expect(document.activeElement).not.toBe(input);
    expect(onClick).not.toHaveBeenCalled();

    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    act(() => setValue.call(input, "Unaccepted edit"));
    dispatch(input, new Event("input", { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector("output").textContent).toBe("Saved data");
    expect(
      dispatch(input, new Event("paste", { bubbles: true, cancelable: true }))
    ).toBe(false);
    expect(
      dispatch(form, new Event("submit", { bubbles: true, cancelable: true }))
    ).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();

    render(<Editor />, false);
    act(() => {
      input.focus();
      container.querySelector("button").click();
      setValue.call(input, "Accepted edit");
    });
    dispatch(input, new Event("input", { bubbles: true }));
    expect(document.activeElement).toBe(input);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Accepted edit");
    expect(container.querySelector("output").textContent).toBe("Accepted edit");
    expect(container.firstChild.hasAttribute("inert")).toBe(false);
  });

  test("removes existing focus without committing an edit through a blur handler", () => {
    const onBlur = jest.fn();
    const editor = <input defaultValue="Saved data" onBlur={onBlur} />;
    render(editor, false);
    const input = container.querySelector("input");
    act(() => input.focus());
    expect(document.activeElement).toBe(input);

    render(editor);
    expect(document.activeElement).not.toBe(input);
    expect(onBlur).not.toHaveBeenCalled();
  });

  test("blocks controls mounted later and controls rendered through a portal", () => {
    const onClick = jest.fn();
    const onFocus = jest.fn();
    render(<p>Saved data</p>);
    render(
      <>
        <button onClick={onClick}>Added control</button>
        {createPortal(
          <button onClick={onClick} onFocus={onFocus}>
            Dialog action
          </button>,
          portal
        )}
      </>
    );
    const buttons = [
      container.querySelector("button"),
      portal.querySelector("button"),
    ];
    act(() => {
      buttons.forEach((button) => {
        button.focus();
        button.click();
        expect(document.activeElement).not.toBe(button);
      });
    });
    expect(onClick).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
  });

  test("removes focus from a previously opened portal when locking begins", () => {
    const onBlur = jest.fn();
    const editor = createPortal(<input onBlur={onBlur} />, portal);
    render(editor, false);
    const input = portal.querySelector("input");
    act(() => input.focus());
    expect(document.activeElement).toBe(input);

    render(editor);
    expect(document.activeElement).not.toBe(input);
    expect(onBlur).not.toHaveBeenCalled();
  });

  test.each([
    { key: "r", ctrlKey: true },
    { key: "l", metaKey: true },
    { key: "ArrowLeft", altKey: true },
    { key: "F5" },
    { key: "Tab" },
    { key: "Tab", shiftKey: true },
  ])(
    "preserves browser defaults for %p while excluding app handlers",
    (keys) => {
      const onKeyDown = jest.fn();
      render(<input onKeyDown={onKeyDown} />);
      const event = new KeyboardEvent("keydown", {
        ...keys,
        bubbles: true,
        cancelable: true,
      });
      expect(dispatch(container.querySelector("input"), event)).toBe(true);
      expect(onKeyDown).not.toHaveBeenCalled();
    }
  );

  test("prevents keyboard activation without disabling unrelated document controls", () => {
    const onKeyDown = jest.fn();
    render(<button onKeyDown={onKeyDown}>Save</button>);
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    expect(dispatch(container.querySelector("button"), event)).toBe(false);
    expect(onKeyDown).not.toHaveBeenCalled();

    const outsideButton = document.createElement("button");
    const outsideClick = jest.fn();
    outsideButton.addEventListener("click", outsideClick);
    portal.appendChild(outsideButton);
    outsideButton.focus();
    outsideButton.click();
    expect(document.activeElement).toBe(outsideButton);
    expect(outsideClick).toHaveBeenCalledTimes(1);
  });
});
