/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import useSelectionController from "../../hooks/useSelectionController";
import Selection from "./index";

jest.mock("../../hooks/useSelectionController", () => jest.fn());
jest.mock("../../hooks/useTranBoxState", () => () => ({}));
jest.mock("../../hooks/useTranboxShortcuts", () => () => {});
jest.mock(
  "../../hooks/M3Theme",
  () =>
    ({ children }) =>
      children
);
jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("./TranBox", () => () => null);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test.each([
  ["onMouseOver", "mouseover", 300],
  ["onMouseUp", "mouseup", 0],
])("renders the selection button for %s", (btnEvent, eventType, delay) => {
  jest.useFakeTimers();
  const handleOpenTranbox = jest.fn();
  useSelectionController.mockReturnValue({
    showBtn: true,
    position: { x: 20, y: 30 },
    btnEvent,
    triggerHoverDelay: 300,
    handleOpenTranbox,
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    act(() => root.render(<Selection />));
    const button = container.querySelector(".KT-tranbtn");
    expect(button).not.toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent(eventType, { bubbles: true }));
    });
    if (delay) {
      act(() => jest.advanceTimersByTime(delay - 1));
      expect(handleOpenTranbox).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));
    }
    expect(handleOpenTranbox).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  }
});
