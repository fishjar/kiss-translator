import { KV_WORDS_KEY } from "../config";
import {
  debounceSyncMeta,
  getWordsWithDefault,
  setWords,
} from "../libs/storage";

function createWordData({ phonetic, definition, examples }) {
  const wordData = {
    createdAt: Date.now(),
    phonetic,
    definition,
    examples,
  };

  Object.keys(wordData).forEach((key) => {
    if (
      wordData[key] === null ||
      wordData[key] === undefined ||
      (Array.isArray(wordData[key]) && wordData[key].length === 0) ||
      (typeof wordData[key] === "string" && wordData[key].length === 0)
    ) {
      delete wordData[key];
    }
  });

  return wordData;
}

async function saveWords(words) {
  await setWords(words);
  debounceSyncMeta(KV_WORDS_KEY);
}

export async function isFavoriteWord(word) {
  const words = await getWordsWithDefault();
  return Boolean(words[word]);
}

export async function saveFavoriteWordIfMissing(word, data = {}) {
  const words = await getWordsWithDefault();
  if (words[word]) return false;

  await saveWords({ ...words, [word]: createWordData(data) });
  return true;
}

export async function toggleFavoriteWord(word, data = {}) {
  const words = await getWordsWithDefault();
  if (words[word]) {
    const nextWords = { ...words };
    delete nextWords[word];
    await saveWords(nextWords);
    return false;
  }

  await saveWords({ ...words, [word]: createWordData(data) });
  return true;
}

export function createFavoriteButton({ word, data, i18n = () => "" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "kiss-favorite-word-button";
  button.style.cssText = `background: none; border: none; color: inherit; cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 4px;`;

  const label = i18n("collect") || "Favorite";
  const render = (isFavorite) => {
    button.textContent = String.fromCodePoint(isFavorite ? 0x2665 : 0x2661);
    button.setAttribute("aria-pressed", String(isFavorite));
    button.setAttribute("aria-label", label);
    button.title = label;
  };

  let hasUserToggled = false;
  const refresh = async () => {
    const isFavorite = await isFavoriteWord(word);
    if (!hasUserToggled) render(isFavorite);
  };
  refresh();

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    hasUserToggled = true;
    button.disabled = true;
    try {
      render(await toggleFavoriteWord(word, data));
    } finally {
      button.disabled = false;
    }
  });

  return button;
}
