import FileDownloadIcon from "@mui/icons-material/FileDownload";
import LoadingButton from "@mui/lab/LoadingButton";
import { useState } from "react";
import { kissLog } from "../../libs/log";

export default function DownloadButton({ handleData, text, fileName }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const data = await handleData();
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName || `${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      kissLog("download", err);
    } finally {
      setLoading(false);
    }
  };
  return (
    <LoadingButton
      size="small"
      variant="outlined"
      onClick={handleClick}
      loading={loading}
      startIcon={<FileDownloadIcon />}
    >
      {text}
    </LoadingButton>
  );
}
