import IconButton from "@mui/material/IconButton";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useCallback, useEffect, useState } from "react";
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
  const { favWords, toggleFav } = useFavWords();
  const { context, setting } = useSetting();
  const [loading, setLoading] = useState(false);
  const isFavorite = Boolean(favWords[word]);
  const autoCollect =
    context === "tranbox" && setting?.tranboxSetting?.autoFavWord;

  // Toggle the favorite state on click.
  const handleClick = useCallback(() => {
    try {
      setLoading(true);
      // REVIEW: If toggleFav is asynchronous, finally clears loading before it completes.
      // Make this handler async and await the toggle to prevent repeated clicks during the operation.
      const isFavorite = !favWords[word];
      toggleFav(word);
      document.dispatchEvent(
        new CustomEvent(EVENT_FAVORITE_WORD_CHANGE, {
          detail: { word, isFavorite },
        })
      );
    } catch (err) {
      kissLog("set fav", err);
    } finally {
      setLoading(false);
    }
  }, [favWords, toggleFav, word]);

  useEffect(() => {
    if (autoCollect && word && !favWords[word]) {
      handleClick();
    }
  }, [autoCollect, favWords, handleClick, word]);

  return (
    <IconButton
      disabled={loading}
      size="small"
      onClick={handleClick}
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
