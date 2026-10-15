import { act } from "react";
import { createRoot } from "react-dom/client";
import { AudioBtn, BrowserTtsBtn } from "./AudioBtn";
import { canSpeak, speak } from "../../libs/speech";
import { invokeSavedService } from "../../providers/savedService";
import { getSettingWithDefault } from "../../libs/storage";
jest.mock("../../providers/savedService", () => ({
  invokeSavedService: jest.fn(),
}));
jest.mock("../../libs/storage", () => ({ getSettingWithDefault: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("a saved legacy SystemTTS instance plays through speak without requiring a provider snapshot", async () => {
  getSettingWithDefault.mockResolvedValue({
    transApis: [
      { apiSlug: "legacy-speech", apiType: "SystemTTS", enabledCapabilities: ["speak"] },
    ],
  });
  invokeSavedService.mockReturnValue({
    result: Promise.resolve({ status: "ended" }),
    cancel: jest.fn(),
    assets: { clear: jest.fn() },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<BrowserTtsBtn text="hello" serviceId="legacy-speech" />)
    );
    await act(async () => container.querySelector("button").click());
    expect(invokeSavedService).toHaveBeenCalledWith("legacy-speech", "speak", {
      text: "hello",
      language: "en-US",
    });
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

jest.mock("../../libs/speech", () => ({
  canSpeak: jest.fn(),
  speak: jest.fn(),
}));

let mockAudioState;

jest.mock("../../hooks/Audio", () => ({
  useAudio: () =>
    mockAudioState || {
      error: null,
      ready: true,
      playing: false,
      onPlay: jest.fn(),
      onPause: jest.fn(),
    },
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
    mockAudioState = undefined;
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

  test("keeps focus while speaking and ignores repeated activations until speech ends", () => {
    let onEnd;
    speak.mockImplementation((text, lang, callbacks) => {
      onEnd = callbacks.onEnd;
      return true;
    });

    const { container, root } = renderBrowserTtsBtn();
    const button = container.querySelector("button");

    act(() => {
      button.focus();
      button.click();
      // The second activation arrives before React renders the busy state.
      button.click();
    });

    expect(speak).toHaveBeenCalledTimes(1);
    expect(button.className).toContain("MuiIconButton-colorPrimary");
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(speak).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);

    act(() => {
      onEnd();
    });

    expect(button.className).not.toContain("MuiIconButton-colorPrimary");
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(document.activeElement).toBe(button);

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(speak).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
  });

  test("releases its activation guard when speech cannot start", () => {
    speak.mockReturnValue(false);
    const { container, root } = renderBrowserTtsBtn();
    const button = container.querySelector("button");
    act(() => {
      button.focus();
      button.click();
    });
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(document.activeElement).toBe(button);
    act(() => button.click());
    expect(speak).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });
});

describe("AudioBtn", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("exposes a named ready action and pauses from the playing state", () => {
    const onPlay = jest.fn();
    const onPause = jest.fn();
    mockAudioState = {
      error: null,
      ready: true,
      playing: false,
      onPlay,
      onPause,
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => root.render(<AudioBtn src="audio" title="Speak word" />));
    const button = container.querySelector("button");
    expect(button.getAttribute("aria-label")).toBe("Speak word");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    act(() => button.click());
    expect(onPlay).toHaveBeenCalledTimes(1);

    mockAudioState = { ...mockAudioState, playing: true };
    act(() =>
      root.render(
        <AudioBtn src="audio" title="Speak word" pauseTitle="Pause word" />
      )
    );
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Pause word");
    act(() => button.click());
    expect(onPause).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});
