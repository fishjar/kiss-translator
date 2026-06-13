import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserTtsBtn } from "./AudioBtn";
import { canSpeak, speak } from "../../libs/speech";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/speech", () => ({
  canSpeak: jest.fn(),
  speak: jest.fn(),
}));

jest.mock("../../hooks/Audio", () => ({
  useAudio: () => ({
    error: null,
    ready: true,
    playing: false,
    onPlay: jest.fn(),
  }),
}));

jest.mock("query-string", () => ({
  stringify: jest.fn(() => ""),
}));

function renderBrowserTtsBtn(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<BrowserTtsBtn text="hello" lang="en" {...props} />);
  });

  return { container, root };
}

describe("BrowserTtsBtn", () => {
  beforeEach(() => {
    canSpeak.mockReturnValue(true);
    speak.mockReset();
    document.body.innerHTML = "";
  });

  test("does not render when browser speech is unsupported", () => {
    canSpeak.mockReturnValue(false);

    const { container, root } = renderBrowserTtsBtn();

    expect(container.querySelector("button")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  test("highlights while speaking and ignores repeated clicks until speech ends", () => {
    let onEnd;
    speak.mockImplementation((text, lang, callbacks) => {
      onEnd = callbacks.onEnd;
      return true;
    });

    const { container, root } = renderBrowserTtsBtn();
    const button = container.querySelector("button");

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(speak).toHaveBeenCalledTimes(1);
    expect(button.className).toContain("MuiIconButton-colorPrimary");

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(speak).toHaveBeenCalledTimes(1);

    act(() => {
      onEnd();
    });

    expect(button.className).not.toContain("MuiIconButton-colorPrimary");

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(speak).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
  });
});
