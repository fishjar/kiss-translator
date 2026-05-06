import { STOKEY_WORDS, KV_WORDS_KEY } from "../config";
import { useCallback, useMemo } from "react";
import { useStorage } from "./Storage";
import { debounceSyncMeta } from "../libs/storage";

const DEFAULT_FAVWORDS = {};

export const WORD_TYPE_FAVORITE = "favorite";
export const WORD_TYPE_NO_TRANSLATE = "no_translate";
export const WORD_TYPE_CUSTOM_TRANSLATE = "custom_translate";

export const WORD_TYPES = [
  WORD_TYPE_FAVORITE,
  WORD_TYPE_NO_TRANSLATE,
  WORD_TYPE_CUSTOM_TRANSLATE,
];

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

  const addWord = useCallback(
    (word, data = {}) => {
      save((prev) => {
        const wordData = {
          createdAt: Date.now(),
          type: WORD_TYPE_FAVORITE,
          ...data,
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
        return { ...prev, [word]: wordData };
      });
    },
    [save]
  );

  const toggleFav = useCallback(
    (word, timestamp = null, phonetic = "", definition = "", examples = []) => {
      save((prev) => {
        if (!prev[word]) {
          const wordData = {
            createdAt: Date.now(),
            type: WORD_TYPE_FAVORITE,
            timestamp,
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
          return { ...prev, [word]: wordData };
        }

        const favs = { ...prev };
        delete favs[word];
        return favs;
      });
    },
    [save]
  );

  const updateWord = useCallback(
    (word, updates) => {
      save((prev) => {
        if (!prev[word]) {
          return prev;
        }
        return {
          ...prev,
          [word]: {
            ...prev[word],
            ...updates,
            updatedAt: Date.now(),
          },
        };
      });
    },
    [save]
  );

  const setWordType = useCallback(
    (word, type, customTranslation = "") => {
      const updates = { type };
      if (type === WORD_TYPE_CUSTOM_TRANSLATE && customTranslation) {
        updates.customTranslation = customTranslation;
      }
      updateWord(word, updates);
    },
    [updateWord]
  );

  const removeWord = useCallback(
    (word) => {
      save((prev) => {
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
          acc[key] = { createdAt: Date.now(), type: WORD_TYPE_FAVORITE };
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

  const getNoTranslateWords = useCallback(() => {
    return Object.entries(favWords || {})
      .filter(([, data]) => data.type === WORD_TYPE_NO_TRANSLATE)
      .map(([word]) => word);
  }, [favWords]);

  const getCustomTranslateMap = useCallback(() => {
    const map = {};
    Object.entries(favWords || {}).forEach(([word, data]) => {
      if (data.type === WORD_TYPE_CUSTOM_TRANSLATE && data.customTranslation) {
        map[word] = data.customTranslation;
      }
    });
    return map;
  }, [favWords]);

  const favList = useMemo(
    () =>
      Object.entries(favWords || {}).sort((a, b) => a[0].localeCompare(b[0])),
    [favWords]
  );

  const wordList = useMemo(() => favList.map(([word]) => word), [favList]);

  const favoriteList = useMemo(
    () =>
      favList.filter(
        ([, data]) =>
          !data.type || data.type === WORD_TYPE_FAVORITE || data.type === undefined
      ),
    [favList]
  );

  const noTranslateList = useMemo(
    () => favList.filter(([, data]) => data.type === WORD_TYPE_NO_TRANSLATE),
    [favList]
  );

  const customTranslateList = useMemo(
    () => favList.filter(([, data]) => data.type === WORD_TYPE_CUSTOM_TRANSLATE),
    [favList]
  );

  return {
    favWords,
    favList,
    wordList,
    favoriteList,
    noTranslateList,
    customTranslateList,
    addWord,
    toggleFav,
    updateWord,
    setWordType,
    removeWord,
    mergeWords,
    clearWords,
    getNoTranslateWords,
    getCustomTranslateMap,
    WORD_TYPE_FAVORITE,
    WORD_TYPE_NO_TRANSLATE,
    WORD_TYPE_CUSTOM_TRANSLATE,
  };
}
