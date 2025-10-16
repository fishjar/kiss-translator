import { STOKEY_WORDS, KV_WORDS_KEY } from "../config";
import { useCallback, useMemo } from "react";
import { useStorage } from "./Storage";
import { debounceSyncMeta } from "../libs/storage";

const DEFAULT_FAVWORDS = {};

export function useFavWords() {
  const { data: favWords, save: saveWords } = useStorage(
    STOKEY_WORDS,
    DEFAULT_FAVWORDS,
    KV_WORDS_KEY
  );

  const save = useCallback(
    (objOrFn) => {
      saveWords(objOrFn);
      debounceSyncMeta(KV_WORDS_KEY);
    },
    [saveWords]
  );

  const toggleFav = useCallback(
    (word) => {
      save((prev) => {
        if (!prev[word]) {
          return { ...prev, [word]: { createdAt: Date.now() } };
        }

        const favs = { ...prev };
        delete favs[word];
        return favs;
      });
    },
    [save]
  );

  const mergeWords = useCallback(
    (words) => {
      save((prev) => ({
        ...words.reduce((acc, key) => {
          acc[key] = { createdAt: Date.now() };
          return acc;
        }, {}),
        ...prev,
      }));
    },
    [save]
  );

  const clearWords = useCallback(() => {
    save({});
  }, [save]);

  const favList = useMemo(
    () =>
      Object.entries(favWords || {}).sort((a, b) => a[0].localeCompare(b[0])),
    [favWords]
  );

  const wordList = useMemo(() => favList.map(([word]) => word), [favList]);

  return { favWords, favList, wordList, toggleFav, mergeWords, clearWords };
}
