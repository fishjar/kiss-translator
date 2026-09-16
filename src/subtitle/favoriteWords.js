import { EVENT_FAVORITE_WORD_CHANGE, STOKEY_WORDS } from "../config";
import { getWordsWithDefault, saveEdit } from "../libs/storage";

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

function notifyFavoriteWordChange(word, isFavorite) {
  document.dispatchEvent(
    new CustomEvent(EVENT_FAVORITE_WORD_CHANGE, {
      detail: { word, isFavorite },
    })
  );
}

export async function isFavoriteWord(word) {
  const words = await getWordsWithDefault();
  return Boolean(words[word]);
}

export async function saveFavoriteWordIfMissing(word, data = {}) {
  const wordData = createWordData(data);
  const { changed } = await saveEdit(STOKEY_WORDS, (words) =>
    words[word] ? words : { ...words, [word]: wordData }
  );
  if (!changed) return false;
  notifyFavoriteWordChange(word, true);
  return true;
}

export async function toggleFavoriteWord(word, data = {}) {
  const wordData = createWordData(data);
  const { value } = await saveEdit(STOKEY_WORDS, (words) => {
    if (!words[word]) return { ...words, [word]: wordData };
    const nextWords = { ...words };
    delete nextWords[word];
    return nextWords;
  });
  const isFavorite = Boolean(value[word]);
  notifyFavoriteWordChange(word, isFavorite);
  return isFavorite;
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
