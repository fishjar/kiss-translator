import FileDownloadIcon from "@mui/icons-material/FileDownload";
import Button from "@mui/material/Button";

export default function DownloadButton({ data, text, fileName }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (data) {
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName || `${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={handleClick}
      startIcon={<FileDownloadIcon />}
    >
      {text}
    </Button>
  );
}
