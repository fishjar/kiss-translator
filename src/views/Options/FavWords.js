import Stack from "@mui/material/Stack";
import { useState } from "react";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CircularProgress from "@mui/material/CircularProgress";
import { useI18n } from "../../hooks/I18n";
import Box from "@mui/material/Box";
import { useFavWords } from "../../hooks/FavWords";
import DictCont from "../Selection/DictCont";
import SugCont from "../Selection/SugCont";
import DownloadButton from "./DownloadButton";
import UploadButton from "./UploadButton";
import Button from "@mui/material/Button";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import { isValidWord } from "../../libs/utils";
import { kissLog } from "../../libs/log";

function FavAccordion({ word, index }) {
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
        <Typography>{`${index + 1}. ${word}`}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <Stack spacing={2}>
            <DictCont text={word} />
            <SugCont text={word} />
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function FavWords() {
  const i18n = useI18n();
  const { loading, favWords, mergeWords, clearWords } = useFavWords();
  const favList = Object.entries(favWords).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const downloadList = favList.map(([word]) => word);

  const handleImport = async (data) => {
    try {
      const newWords = data
        .split("\n")
        .map((line) => line.split(",")[0].trim())
        .filter(isValidWord);
      await mergeWords(newWords);
    } catch (err) {
      kissLog(err, "import rules");
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
          <UploadButton
            text={i18n("import")}
            handleImport={handleImport}
            fileType="text"
            fileExts={[".txt", ".csv"]}
          />
          <DownloadButton
            data={downloadList.join("\n")}
            text={i18n("export")}
            fileName={`kiss-words_${Date.now()}.txt`}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              clearWords();
            }}
            startIcon={<ClearAllIcon />}
          >
            {i18n("clear_all")}
          </Button>
        </Stack>

        <Box>
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            favList.map(([word, { createdAt }], index) => (
              <FavAccordion
                key={word}
                index={index}
                word={word}
                createdAt={createdAt}
              />
            ))
          )}
        </Box>
      </Stack>
    </Box>
  );
}
