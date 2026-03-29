export const CEFR_LEVEL_LABELS = {
  0: "Not set",
  1: "A1",
  2: "A2",
  3: "B1",
  4: "B2",
  5: "C1",
  6: "C2",
};

export const CEFR_LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6].map((level) => ({
  level,
  label: CEFR_LEVEL_LABELS[level],
}));

export const CEFR_QUIZ_QUESTIONS = [
  {
    id: "everyday_conversations",
    prompt: "How well can you understand everyday conversations in English?",
    choices: [
      { label: "Only very simple words and phrases", score: 1 },
      { label: "Common daily topics", score: 2 },
      { label: "Most familiar topics", score: 3 },
      { label: "Detailed discussions in familiar contexts", score: 4 },
      { label: "Complex discussions with little effort", score: 5 },
      { label: "Almost everything, including nuanced meaning", score: 6 },
    ],
  },
  {
    id: "writing",
    prompt: "How confident are you writing messages or short essays in English?",
    choices: [
      { label: "I can write basic words and very short sentences", score: 1 },
      { label: "I can write simple daily messages", score: 2 },
      { label: "I can explain ideas in connected text", score: 3 },
      { label: "I can write clear, detailed text on many topics", score: 4 },
      { label: "I can write structured, precise arguments", score: 5 },
      { label: "I can write naturally with advanced style and nuance", score: 6 },
    ],
  },
  {
    id: "reading",
    prompt: "How comfortable are you reading news or articles on new topics?",
    choices: [
      { label: "I need a lot of help to understand", score: 1 },
      { label: "I can understand short and simple texts", score: 2 },
      { label: "I can understand most straightforward articles", score: 3 },
      { label: "I can follow detailed articles with occasional support", score: 4 },
      { label: "I can understand long and complex texts well", score: 5 },
      { label: "I can understand difficult texts with subtle meaning", score: 6 },
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

export function getCEFRLabel(level) {
  const normalizedLevel = Number(level);
  return CEFR_LEVEL_LABELS[normalizedLevel] || CEFR_LEVEL_LABELS[0];
}
