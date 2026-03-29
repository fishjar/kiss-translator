import {
  CEFR_QUIZ_QUESTIONS,
  calculateQuizLevel,
  getCEFRLabel,
} from "./cefrQuiz";

describe("cefrQuiz", () => {
  test("keeps the assessment lightweight", () => {
    expect(CEFR_QUIZ_QUESTIONS).toHaveLength(3);
  });

  test("maps short-quiz answers to CEFR levels", () => {
    expect(calculateQuizLevel([1, 1, 1])).toBe(1);
    expect(calculateQuizLevel([3, 3, 3])).toBe(3);
    expect(calculateQuizLevel([6, 6, 6])).toBe(6);
  });

  test("maps CEFR numeric levels to labels", () => {
    expect(getCEFRLabel(0)).toBe("Not set");
    expect(getCEFRLabel(1)).toBe("A1");
    expect(getCEFRLabel(2)).toBe("A2");
    expect(getCEFRLabel(3)).toBe("B1");
    expect(getCEFRLabel(4)).toBe("B2");
    expect(getCEFRLabel(5)).toBe("C1");
    expect(getCEFRLabel(6)).toBe("C2");
  });
});
