import React, { act } from "react";
import { createRoot } from "react-dom/client";
import useTranboxShortcuts from "./useTranboxShortcuts";
import { EVENT_KISS_INNER, MSG_OPEN_TRANBOX } from "../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/client", () => ({
  isGm: false,
}));

jest.mock("../libs/log", () => ({
  kissLog: jest.fn(),
}));

jest.mock("../config", () => ({
  EVENT_KISS_INNER: "kiss-inner",
  MSG_OPEN_TRANBOX: "open-tranbox",
}));

jest.mock("./I18n", () => ({
  useLangMap: () => (key) => key,
}));

function TestShortcuts(props) {
  useTranboxShortcuts({
    contextMenuType: 0,
    uiLang: "en",
    ...props,
  });
  return null;
}

function renderShortcuts(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(TestShortcuts, props));
  });

  return {
    rerender(nextProps) {
      act(() => {
        root.render(React.createElement(TestShortcuts, nextProps));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function dispatchOpenTranbox(args) {
  act(() => {
    document.dispatchEvent(
      new CustomEvent(EVENT_KISS_INNER, {
        detail: { action: MSG_OPEN_TRANBOX, args },
      })
    );
  });
}

describe("useTranboxShortcuts", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("opens with provided text without toggling the visible box closed", () => {
    const handleOpenTranbox = jest.fn();
    const handleToggleTranbox = jest.fn();
    const setShowBox = jest.fn();
    const view = renderShortcuts({
      showBox: true,
      setShowBox,
      handleOpenTranbox,
      handleToggleTranbox,
    });

    dispatchOpenTranbox({ text: " hello " });

    expect(handleOpenTranbox).toHaveBeenCalledWith("hello");
    expect(setShowBox).not.toHaveBeenCalled();
    expect(handleToggleTranbox).not.toHaveBeenCalled();

    view.unmount();
  });

  test("keeps no-text open message as the existing toggle behavior", () => {
    const handleOpenTranbox = jest.fn();
    const handleToggleTranbox = jest.fn();
    const setShowBox = jest.fn();
    const view = renderShortcuts({
      showBox: false,
      setShowBox,
      handleOpenTranbox,
      handleToggleTranbox,
    });

    dispatchOpenTranbox();

    expect(handleOpenTranbox).not.toHaveBeenCalled();
    expect(handleToggleTranbox).toHaveBeenCalledTimes(1);
    expect(setShowBox).not.toHaveBeenCalled();

    view.rerender({
      showBox: true,
      setShowBox,
      handleOpenTranbox,
      handleToggleTranbox,
    });

    dispatchOpenTranbox();

    expect(setShowBox).toHaveBeenCalledWith(false);
    view.unmount();
  });
});
