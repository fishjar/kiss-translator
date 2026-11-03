import { STOKEY_WORDS, KV_WORDS_KEY } from "../config";
import { useCallback, useMemo } from "react";
import { useStorage } from "./Storage";

const DEFAULT_FAVWORDS = {};

function normalizeSource(source) {
  if (!source || typeof source !== "object") return undefined;

  const sentence =
    typeof source.sentence === "string"
      ? source.sentence.trim().slice(0, 1000)
      : "";
  const url = typeof source.url === "string" ? source.url.trim() : "";
  if (!sentence && !url) return undefined;

  return {
    ...(sentence ? { sentence } : {}),
    ...(url ? { url } : {}),
  };
}

/** Manage favorite words with replayable storage mutations. */
export function useFavWords() {
  const {
    data: favWords,
    save,
    isLoading,
  } = useStorage(STOKEY_WORDS, DEFAULT_FAVWORDS, KV_WORDS_KEY);

  /**
   * Toggle a favorite using metadata captured once for this user action.
   */
  const toggleFav = useCallback(
    (
      word,
      timestamp = null,
      phonetic = "",
      definition = "",
      examples = [],
      source = null
    ) => {
      const normalizedSource = normalizeSource(source);
      const wordData = {
        createdAt: Date.now(),
        timestamp,
        phonetic,
        definition,
        examples: Array.isArray(examples) ? [...examples] : examples,
        ...(normalizedSource ? { source: normalizedSource } : {}),
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
      return save((prev) => {
        if (!prev[word]) {
          return { ...prev, [word]: wordData };
        }

        const favs = { ...prev };
        delete favs[word];
        return favs;
      });
    },
    [save]
  );

  /** Merge new words while preserving metadata for existing favorites. */
  const mergeWords = useCallback(
    (words, metadata = {}) => {
      const createdAt = Date.now();
      const normalizedSource = normalizeSource(metadata?.source);
      const additions = Object.fromEntries(
        words.map((word) => [
          word,
          {
            createdAt,
            ...(normalizedSource ? { source: normalizedSource } : {}),
          },
        ])
      );
      return save((prev) => ({ ...additions, ...prev }));
    },
    [save]
  );

  const clearWords = useCallback(() => save({}), [save]);

  const favList = useMemo(
    () =>
      Object.entries(favWords || {}).sort((a, b) => a[0].localeCompare(b[0])),
    [favWords]
  );

  const wordList = useMemo(() => favList.map(([word]) => word), [favList]);

  return {
    favWords,
    favList,
    wordList,
    toggleFav,
    mergeWords,
    clearWords,
    isLoading,
  };
}
