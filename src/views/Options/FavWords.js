import Stack from "@mui/material/Stack";
import { OPT_TRANS_BAIDU } from "../../config";
import { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { apiTranslate } from "../../apis";
import Box from "@mui/material/Box";
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

export default function FavWords() {
  const { favWords } = useFavWords();
  const favList = Object.entries(favWords).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          {favList.map(([word, { createdAt }]) => (
            <FavAccordion key={word} word={word} createdAt={createdAt} />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
