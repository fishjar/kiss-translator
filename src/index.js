import React from "react";
import ReactDOM from "react-dom/client";
import CircularProgress from "@mui/material/CircularProgress";
import ReactMarkdown from "react-markdown";
import Paper from "@mui/material/Paper";
import { useFetch } from "./hooks/Fetch";
import { I18N, URL_RAW_PREFIX } from "./config";

function App() {
  const [data, loading, error] = useFetch(
    `${URL_RAW_PREFIX}/${I18N?.["about_md"]?.["zh"]}`
  );
  return (
    <Paper sx={{ padding: 2, margin: 2 }}>
      {loading ? (
        <center>
          <CircularProgress />
        </center>
      ) : (
        <ReactMarkdown children={error ? error.message : data} />
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
