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
    (word, timestamp = null, phonetic = "", definition = "", examples = []) => {
      save((prev) => {
        if (!prev[word]) {
          // todo: 除 word 外，其他属性暂无传入
          const wordData = {
            createdAt: Date.now(),
            timestamp,
            phonetic,
            definition,
            examples,
          };
          // 清理空值属性
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
