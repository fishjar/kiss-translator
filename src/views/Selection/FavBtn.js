import IconButton from "@mui/material/IconButton";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFavWords } from "../../hooks/FavWords";
import { kissLog } from "../../libs/log";
import { useSetting } from "../../hooks/Setting";
import { EVENT_FAVORITE_WORD_CHANGE } from "../../config";

/**
 * Favorite word button with a heart icon.
 *
 * @param {Object} props
 * @param {string} props.word - Word to add to or remove from favorites.
 * @param {string} props.title - Hover tooltip text.
 */
export default function FavBtn({ word, title }) {
  // Read favorite words and the toggle action from useFavWords.
  const { favWords, toggleFav, mergeWords, isLoading } = useFavWords();
  const { context, setting } = useSetting();
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const autoAttempt = useRef(null);
  const isFavorite = Boolean(favWords[word]);
  const autoCollect =
    context === "tranbox" && setting?.tranboxSetting?.autoFavWord;

  // Toggle the favorite state on click.
  const saveFavorite = useCallback(
    async (collectOnly = false) => {
      if (isLoading || pending.current) return;
      pending.current = true;
      try {
        setLoading(true);
        const receipt = await (collectOnly
          ? mergeWords([word])
          : toggleFav(word));
        const isFavorite = Boolean(receipt.value[word]);
        document.dispatchEvent(
          new CustomEvent(EVENT_FAVORITE_WORD_CHANGE, {
            detail: { word, isFavorite },
          })
        );
      } catch (err) {
        kissLog("set fav", err);
      } finally {
        pending.current = false;
        setLoading(false);
      }
    },
    [mergeWords, toggleFav, word, isLoading]
  );

  useEffect(() => {
    if (!autoCollect) autoAttempt.current = null;
    if (
      !isLoading &&
      !loading &&
      !pending.current &&
      autoCollect &&
      word &&
      !favWords[word] &&
      autoAttempt.current !== word
    ) {
      // Automatic collection is additive and a failed attempt requires an explicit retry.
      autoAttempt.current = word;
      void saveFavorite(true);
    }
  }, [autoCollect, favWords, saveFavorite, word, isLoading, loading]);

  return (
    <IconButton
      disabled={loading || isLoading}
      size="small"
      onClick={() => saveFavorite()}
      title={title}
      aria-label={title}
      aria-pressed={isFavorite}
    >
      {/* Use a filled heart for favorite words and an outline otherwise. */}
      {isFavorite ? (
        <FavoriteIcon fontSize="inherit" />
      ) : (
        <FavoriteBorderIcon fontSize="inherit" />
      )}
    </IconButton>
  );
}
