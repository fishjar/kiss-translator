import { createRoot } from "react-dom/client";
import { act } from "react";
import Action from "./index";

const mockOpenOptionsHash = jest.fn();
const mockPopupCont = jest.fn(({ handleOpenCEFR }) => (
  <button type="button" onClick={handleOpenCEFR}>
    Open CEFR
  </button>
));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Theme", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock("./Draggable", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children, handler }) =>
      React.createElement(
        "div",
        null,
        handler,
        children
      ),
  };
});

jest.mock("../../hooks/Setting", () => {
  const React = require("react");
  return {
    SettingProvider: ({ children }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock("../Popup/Header", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: () => React.createElement("div", null, "Header"),
  };
});

jest.mock("../../hooks/WindowSize", () => ({
  __esModule: true,
  default: () => ({ w: 800, h: 600 }),
}));

jest.mock("../Popup/PopupCont", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props) => {
      mockPopupCont(props);
      return React.createElement(
        "button",
        {
          type: "button",
          onClick: props.handleOpenCEFR,
        },
        "Open CEFR"
      );
    },
  };
});

jest.mock("../../libs/optionsPage", () => ({
  openOptionsHash: (...args) => mockOpenOptionsHash(...args),
}));

function renderUI(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Action {...props} />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("Action", () => {
  beforeEach(() => {
    mockOpenOptionsHash.mockReset();
    mockPopupCont.mockClear();
  });

  test("wires a CEFR callback into PopupCont for the in-page popup", () => {
    const { container, unmount } = renderUI({
      translator: {
        rule: { transOpen: "true" },
        setting: {},
      },
      processActions: jest.fn(),
    });

    expect(mockPopupCont).toHaveBeenCalled();
    expect(mockPopupCont.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        handleOpenCEFR: expect.any(Function),
      })
    );

    act(() => {
      container
        .querySelector("button")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockOpenOptionsHash).toHaveBeenCalledTimes(1);
    unmount();
  });
});
