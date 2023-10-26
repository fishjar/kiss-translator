import Stack from "@mui/material/Stack";
import { OPT_TRANS_BAIDU } from "../../config";
import { useEffect, useState, useRef } from "react";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CircularProgress from "@mui/material/CircularProgress";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { useI18n } from "../../hooks/I18n";
import Alert from "@mui/material/Alert";
import { apiTranslate } from "../../apis";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useFavWords } from "../../hooks/FavWords";
import { DictCont } from "../Selection/TranCont";

function DictField({ word }) {
  const [dictResult, setDictResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const dictRes = await apiTranslate({
          text: word,
          translator: OPT_TRANS_BAIDU,
          fromLang: "en",
          toLang: "zh-CN",
        });
        setDictResult(dictRes[2].dict_result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [word]);

  if (loading) {
    return <CircularProgress size={24} />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return <DictCont dictResult={dictResult} />;
}

function FavAccordion({ word }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        {/* <Typography>{`[${new Date(
          createdAt
        ).toLocaleString()}] ${word}`}</Typography> */}
        <Typography>{word}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && <DictField word={word} />}
      </AccordionDetails>
    </Accordion>
  );
}

function DownloadButton({ data, text, fileName }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (data) {
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        fileName || `kiss-words_${Date.now()}.json`
      );
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

function UploadButton({ handleImport, text }) {
  const i18n = useI18n();
  const inputRef = useRef(null);
  const handleClick = () => {
    inputRef.current && inputRef.current.click();
  };
  const onChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      return;
    }

    if (!file.type.includes("json")) {
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
        accept=".json"
        ref={inputRef}
        onChange={onChange}
        hidden
      />
    </Button>
  );
}

export default function FavWords() {
  const i18n = useI18n();
  const { favWords } = useFavWords();
  const favList = Object.entries(favWords).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const downloadList = favList.map(([word]) => word);

  const handleImport = async (data) => {
    try {
      console.log("data", data);
      // await rules.merge(JSON.parse(data));
    } catch (err) {
      console.log("[import rules]", err);
    }
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
        >
          <UploadButton text={i18n("import")} handleImport={handleImport} />
          <DownloadButton
            data={JSON.stringify(downloadList, null, 2)}
            text={i18n("export")}
          />
        </Stack>

        <Box>
          {favList.map(([word, { createdAt }]) => (
            <FavAccordion key={word} word={word} createdAt={createdAt} />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
