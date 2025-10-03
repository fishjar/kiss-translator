import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ReactMarkdown from "react-markdown";
import { useI18n, useI18nMd } from "../../hooks/I18n";

export default function About() {
  const i18n = useI18n();
  const { data, loading, error } = useI18nMd("about_md");
  return (
    <Box>
      {loading ? (
        <center>
          <CircularProgress />
        </center>
      ) : (
        <ReactMarkdown children={error ? i18n("about_md_local") : data} />
      )}
    </Box>
  );
}
