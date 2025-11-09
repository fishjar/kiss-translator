import FileDownloadIcon from "@mui/icons-material/FileDownload";
import LoadingButton from "@mui/lab/LoadingButton";
import { useState } from "react";
import { kissLog } from "../../libs/log";
import { downloadBlobFile } from "../../libs/utils";

export default function DownloadButton({ handleData, text, fileName }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const data = await handleData();
      downloadBlobFile(data, fileName);
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
