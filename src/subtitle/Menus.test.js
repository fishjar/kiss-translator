import { act } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SUBTITLE_SETTING } from "../config";
import { Menus } from "./Menus";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderMenus({
  apiSlug = "api-a",
  autoTranslate = true,
  updateSetting = jest.fn(),
  transApis = [],
  ...props
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <Menus
        i18n={(key) => key}
        formData={{
          apiSlug,
          segSlug: "-",
          skipAd: false,
          isBilingual: true,
          blurTranslation: false,
          autoTranslate,
          aiContextSlug: "-",
        }}
        updateSetting={updateSetting}
        downloadSubtitle={jest.fn()}
        transApis={transApis}
        {...props}
      />
    );
  });

  return {
    container,
    updateSetting,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("subtitle Menus", () => {
  test.each([true, false])(
    "ASR and translation switches share row styling when autoTranslate=%s",
    (autoTranslate) => {
      const view = renderMenus({
        autoTranslate,
        asr: { active: false, available: true },
        asrActions: {},
      });
      const buttons = [...view.container.querySelectorAll('[role="button"]')];
      const translation = buttons.find(
        (item) => item.textContent === "enable_subtitle_translate"
      );
      const asr = buttons.find(
        (item) => item.textContent === "youtube_asr_start"
      );
      expect(asr.parentElement).toBe(translation.parentElement);
      for (const key of ["display", "padding", "justifyContent", "alignItems"])
        expect(asr.style[key]).toBe(translation.style[key]);
      const track = (row) => row.querySelector('div[style*="width: 40px"]');
      for (const key of ["width", "height", "borderRadius"])
        expect(track(asr).style[key]).toBe(track(translation).style[key]);
      expect(asr.getAttribute("aria-disabled")).toBe(String(!autoTranslate));
      view.cleanup();
    }
  );
  test("audio-block results disable segmentation without putting guidance in the menu", () => {
    const view = renderMenus({
      transApis: [{ apiSlug: "ai", apiName: "AI", apiType: "OpenAI" }],
      formData: {
        segSlug: "ai",
        apiSlug: "ai",
        autoTranslate: true,
        aiContextSlug: "ai",
      },
      asr: {
        available: true,
        active: true,
        phase: "complete",
        timingSource: "audio-chunk",
      },
      asrActions: {},
    });
    const controls = [...view.container.querySelectorAll('[role="button"]')];
    const segmentation = controls.find((item) =>
      item.textContent.startsWith("ai_segmentation")
    );
    expect(segmentation.getAttribute("aria-disabled")).toBe("true");
    expect(segmentation.textContent).toContain("AI");
    act(() => segmentation.click());
    expect(view.updateSetting).not.toHaveBeenCalled();
    expect(view.container.textContent).not.toContain(
      "youtube_asr_chunk_timing_hint"
    );
    view.cleanup();
  });
  test("unconfigured ASR keeps only the disabled toggle", () => {
    const start = jest.fn(),
      configure = jest.fn();
    const view = renderMenus({
      asr: { available: false, active: false },
      asrActions: { start, configure },
    });
    const button = (text) =>
      [...view.container.querySelectorAll('[role="button"]')].find(
        (item) => item.textContent === text
      );
    expect(button("youtube_asr_start").getAttribute("aria-disabled")).toBe(
      "true"
    );
    expect(view.container.textContent).not.toContain(
      "youtube_asr_setup_required"
    );
    act(() => button("youtube_asr_start").click());
    expect(start).not.toHaveBeenCalled();
    expect(button("youtube_asr_configure")).toBeUndefined();
    expect(configure).not.toHaveBeenCalled();
    view.cleanup();
  });
  test.each([false, true])(
    "configured ASR toggle switches the current video when active=%s",
    (active) => {
      const start = jest.fn(),
        stop = jest.fn();
      const view = renderMenus({
        asr: { available: true, active, phase: "cached" },
        asrActions: { start, stop },
      });
      const toggle = [
        ...view.container.querySelectorAll('[role="button"]'),
      ].find((item) => item.textContent === "youtube_asr_start");
      act(() => toggle.click());
      expect(active ? stop : start).toHaveBeenCalledTimes(1);
      view.cleanup();
    }
  );
  test("ASR removes cache deletion, status and recovery controls", () => {
    const retryRecognition = jest.fn(),
      retryTranslation = jest.fn();
    const view = renderMenus({
      acquisition: { phase: "error" },
      asr: {
        available: true,
        active: true,
        phase: "partial",
        recognitionError: "ASR_FAILED",
        translationError: "TRANSLATION_FAILED",
        audio: { phase: "missing" },
        recognition: { percent: 50, samples: 16000, totalSamples: 32000 },
        translation: { percent: 25, samples: 8000, totalSamples: 32000 },
      },
      asrActions: {
        stop: jest.fn(),
        retryRecognition,
        retryTranslation,
        reRecognize: jest.fn(),
        deleteCache: jest.fn(),
      },
    });
    const button = (label) =>
      [...view.container.querySelectorAll('[role="button"]')].find(
        (item) => item.textContent === label
      );
    expect(view.container.textContent).not.toMatch(/50%|25%/);
    for (const key of [
      "youtube_caption_retry",
      "youtube_asr_retry",
      "youtube_caption_retry_translation",
      "youtube_asr_redo",
      "youtube_asr_save",
      "youtube_asr_delete",
    ])
      expect(button(key)).toBeUndefined();
    expect(retryRecognition).not.toHaveBeenCalled();
    expect(retryTranslation).not.toHaveBeenCalled();
    view.cleanup();
  });
  test("keeps immediate translation enabled by default", () => {
    expect(DEFAULT_SUBTITLE_SETTING.autoTranslate).toBe(true);
  });

  test("keeps automatic subtitle word favorites disabled by default", () => {
    expect(DEFAULT_SUBTITLE_SETTING.autoFavWord).toBe(false);
  });

  test("renders translation first and updates the current video state", () => {
    const view = renderMenus({ autoTranslate: false });
    const label = Array.from(view.container.querySelectorAll("div")).find(
      (element) =>
        element.textContent === "enable_subtitle_translate" &&
        element.children.length === 0
    );

    expect(
      view.container.textContent.startsWith("enable_subtitle_translate")
    ).toBe(true);

    act(() => {
      label.parentElement.click();
    });

    expect(view.updateSetting).toHaveBeenCalledWith({
      name: "autoTranslate",
      value: true,
    });
    view.cleanup();
  });

  test("renders enabled translation services immediately after the toggle", () => {
    const view = renderMenus({
      transApis: [
        { apiSlug: "api-a", apiName: "API A", apiType: "builtin" },
        { apiSlug: "api-b", apiName: "API B", apiType: "builtin" },
        {
          apiSlug: "api-disabled",
          apiName: "Disabled API",
          apiType: "builtin",
          isDisabled: true,
        },
      ],
    });
    const menuItems = view.container.firstElementChild.children;

    expect(menuItems[0].textContent).toContain("enable_subtitle_translate");
    expect(menuItems[1].textContent).toContain("translate_service");
    expect(menuItems[2].textContent).toContain("ai_segmentation");

    act(() => {
      menuItems[1].firstElementChild.click();
    });

    expect(view.container.textContent).toContain("API A");
    expect(view.container.textContent).toContain("API B");
    expect(view.container.textContent).not.toContain("Disabled API");

    const apiBOption = Array.from(view.container.querySelectorAll("div")).find(
      (element) =>
        element.textContent === "API B" && element.children.length === 0
    );
    act(() => {
      apiBOption.click();
    });

    expect(view.updateSetting).toHaveBeenCalledWith({
      name: "apiSlug",
      value: "api-b",
    });
    view.cleanup();
  });

  test("disables translation service selection when no API is enabled", () => {
    const view = renderMenus({
      transApis: [
        {
          apiSlug: "api-disabled",
          apiName: "Disabled API",
          apiType: "builtin",
          isDisabled: true,
        },
      ],
    });
    const serviceMenuItem = view.container.firstElementChild.children[1];

    act(() => {
      serviceMenuItem.firstElementChild.click();
    });

    expect(view.container.textContent).not.toContain("Disabled API");
    expect(view.updateSetting).not.toHaveBeenCalled();
    view.cleanup();
  });
});

describe("subtitle acquisition menu", () => {
  test("separates acquisition, processing and download states", () => {
    const view = renderMenus({
      acquisition: {
        phase: "ready",
        track: { languageCode: "en", kind: "asr" },
      },
      progressed: 45,
      canDownload: true,
    });
    expect(view.container.textContent).not.toContain(
      "youtube_caption_generated"
    );
    expect(view.container.textContent).not.toContain("45%");
    expect(view.container.textContent).toContain(
      "youtube_caption_download_partial"
    );
    expect(view.container.textContent).not.toContain("[45%]");
    view.cleanup();
  });

  test("recovery buttons and cooldown status are absent; Escape and disabled downloads remain accessible", () => {
    const onClose = jest.fn();
    const view = renderMenus({
      acquisition: {
        phase: "error",
        code: "RATE_LIMITED",
        cooldownUntil: Date.now() + 2000,
      },
      translationError: true,
      onClose,
    });
    expect(view.container.querySelector('[role="status"]')).toBeNull();
    expect(view.container.textContent).not.toMatch(/retry|rate_limited|2s/);
    const download = [
      ...view.container.querySelectorAll('[role="button"]'),
    ].find((b) => b.textContent === "download_subtitles");
    expect(download.getAttribute("aria-disabled")).toBe("true");
    act(() =>
      download.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    view.cleanup();
  });
});
