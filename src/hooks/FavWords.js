import { KV_WORDS_KEY } from "../config";
import { useCallback, useEffect, useState } from "react";
import { trySyncWords } from "../libs/sync";
import { getWordsWithDefault, setWords } from "../libs/storage";
import { useSyncMeta } from "./Sync";

export function useFavWords() {
  const [loading, setLoading] = useState(false);
  const [favWords, setFavWords] = useState({});
  const { updateSyncMeta } = useSyncMeta();

  const toggleFav = useCallback(
    async (word) => {
      const favs = { ...favWords };
      if (favs[word]) {
        delete favs[word];
      } else {
        favs[word] = { createdAt: Date.now() };
      }
      await setWords(favs);
      await updateSyncMeta(KV_WORDS_KEY);
      await trySyncWords();
      setFavWords(favs);
    },
    [updateSyncMeta, favWords]
  );

  const mergeWords = useCallback(
    async (newWords) => {
      const favs = { ...favWords };
      newWords.forEach((word) => {
        if (!favs[word]) {
          favs[word] = { createdAt: Date.now() };
        }
      });
      await setWords(favs);
      await updateSyncMeta(KV_WORDS_KEY);
      await trySyncWords();
      setFavWords(favs);
    },
    [updateSyncMeta, favWords]
  );

  const clearWords = useCallback(async () => {
    await setWords({});
    await updateSyncMeta(KV_WORDS_KEY);
    await trySyncWords();
    setFavWords({});
  }, [updateSyncMeta]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await trySyncWords();
        const favWords = await getWordsWithDefault();
        setFavWords(favWords);
      } catch (err) {
        console.log("[query fav]", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { loading, favWords, toggleFav, mergeWords, clearWords };
}
