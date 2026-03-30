import {
  CEFR_QUIZ_QUESTIONS,
  CEFR_LEVEL_LABEL_KEYS,
  calculateQuizLevel,
  getCEFRLabel,
} from "./cefrQuiz";

describe("cefrQuiz", () => {
  test("uses one checkpoint question per CEFR level", () => {
    expect(CEFR_QUIZ_QUESTIONS).toHaveLength(6);
  });

  test("maps checkpoint quiz answers to the highest confirmed CEFR level", () => {
    expect(calculateQuizLevel([false])).toBe(0);
    expect(calculateQuizLevel([true, false])).toBe(1);
    expect(calculateQuizLevel([true, true, true, false])).toBe(3);
    expect(calculateQuizLevel([true, true, true, true, true, true])).toBe(6);
  });

  test("stores quiz copy as i18n keys", () => {
    expect(CEFR_QUIZ_QUESTIONS[0]).toHaveProperty("promptKey");
    expect(CEFR_QUIZ_QUESTIONS[0].choices[0]).toHaveProperty("labelKey");
    expect(CEFR_QUIZ_QUESTIONS[0]).not.toHaveProperty("prompt");
    expect(CEFR_QUIZ_QUESTIONS[0].choices[0]).not.toHaveProperty("label");
  });

  test("maps CEFR numeric levels to i18n-backed labels", () => {
    const mockI18nMap = {
      cefr_level_not_set: "Not set",
      cefr_level_a1: "A1",
      cefr_level_a2: "A2",
      cefr_level_b1: "B1",
      cefr_level_b2: "B2",
      cefr_level_c1: "C1",
      cefr_level_c2: "C2",
    };
    const i18n = (key) => mockI18nMap[key] || key;

    expect(CEFR_LEVEL_LABEL_KEYS[0]).toBe("cefr_level_not_set");
    expect(getCEFRLabel(0, i18n)).toBe("Not set");
    expect(getCEFRLabel(1, i18n)).toBe("A1");
    expect(getCEFRLabel(2, i18n)).toBe("A2");
    expect(getCEFRLabel(3, i18n)).toBe("B1");
    expect(getCEFRLabel(4, i18n)).toBe("B2");
    expect(getCEFRLabel(5, i18n)).toBe("C1");
    expect(getCEFRLabel(6, i18n)).toBe("C2");
    expect(getCEFRLabel(999, i18n)).toBe("Not set");
  });
});
