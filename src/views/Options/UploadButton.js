import { useRef } from "react";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { useI18n } from "../../hooks/I18n";
import Button from "@mui/material/Button";

export default function UploadButton({
  handleImport,
  text,
  fileType = "json",
  fileExts = [".json"],
}) {
  const i18n = useI18n();
  const inputRef = useRef(null);
  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.click();
      inputRef.current.value = null;
    }
  };
  const onChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      return;
    }

    if (!file.type.includes(fileType)) {
      alert(i18n("error_wrong_file_type"));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      handleImport(e.target.result);
    };
    reader.readAsText(file);
  };

  return (
    <Button
      size="small"
      variant="outlined"
      onClick={handleClick}
      startIcon={<FileUploadIcon />}
    >
      {text}
      <input
        type="file"
        accept={fileExts.join(", ")}
        ref={inputRef}
        onChange={onChange}
        hidden
      />
    </Button>
  );
}
