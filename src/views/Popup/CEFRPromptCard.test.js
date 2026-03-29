import { createRoot } from "react-dom/client";
import { act } from "react";
import CEFRPromptCard from "./CEFRPromptCard";

const mockI18nMap = {
  cefr_prompt_incomplete_title: "Quick CEFR setup",
  cefr_prompt_incomplete_desc: "Finish a short quiz to personalize words.",
  cefr_prompt_incomplete_cta: "Take quick quiz",
  cefr_prompt_configured_title: "CEFR level ready",
  cefr_prompt_configured_cta: "Retake or adjust",
  cefr_current_level: "Current level",
  cefr_level_c1: "C1 localized",
  cefr_level_not_set: "Not set localized",
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback = "") => mockI18nMap[key] || fallback || key,
}));

function renderUI(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CEFRPromptCard {...props} />);
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

describe("CEFRPromptCard", () => {
  test("shows CTA when assessment is incomplete", () => {
    const onOpenCEFR = jest.fn();
    const { container, unmount } = renderUI({
      cefrSetting: {
        enabled: false,
        level: 0,
        assessmentCompleted: false,
      },
      onOpenCEFR,
    });

    expect(container.textContent).toContain("Quick CEFR setup");

    act(() => {
      container
        .querySelector("button")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenCEFR).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("shows current level and retake/adjust entry when assessment is complete", () => {
    const { container, unmount } = renderUI({
      cefrSetting: {
        enabled: true,
        level: 5,
        assessmentCompleted: true,
      },
      onOpenCEFR: jest.fn(),
    });

    expect(container.textContent).toContain("CEFR level ready");
    expect(container.textContent).toContain("Current level: C1 localized");
    expect(container.textContent).toContain("Retake or adjust");

    unmount();
  });
});
