import IconButton from "@mui/material/IconButton";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useState } from "react";
import { useFavWords } from "../../hooks/FavWords";
import { kissLog } from "../../libs/log";
import { useTheme } from "@mui/material/styles"; 

export default function FavBtn({ word, title }) {
  const { favWords, toggleFav } = useFavWords();
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

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

  const iconColor =
    theme.palette.mode === "dark"
      ? "rgba(255, 255, 255, 0.82)"  
      : undefined; 

  return (
    <IconButton
      disabled={loading}
      size="small"
      onClick={handleClick}
      title={title}
      sx={{ color: iconColor }} 
    >
      {favWords[word] ? (
        <FavoriteIcon fontSize="inherit" />
      ) : (
        <FavoriteBorderIcon fontSize="inherit" />
      )}
    </IconButton>
  );
}