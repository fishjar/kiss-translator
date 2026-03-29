import { createRoot } from "react-dom/client";
import { act } from "react";
import CEFRSetting from "./CEFRSetting";

const mockI18nMap = {
  cefr_setting_title: "CEFR onboarding",
  cefr_onboarding_title: "Quick CEFR check",
  cefr_onboarding_desc: "Take a short quiz to set your level.",
  cefr_start_quiz: "Start quick quiz",
  cefr_quiz_restart: "Retake quick quiz",
  cefr_configured_title: "CEFR is configured",
  cefr_current_level: "Current level",
  cefr_manual_adjust_label: "Adjust manually",
  cefr_quiz_progress: "Question",
  cefr_apply_level: "Apply level",
  cefr_quiz_q1_prompt: "Localized quiz prompt 1",
  cefr_quiz_q1_choice_1: "Localized quiz choice 1",
  cefr_level_b2: "B2",
  cefr_level_c1: "C1",
};

const mockUseSetting = jest.fn();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => mockUseSetting(),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback = "") => mockI18nMap[key] || fallback || key,
}));

function renderUI() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CEFRSetting />);
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

describe("CEFRSetting", () => {
  beforeEach(() => {
    mockUseSetting.mockReset();
  });

  test("shows onboarding before assessment is completed and can start quiz", () => {
    mockUseSetting.mockReturnValue({
      setting: {
        cefrSetting: {
          enabled: false,
          level: 0,
          assessmentCompleted: false,
          levelSource: "unset",
          lastPromptFrom: "",
        },
      },
      updateSetting: jest.fn(),
    });

    const { container, unmount } = renderUI();

    expect(container.textContent).toContain("Quick CEFR check");

    act(() => {
      container
        .querySelector("button")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Question");
    expect(container.textContent).toContain("Localized quiz prompt 1");
    expect(container.textContent).toContain("Localized quiz choice 1");
    unmount();
  });

  test("shows configured state after assessment and supports manual adjustment", () => {
    const updateSetting = jest.fn();
    mockUseSetting.mockReturnValue({
      setting: {
        cefrSetting: {
          enabled: true,
          level: 4,
          assessmentCompleted: true,
          levelSource: "quiz",
          lastPromptFrom: "",
        },
      },
      updateSetting,
    });

    const { container, unmount } = renderUI();

    expect(container.textContent).toContain("CEFR is configured");
    expect(container.textContent).toContain("B2");

    const c1Button = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "C1"
    );
    expect(c1Button).toBeTruthy();

    act(() => {
      c1Button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith(
      expect.objectContaining({
        cefrSetting: expect.objectContaining({
          level: 5,
          assessmentCompleted: true,
          levelSource: "manual",
        }),
      })
    );

    unmount();
  });
});
