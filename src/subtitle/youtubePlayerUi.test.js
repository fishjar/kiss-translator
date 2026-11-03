import DomManager from "../libs/domManager.js";
import { YouTubePlayerUi } from "./youtubePlayerUi.js";

const mockDestroy = jest.fn();
const mockHide = jest.fn();
const mockShow = jest.fn();
const mockUpdateProps = jest.fn();

jest.mock("../libs/domManager.js", () => jest.fn());

jest.mock("../config", () => ({
  APP_NAME: "Kiss Translator",
}));

jest.mock("../libs/svg.js", () => ({
  createLogoSVG: ({ isSelected } = {}) => {
    const el = global.document.createElement("span");
    el.dataset.selected = isSelected ? "true" : "false";
    return el;
  },
}));

jest.mock("./Menus.js", () => ({
  Menus: () => null,
}));

describe("YouTubePlayerUi", () => {
  let setting;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    DomManager.mockImplementation(() => ({
      destroy: mockDestroy,
      hide: mockHide,
      show: mockShow,
      updateProps: mockUpdateProps,
    }));
    document.body.innerHTML = "";
    setting = { hideSubtitleButton: false, showLoadNotification: true };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function createUi(videoEl = null) {
    return new YouTubePlayerUi({
      getSetting: () => setting,
      getMenuProps: () => ({ progressed: 0 }),
      getVideoEl: () => videoEl,
    });
  }

  test("ASR only shows deduplicated milestone toasts; detailed progress and errors stay off the video", () => {
    document.body.innerHTML =
      '<div class="html5-video-player"><div><video></video></div></div>';
    const ui = createUi(document.querySelector("video"));
    const t = (key) => key;
    ui.updateAsrFeedback({ phase: "waiting", feedbackSession: 1 }, t);
    const toast = document.querySelector(".kiss-notification");
    expect(toast.textContent).toBe("youtube_asr_started");
    jest.advanceTimersByTime(2000);
    for (const state of [
      { phase: "waiting", waitReason: "NEED_PLAYBACK" },
      { phase: "recognizing", recognition: { percent: 30 } },
      { phase: "error", error: "AUDIO_CAPTURE_MISSING" },
    ])
      ui.updateAsrFeedback({ ...state, feedbackSession: 1 }, t);
    expect(toast.style.opacity).toBe("0");
    expect(document.querySelector(".kiss-task-progress").hidden).toBe(true);
    ui.updateAsrFeedback({ phase: "complete", feedbackSession: 1 }, t);
    expect(toast.textContent).toBe("youtube_asr_complete");
    jest.advanceTimersByTime(2000);
    ui.updateAsrFeedback({ phase: "complete", feedbackSession: 1 }, t);
    expect(toast.style.opacity).toBe("0");
    ui.updateAsrFeedback({ phase: "off" }, t);
    expect(toast.textContent).toBe("youtube_asr_task_stopped");
    jest.advanceTimersByTime(2000);
    ui.updateAsrFeedback({ phase: "off" }, t);
    expect(toast.style.opacity).toBe("0");
    ui.removeToggleButton();
  });

  test("identical top progress updates do not mutate DOM under real observers", async () => {
    jest.useRealTimers();
    document.body.innerHTML =
      '<div class="html5-video-player"><div><video></video></div></div>';
    const ui = createUi(document.querySelector("video"));
    const state = { phase: "waiting" },
      t = (key) => key;
    let callbacks = 0;
    const observer = new MutationObserver(() => {
      if (++callbacks > 20) {
        observer.disconnect();
        return;
      }
      ui.updateAsrFeedback(state, t);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    ui.updateAsrFeedback(state, t);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callbacks).toBeLessThan(5);
    ui.resetTaskFeedback();
    observer.disconnect();
    ui.removeToggleButton();
    jest.useFakeTimers();
  });

  test("removes and reinjects the subtitle toggle button", () => {
    document.body.innerHTML = '<div class="ytp-right-controls"></div>';
    const controls = document.querySelector(".ytp-right-controls");
    const ui = createUi();

    ui.injectToggleButton(controls);
    expect(document.querySelector(".kiss-subtitle-button")).not.toBeNull();

    setting.hideSubtitleButton = true;
    ui.removeToggleButton();
    expect(document.querySelector(".kiss-subtitle-button")).toBeNull();
    expect(mockDestroy).toHaveBeenCalledTimes(1);

    setting.hideSubtitleButton = false;
    ui.injectToggleButton(controls);
    expect(document.querySelector(".kiss-subtitle-button")).not.toBeNull();
  });

  test("hides notification when loading notification setting is disabled", () => {
    document.body.innerHTML = "<div><div><video></video></div></div>";
    const videoEl = document.querySelector("video");
    const ui = createUi(videoEl);

    ui.showNotification("loading");
    const notification = document.querySelector(".kiss-notification");
    expect(notification.textContent).toBe("loading");
    expect(notification.style.opacity).toBe("1");

    setting.showLoadNotification = false;
    ui.showNotification("hidden");
    expect(notification.style.opacity).toBe("0");
  });
  test("repeated visible notifications neither mutate content nor extend their deadline", async () => {
    document.body.innerHTML = "<div><div><video></video></div></div>";
    const ui = createUi(document.querySelector("video"));
    ui.showNotification("waiting", 2000);
    const notification = document.querySelector(".kiss-notification");
    const observer = new MutationObserver(() => {});
    observer.observe(notification, { childList: true });
    jest.advanceTimersByTime(1000);
    ui.showNotification("waiting", 2000);
    expect(observer.takeRecords()).toHaveLength(0);
    jest.advanceTimersByTime(1000);
    expect(notification.style.opacity).toBe("0");
    ui.showNotification("waiting", 2000);
    expect(notification.style.opacity).toBe("1");
    expect(observer.takeRecords()).toHaveLength(0);
    ui.showNotification("new result", 2000);
    expect(notification.textContent).toBe("new result");
    expect(observer.takeRecords().length).toBeGreaterThan(0);
    observer.disconnect();
    ui.hideNotification();
  });

  test("real DOM observers cannot turn identical waiting notifications into a microtask loop", async () => {
    jest.useRealTimers();
    document.body.innerHTML = "<div><div><video></video></div></div>";
    const ui = createUi(document.querySelector("video"));
    let callbacks = 0,
      stoppedByGuard = false;
    const observer = new MutationObserver(() => {
      if (++callbacks >= 25) {
        stoppedByGuard = true;
        observer.disconnect();
        return;
      }
      queueMicrotask(() => ui.showNotification("waiting"));
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    try {
      ui.showNotification("waiting");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(stoppedByGuard).toBe(false);
      expect(callbacks).toBeLessThan(3);
    } finally {
      observer.disconnect();
      ui.hideNotification();
      jest.useFakeTimers();
    }
  });
});
