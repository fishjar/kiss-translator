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
    id: "everyday_conversations",
    promptKey: "cefr_quiz_q1_prompt",
    choices: [
      { labelKey: "cefr_quiz_q1_choice_1", score: 1 },
      { labelKey: "cefr_quiz_q1_choice_2", score: 2 },
      { labelKey: "cefr_quiz_q1_choice_3", score: 3 },
      { labelKey: "cefr_quiz_q1_choice_4", score: 4 },
      { labelKey: "cefr_quiz_q1_choice_5", score: 5 },
      { labelKey: "cefr_quiz_q1_choice_6", score: 6 },
    ],
  },
  {
    id: "writing",
    promptKey: "cefr_quiz_q2_prompt",
    choices: [
      { labelKey: "cefr_quiz_q2_choice_1", score: 1 },
      { labelKey: "cefr_quiz_q2_choice_2", score: 2 },
      { labelKey: "cefr_quiz_q2_choice_3", score: 3 },
      { labelKey: "cefr_quiz_q2_choice_4", score: 4 },
      { labelKey: "cefr_quiz_q2_choice_5", score: 5 },
      { labelKey: "cefr_quiz_q2_choice_6", score: 6 },
    ],
  },
  {
    id: "reading",
    promptKey: "cefr_quiz_q3_prompt",
    choices: [
      { labelKey: "cefr_quiz_q3_choice_1", score: 1 },
      { labelKey: "cefr_quiz_q3_choice_2", score: 2 },
      { labelKey: "cefr_quiz_q3_choice_3", score: 3 },
      { labelKey: "cefr_quiz_q3_choice_4", score: 4 },
      { labelKey: "cefr_quiz_q3_choice_5", score: 5 },
      { labelKey: "cefr_quiz_q3_choice_6", score: 6 },
    ],
  },
];

const normalizeScore = (score) => {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return Math.max(1, Math.min(6, Math.round(value)));
};

export function calculateQuizLevel(scores = []) {
  const normalized = scores.map(normalizeScore).filter((value) => value > 0);
  if (normalized.length === 0) return 0;

  const average =
    normalized.reduce((total, value) => total + value, 0) / normalized.length;
  return normalizeScore(average);
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
