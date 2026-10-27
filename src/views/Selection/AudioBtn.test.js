import { act } from "react";
import { createRoot } from "react-dom/client";
import { AudioBtn, BrowserTtsBtn } from "./AudioBtn";
import { canSpeak, speak, stopSpeech } from "../../libs/speech";
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
      {
        apiSlug: "legacy-speech",
        apiType: "SystemTTS",
        enabledCapabilities: ["speak"],
      },
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
  stopSpeech: jest.fn(),
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
    stopSpeech.mockReset();
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

  test("stops native speech on a second activation and ignores a stale end event", () => {
    const ends = [];
    speak.mockImplementation((text, lang, callbacks) => {
      ends.push(callbacks.onEnd);
      return true;
    });

    const { container, root } = renderBrowserTtsBtn({
      title: "Speak",
      stopTitle: "Stop speech",
    });
    const button = container.querySelector("button");

    act(() => {
      button.focus();
      button.click();
    });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(stopSpeech).not.toHaveBeenCalled();
    expect(button.getAttribute("title")).toBe("Stop speech");
    expect(button.getAttribute("aria-label")).toBe("Stop speech");
    expect(button.className).toContain("MuiIconButton-colorPrimary");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(document.activeElement).toBe(button);
    expect(container.querySelector('[data-testid="StopIcon"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="VolumeUpIcon"]')
    ).toBeNull();

    // 停止：第二次激活立即回到可朗读态，不依赖终态事件。
    act(() => {
      button.click();
    });
    expect(stopSpeech).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("title")).toBe("Speak");
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(container.querySelector('[data-testid="StopIcon"]')).toBeNull();

    // 连点「停→起」后，旧会话迟到的 onEnd 不得复位新会话。
    act(() => {
      button.click();
    });
    expect(speak).toHaveBeenCalledTimes(2);
    expect(button.getAttribute("title")).toBe("Stop speech");
    expect(button.getAttribute("aria-busy")).toBe("true");
    act(() => ends[0]());
    expect(button.getAttribute("title")).toBe("Stop speech");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(button);

    // 新会话自己的终态事件正常复位。
    act(() => ends[1]());
    expect(button.getAttribute("title")).toBe("Speak");
    expect(button.getAttribute("aria-busy")).toBe("false");

    act(() => root.unmount());
  });

  test("a playing cloud TTS button shows the stop affordance and stops on click", async () => {
    // CRA 默认 resetMocks: true 在每测前清零 mock；缺此供给时 play() 对
    // undefined 取 .transApis 抛 TypeError → catch → stop()，播放态永不落位。
    getSettingWithDefault.mockResolvedValue({
      transApis: [
        {
          apiSlug: "cloud-stop",
          apiType: "SystemTTS",
          enabledCapabilities: ["speak"],
        },
      ],
    });
    invokeSavedService.mockReturnValue({
      result: new Promise(() => {}),
      cancel: jest.fn(),
      assets: { clear: jest.fn() },
    });
    const { container, root } = renderBrowserTtsBtn({
      serviceId: "cloud-stop",
      title: "Speak",
      stopTitle: "Stop speech",
    });
    const button = container.querySelector("button");

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(button.getAttribute("title")).toBe("Stop speech");
    expect(button.getAttribute("aria-label")).toBe("Stop speech");
    expect(container.querySelector('[data-testid="StopIcon"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="VolumeUpIcon"]')
    ).toBeNull();

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(button.getAttribute("title")).toBe("Speak");
    expect(container.querySelector('[data-testid="StopIcon"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="VolumeUpIcon"]')
    ).not.toBeNull();

    act(() => root.unmount());
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

  test("stops native speech when the component unmounts mid-speech", () => {
    speak.mockImplementation(() => true);
    const { container, root } = renderBrowserTtsBtn();
    const button = container.querySelector("button");
    act(() => {
      button.click();
    });
    expect(stopSpeech).not.toHaveBeenCalled();
    act(() => {
      root.unmount();
    });
    expect(stopSpeech).toHaveBeenCalledTimes(1);
  });

  test("stops native speech and returns to idle when the text is cleared while speaking", () => {
    speak.mockImplementation(() => true);
    const { container, root } = renderBrowserTtsBtn();
    const button = container.querySelector("button");
    act(() => {
      button.click();
    });
    act(() => {
      root.render(<BrowserTtsBtn text="   " lang="en" />);
    });
    expect(stopSpeech).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button")).toBeNull();
    act(() => {
      root.render(<BrowserTtsBtn text="hello again" lang="en" />);
    });
    const restored = container.querySelector("button");
    expect(restored.getAttribute("title")).toBe("Speak");
    expect(restored.getAttribute("aria-busy")).toBe("false");

    // 恢复后的按钮必须能重新启动朗读，而不是残留停止态。
    act(() => {
      restored.click();
    });
    expect(speak).toHaveBeenCalledTimes(2);
    expect(restored.getAttribute("aria-busy")).toBe("true");

    act(() => {
      root.unmount();
    });
    expect(stopSpeech).toHaveBeenCalledTimes(2);
  });

  test("does not stop speech when the text changes while idle", () => {
    speak.mockImplementation(() => true);
    const { container, root } = renderBrowserTtsBtn({ text: "first" });
    act(() => {
      root.render(<BrowserTtsBtn text="second" lang="en" />);
    });
    expect(stopSpeech).not.toHaveBeenCalled();
    expect(container.querySelector("button").getAttribute("aria-busy")).toBe(
      "false"
    );
    act(() => {
      root.unmount();
    });
    expect(stopSpeech).not.toHaveBeenCalled();
  });

  test("stops the old utterance when the text is replaced while speaking", () => {
    speak.mockImplementation(() => true);
    const { container, root } = renderBrowserTtsBtn();
    const button = container.querySelector("button");
    act(() => {
      button.click();
    });
    act(() => {
      root.render(<BrowserTtsBtn text="replaced" lang="en" />);
    });
    expect(stopSpeech).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
    expect(stopSpeech).toHaveBeenCalledTimes(1);
  });

  test("stops native speech when the lang changes while speaking", () => {
    speak.mockImplementation(() => true);
    const { container, root } = renderBrowserTtsBtn();
    const button = container.querySelector("button");
    act(() => {
      button.click();
    });
    act(() => {
      root.render(<BrowserTtsBtn text="hello" lang="zh-CN" />);
    });
    expect(stopSpeech).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
    expect(stopSpeech).toHaveBeenCalledTimes(1);
  });

  test("does not stop another field's speech when an idle field's text changes", () => {
    speak.mockImplementation(() => true);
    // 双实例形态：A（译文）朗读中，B（原文）空闲实例 text 变化——
    // B 的清理回调必须走护栏早退，绝不误杀全局引擎里 A 的朗读。
    const speakingField = renderBrowserTtsBtn();
    const idleField = renderBrowserTtsBtn({ text: "idle text" });
    const speakingButton = speakingField.container.querySelector("button");

    act(() => {
      speakingButton.click();
    });
    act(() => {
      idleField.root.render(<BrowserTtsBtn text="changed" lang="en" />);
    });
    expect(stopSpeech).not.toHaveBeenCalled();
    expect(
      speakingField.container.querySelector("button").getAttribute("aria-busy")
    ).toBe("true");

    // B 卸载同样不触碰全局引擎；A 自己卸载才停止。
    act(() => {
      idleField.root.unmount();
    });
    expect(stopSpeech).not.toHaveBeenCalled();
    act(() => {
      speakingField.root.unmount();
    });
    expect(stopSpeech).toHaveBeenCalledTimes(1);
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
    expect(container.querySelector('[data-testid="PauseIcon"]')).not.toBeNull();
    act(() => button.click());
    expect(onPause).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});
