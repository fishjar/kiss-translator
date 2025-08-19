import IconButton from "@mui/material/IconButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LibraryAddCheckIcon from "@mui/icons-material/LibraryAddCheck";
import { useState } from "react";

export default function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const handleClick = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    const timer = setTimeout(() => {
      clearTimeout(timer);
      setCopied(false);
    }, 500);
  };
  return (
    <IconButton
      size="small"
      sx={{
        opacity: 0.5,
        "&:hover": {
          opacity: 1,
        },
      }}
      onClick={handleClick}
    >
      {copied ? (
        <LibraryAddCheckIcon fontSize="inherit" />
      ) : (
        <ContentCopyIcon fontSize="inherit" />
      )}
    </IconButton>
  );
}
