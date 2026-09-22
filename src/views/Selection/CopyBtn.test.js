/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import CopyBtn from "./CopyBtn";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("preserves shared button transitions while fading the copy action", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<CopyBtn text="hello" title="Copy" />));

  const button = container.querySelector("button");
  const styles = getComputedStyle(button);
  expect(styles.opacity).toBe("0.72");
  expect(styles.transition).toContain("background-color");
  expect(styles.transition).toContain("color");
  expect(styles.transition).toContain("opacity");
  expect(styles.transition).toContain("transform");

  act(() => root.unmount());
  container.remove();
});

test("announces a successful copy without replacing the button name", async () => {
  jest.useFakeTimers();
  const originalClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    "clipboard"
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    act(() =>
      root.render(<CopyBtn text="hello" title="Copy" copiedLabel="Copied" />)
    );
    const button = container.querySelector("button");
    const status = container.querySelector('[role="status"]');

    expect(button.getAttribute("aria-label")).toBe("Copy");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");

    await act(async () => button.click());

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(button.getAttribute("aria-label")).toBe("Copy");
    expect(status.textContent).toBe("Copied");

    act(() => jest.advanceTimersByTime(500));
    expect(status.textContent).toBe("");
  } finally {
    act(() => root.unmount());
    container.remove();
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      delete navigator.clipboard;
    }
    jest.useRealTimers();
  }
});

test("does not schedule copy feedback after unmount", async () => {
  jest.useFakeTimers();
  const originalClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    "clipboard"
  );
  let resolveWrite;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveWrite = resolve;
          })
      ),
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    act(() => root.render(<CopyBtn text="hello" title="Copy" />));
    act(() => container.querySelector("button").click());
    act(() => root.unmount());

    await act(async () => {
      resolveWrite();
      await Promise.resolve();
    });

    expect(jest.getTimerCount()).toBe(0);
  } finally {
    container.remove();
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      delete navigator.clipboard;
    }
    jest.useRealTimers();
  }
});
