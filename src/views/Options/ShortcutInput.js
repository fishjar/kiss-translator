import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import { useEffect, useState, useRef } from "react";
import { shortcutListener } from "../../libs/shortcut";
import { useI18n } from "../../hooks/I18n";

export default function ShortcutInput({
  value: keys,
  onChange,
  label,
  helperText,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingKeys, setEditingKeys] = useState([]);
  const inputRef = useRef(null);
  const i18n = useI18n();

  const commitChanges = () => {
    // if (editingKeys.length > 0) {
    //   onChange(editingKeys);
    // }
    onChange(editingKeys);
    setIsEditing(false);
  };

  const handleBlur = () => {
    commitChanges();
  };

  const handleEditClick = () => {
    setEditingKeys([]);
    setIsEditing(true);
  };

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.focus();
    }
    const clearShortcut = shortcutListener((pressedKeys, event) => {
      event.preventDefault();
      event.stopPropagation();
      setEditingKeys([...pressedKeys]);
    });

    return () => {
      clearShortcut();
    };
  }, [isEditing]);

  const displayValue = isEditing ? editingKeys : keys;
  const formattedValue = displayValue
    .map((item) => (item === " " ? "Space" : item))
    .join(" + ");

  return (
    <Stack direction="row" alignItems="flex-start">
      <TextField
        size="small"
        label={label}
        name={label}
        value={formattedValue}
        fullWidth
        inputRef={inputRef}
        disabled={!isEditing}
        onBlur={handleBlur}
        helperText={isEditing ? i18n("pls_press_shortcut") : helperText}
      />
      {isEditing ? (
        <IconButton onClick={commitChanges} color="primary">
          <CheckIcon />
        </IconButton>
      ) : (
        <IconButton onClick={handleEditClick}>
          <EditIcon />
        </IconButton>
      )}
    </Stack>
  );
}
