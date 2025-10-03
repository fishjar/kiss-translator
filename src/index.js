import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import ReactMarkdown from "react-markdown";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import { useGet } from "./hooks/Fetch";
import { I18N, URL_RAW_PREFIX } from "./config";

function App() {
  const [lang, setLang] = useState("zh");
  const { data, loading, error } = useGet(
    `${URL_RAW_PREFIX}/${I18N?.["about_md"]?.[lang]}`
  );

  return (
    <Paper sx={{ padding: 2, margin: 2 }}>
      <Stack spacing={2} direction="row" justifyContent="flex-end">
        <Button
          variant="text"
          onClick={() => {
            setLang((pre) => (pre === "zh" ? "en" : "zh"));
          }}
        >
          {lang === "zh" ? "ENGLISH" : "中文"}
        </Button>
      </Stack>
      <Divider>
        <Link
          href={process.env.REACT_APP_HOMEPAGE}
        >{`KISS Translator v${process.env.REACT_APP_VERSION}`}</Link>
      </Divider>
      <Stack spacing={2}>
        <Link href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}>
          Install/Update Userscript for Tampermonkey/Violentmonkey
        </Link>
        <Link href={process.env.REACT_APP_USERSCRIPT_IOS_DOWNLOADURL}>
          Install/Update Userscript for iOS Safari
        </Link>
        <Link href={process.env.REACT_APP_OPTIONSPAGE}>Open Options Page</Link>
      </Stack>

      {loading ? (
        <center>
          <CircularProgress />
        </center>
      ) : (
        <ReactMarkdown children={error || data} />
      )}
    </Paper>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
