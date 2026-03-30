export const CEFR_LEVEL_LABEL_KEYS = {
  0: "cefr_level_not_set",
  1: "cefr_level_a1",
  2: "cefr_level_a2",
  3: "cefr_level_b1",
  4: "cefr_level_b2",
  5: "cefr_level_c1",
  6: "cefr_level_c2",
};

export const CEFR_LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6].map((level) => ({
  level,
  labelKey: CEFR_LEVEL_LABEL_KEYS[level],
}));

export const CEFR_QUIZ_QUESTIONS = [
  {
    id: "a1_basic_be",
    level: 1,
    promptKey: "cefr_quiz_q1_prompt",
    choices: [
      { labelKey: "cefr_quiz_q1_choice_1", isCorrect: true },
      { labelKey: "cefr_quiz_q1_choice_2", isCorrect: false },
      { labelKey: "cefr_quiz_q1_choice_3", isCorrect: false },
      { labelKey: "cefr_quiz_q1_choice_4", isCorrect: false },
    ],
  },
  {
    id: "a2_past_simple",
    level: 2,
    promptKey: "cefr_quiz_q2_prompt",
    choices: [
      { labelKey: "cefr_quiz_q2_choice_1", isCorrect: false },
      { labelKey: "cefr_quiz_q2_choice_2", isCorrect: true },
      { labelKey: "cefr_quiz_q2_choice_3", isCorrect: false },
      { labelKey: "cefr_quiz_q2_choice_4", isCorrect: false },
    ],
  },
  {
    id: "b1_first_conditional",
    level: 3,
    promptKey: "cefr_quiz_q3_prompt",
    choices: [
      { labelKey: "cefr_quiz_q3_choice_1", isCorrect: true },
      { labelKey: "cefr_quiz_q3_choice_2", isCorrect: false },
      { labelKey: "cefr_quiz_q3_choice_3", isCorrect: false },
      { labelKey: "cefr_quiz_q3_choice_4", isCorrect: false },
    ],
  },
  {
    id: "b2_past_perfect",
    level: 4,
    promptKey: "cefr_quiz_q4_prompt",
    choices: [
      { labelKey: "cefr_quiz_q4_choice_1", isCorrect: false },
      { labelKey: "cefr_quiz_q4_choice_2", isCorrect: false },
      { labelKey: "cefr_quiz_q4_choice_3", isCorrect: true },
      { labelKey: "cefr_quiz_q4_choice_4", isCorrect: false },
    ],
  },
  {
    id: "c1_inversion",
    level: 5,
    promptKey: "cefr_quiz_q5_prompt",
    choices: [
      { labelKey: "cefr_quiz_q5_choice_1", isCorrect: false },
      { labelKey: "cefr_quiz_q5_choice_2", isCorrect: false },
      { labelKey: "cefr_quiz_q5_choice_3", isCorrect: true },
      { labelKey: "cefr_quiz_q5_choice_4", isCorrect: false },
    ],
  },
  {
    id: "c2_conditional_inversion",
    level: 6,
    promptKey: "cefr_quiz_q6_prompt",
    choices: [
      { labelKey: "cefr_quiz_q6_choice_1", isCorrect: true },
      { labelKey: "cefr_quiz_q6_choice_2", isCorrect: false },
      { labelKey: "cefr_quiz_q6_choice_3", isCorrect: false },
      { labelKey: "cefr_quiz_q6_choice_4", isCorrect: false },
    ],
  },
];

export function calculateQuizLevel(results = []) {
  const normalized = results.filter(
    (value) => value === true || value === false
  );
  if (normalized.length === 0) return 0;

  const firstFailedIndex = normalized.findIndex((value) => value === false);
  if (firstFailedIndex === 0) {
    return 0;
  }

  if (firstFailedIndex > 0) {
    return CEFR_QUIZ_QUESTIONS[firstFailedIndex - 1]?.level || 0;
  }

  return CEFR_QUIZ_QUESTIONS[normalized.length - 1]?.level || 0;
}

const resolveI18n = (i18n, key) => {
  if (typeof i18n !== "function") return key;
  return i18n(key, key);
};

export function getCEFRLabel(level, i18n) {
  const normalizedLevel = Number(level);
  const labelKey =
    CEFR_LEVEL_LABEL_KEYS[normalizedLevel] || CEFR_LEVEL_LABEL_KEYS[0];
  return resolveI18n(i18n, labelKey);
}

export function getLocalizedQuizQuestion(questionIndex, i18n) {
  const question = CEFR_QUIZ_QUESTIONS[questionIndex];
  if (!question) return null;

  return {
    ...question,
    prompt: resolveI18n(i18n, question.promptKey),
    choices: question.choices.map((choice) => ({
      ...choice,
      label: resolveI18n(i18n, choice.labelKey),
    })),
  };
}
