import { createRoot } from "react-dom/client";
import { act } from "react";
import Popup from "./index";

const mockSendTabMsg = jest.fn();
const mockOpenOptionsHash = jest.fn();
const mockOpenOptionsPage = jest.fn();

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/msg", () => ({
  sendBgMsg: jest.fn(),
  sendTabMsg: (...args) => mockSendTabMsg(...args),
}));

jest.mock("../../libs/browser", () => ({
  browser: {
    runtime: {
      openOptionsPage: (...args) => mockOpenOptionsPage(...args),
    },
  },
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback = key) => fallback,
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: {
      tranboxSetting: {
        enDict: false,
        enSug: false,
        apiSlugs: [],
        fromLang: "auto",
        toLang: "en",
        toLang2: "",
      },
      transApis: [],
      langDetector: "-",
    },
  }),
}));

jest.mock("./Header", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: () => React.createElement("div", null, "Header"),
  };
});

jest.mock("./PopupCont", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: () => React.createElement("div", null, "Popup Content"),
  };
});

jest.mock("../Selection/TranForm", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: () => React.createElement("div", null, "TranForm"),
  };
});

jest.mock("../../libs/optionsPage", () => ({
  openOptionsHash: (...args) => mockOpenOptionsHash(...args),
}));

function renderUI() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Popup />);
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

describe("Popup", () => {
  beforeEach(() => {
    mockSendTabMsg.mockReset();
    mockOpenOptionsHash.mockReset();
    mockOpenOptionsPage.mockReset();
  });

  test("keeps a CEFR entry visible when rule loading fails", async () => {
    mockSendTabMsg.mockRejectedValueOnce(new Error("unsupported tab"));

    const { container, unmount } = renderUI();

    await act(async () => {
      await Promise.resolve();
    });

    const cefrButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "CEFR"
    );
    expect(cefrButton).toBeTruthy();

    act(() => {
      cefrButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockOpenOptionsHash).toHaveBeenCalledTimes(1);
    unmount();
  });
});
