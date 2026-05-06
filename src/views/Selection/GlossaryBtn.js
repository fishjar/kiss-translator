import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import BlockIcon from "@mui/icons-material/Block";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckIcon from "@mui/icons-material/Check";
import { useState, useCallback } from "react";
import { useFavWords, WORD_TYPE_FAVORITE, WORD_TYPE_NO_TRANSLATE, WORD_TYPE_CUSTOM_TRANSLATE } from "../../hooks/FavWords";
import { useI18n } from "../../hooks/I18n";
import { kissLog } from "../../libs/log";

export default function GlossaryBtn({ word, title }) {
  const i18n = useI18n();
  const { favWords, addWord, updateWord, removeWord, toggleFav } = useFavWords();
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customTranslation, setCustomTranslation] = useState("");

  const wordData = favWords[word];
  const wordType = wordData?.type || (wordData ? WORD_TYPE_FAVORITE : null);

  const handleMenuOpen = useCallback((e) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
    if (wordData?.customTranslation) {
      setCustomTranslation(wordData.customTranslation);
    }
  }, [wordData]);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleToggleFavorite = useCallback(() => {
    try {
      setLoading(true);
      toggleFav(word);
    } catch (err) {
      kissLog("set fav", err);
    } finally {
      setLoading(false);
      handleMenuClose();
    }
  }, [word, toggleFav, handleMenuClose]);

  const handleSetNoTranslate = useCallback(() => {
    try {
      setLoading(true);
      if (!wordData) {
        addWord(word, { type: WORD_TYPE_NO_TRANSLATE });
      } else {
        updateWord(word, { type: WORD_TYPE_NO_TRANSLATE });
      }
    } catch (err) {
      kissLog("set no translate", err);
    } finally {
      setLoading(false);
      handleMenuClose();
    }
  }, [word, wordData, addWord, updateWord, handleMenuClose]);

  const handleSetCustomTranslate = useCallback(() => {
    setDialogOpen(true);
    handleMenuClose();
  }, [handleMenuClose]);

  const handleDialogSave = useCallback(() => {
    try {
      setLoading(true);
      if (!wordData) {
        addWord(word, {
          type: WORD_TYPE_CUSTOM_TRANSLATE,
          customTranslation: customTranslation,
        });
      } else {
        updateWord(word, {
          type: WORD_TYPE_CUSTOM_TRANSLATE,
          customTranslation: customTranslation,
        });
      }
    } catch (err) {
      kissLog("set custom translate", err);
    } finally {
      setLoading(false);
      setDialogOpen(false);
    }
  }, [word, wordData, customTranslation, addWord, updateWord]);

  const handleRemoveFromGlossary = useCallback(() => {
    try {
      setLoading(true);
      removeWord(word);
    } catch (err) {
      kissLog("remove from glossary", err);
    } finally {
      setLoading(false);
      handleMenuClose();
    }
  }, [word, removeWord, handleMenuClose]);

  const getIcon = () => {
    switch (wordType) {
      case WORD_TYPE_NO_TRANSLATE:
        return <BlockIcon fontSize="inherit" color="error" />;
      case WORD_TYPE_CUSTOM_TRANSLATE:
        return <EditIcon fontSize="inherit" color="primary" />;
      case WORD_TYPE_FAVORITE:
        return <FavoriteIcon fontSize="inherit" color="error" />;
      default:
        return <FavoriteBorderIcon fontSize="inherit" />;
    }
  };

  const getTitle = () => {
    switch (wordType) {
      case WORD_TYPE_NO_TRANSLATE:
        return i18n("type_no_translate");
      case WORD_TYPE_CUSTOM_TRANSLATE:
        return `${i18n("type_custom_translate")}: ${wordData?.customTranslation || ""}`;
      case WORD_TYPE_FAVORITE:
        return i18n("type_favorite");
      default:
        return title || i18n("add_to_glossary");
    }
  };

  return (
    <>
      <IconButton
        disabled={loading}
        size="small"
        onClick={handleMenuOpen}
        title={getTitle()}
      >
        {wordType ? (
          getIcon()
        ) : (
          <FavoriteBorderIcon fontSize="inherit" />
        )}
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={handleToggleFavorite}
          selected={wordType === WORD_TYPE_FAVORITE}
        >
          <ListItemIcon>
            {wordType === WORD_TYPE_FAVORITE ? (
              <CheckIcon color="success" fontSize="small" />
            ) : (
              <FavoriteIcon fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText>{i18n("type_favorite")}</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={handleSetNoTranslate}
          selected={wordType === WORD_TYPE_NO_TRANSLATE}
        >
          <ListItemIcon>
            {wordType === WORD_TYPE_NO_TRANSLATE ? (
              <CheckIcon color="success" fontSize="small" />
            ) : (
              <BlockIcon fontSize="small" color="error" />
            )}
          </ListItemIcon>
          <ListItemText>{i18n("type_no_translate")}</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={handleSetCustomTranslate}
          selected={wordType === WORD_TYPE_CUSTOM_TRANSLATE}
        >
          <ListItemIcon>
            {wordType === WORD_TYPE_CUSTOM_TRANSLATE ? (
              <CheckIcon color="success" fontSize="small" />
            ) : (
              <EditIcon fontSize="small" color="primary" />
            )}
          </ListItemIcon>
          <ListItemText>{i18n("type_custom_translate")}</ListItemText>
        </MenuItem>

        {wordType && (
          <MenuItem onClick={handleRemoveFromGlossary} color="error">
            <ListItemIcon>
              <MoreVertIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText sx={{ color: "error.main" }}>
              {i18n("remove_from_glossary")}
            </ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6">
            {i18n("custom_translation")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {word}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={i18n("custom_translation")}
            type="text"
            fullWidth
            variant="outlined"
            value={customTranslation}
            onChange={(e) => setCustomTranslation(e.target.value)}
            placeholder={i18n("enter_translation") || "Enter translation..."}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {i18n("cancel")}
          </Button>
          <Button onClick={handleDialogSave} variant="contained">
            {i18n("save")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
