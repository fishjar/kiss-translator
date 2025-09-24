import IconButton from "@mui/material/IconButton";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useState } from "react";
import { useFavWords } from "../../hooks/FavWords";
import { kissLog } from "../../libs/log";

export default function FavBtn({ word }) {
  const { favWords, toggleFav } = useFavWords();
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    try {
      setLoading(true);
      toggleFav(word);
    } catch (err) {
      kissLog("set fav", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IconButton disabled={loading} size="small" onClick={handleClick}>
      {favWords[word] ? (
        <FavoriteIcon fontSize="inherit" />
      ) : (
        <FavoriteBorderIcon fontSize="inherit" />
      )}
    </IconButton>
  );
}
