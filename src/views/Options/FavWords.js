import Stack from "@mui/material/Stack";
import { useState } from "react";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useI18n } from "../../hooks/I18n";
import Box from "@mui/material/Box";
import { useFavWords } from "../../hooks/FavWords";
import DictCont from "../Selection/DictCont";
import SugCont from "../Selection/SugCont";
import DownloadButton from "./DownloadButton";
import UploadButton from "./UploadButton";
import Button from "@mui/material/Button";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import Alert from "@mui/material/Alert";
import { isValidWord } from "../../libs/utils";
import { kissLog } from "../../libs/log";
import { useConfirm } from "../../hooks/Confirm";
import { useSetting } from "../../hooks/Setting";
import { dictHandlers } from "../Selection/DictHandler";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import FavoriteIcon from "@mui/icons-material/Favorite";
import BlockIcon from "@mui/icons-material/Block";
import EditIcon from "@mui/icons-material/Edit";

function FavAccordion({ word, index, wordData, onUpdateWord, onRemoveWord }) {
  const [expanded, setExpanded] = useState(false);
  const { setting } = useSetting();
  const { enDict, enSug } = setting?.tranboxSetting || {};
  const i18n = useI18n();
  const {
    WORD_TYPE_FAVORITE,
    WORD_TYPE_NO_TRANSLATE,
    WORD_TYPE_CUSTOM_TRANSLATE,
  } = useFavWords();

  const [editMode, setEditMode] = useState(false);
  const [customTranslation, setCustomTranslation] = useState(
    wordData?.customTranslation || ""
  );
  const [wordType, setWordType] = useState(
    wordData?.type || WORD_TYPE_FAVORITE
  );

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  const formatTime = (milliseconds) => {
    if (!milliseconds) return "";
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const jumpToTime = (e) => {
    e.stopPropagation();
    if (wordData?.timestamp) {
      window.postMessage(
        {
          type: "KISS_TRANSLATOR_JUMP_TO_TIME",
          time: wordData.timestamp,
        },
        "*"
      );
    }
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    setWordType(newType);
    onUpdateWord(word, { type: newType });
  };

  const handleCustomTranslationChange = (e) => {
    setCustomTranslation(e.target.value);
  };

  const handleSaveCustomTranslation = () => {
    onUpdateWord(word, { customTranslation });
    setEditMode(false);
  };

  const getTypeChip = () => {
    switch (wordType) {
      case WORD_TYPE_NO_TRANSLATE:
        return (
          <Chip
            size="small"
            icon={<BlockIcon />}
            label={i18n("type_no_translate")}
            color="error"
            variant="outlined"
            sx={{ ml: 1 }}
          />
        );
      case WORD_TYPE_CUSTOM_TRANSLATE:
        return (
          <Chip
            size="small"
            icon={<EditIcon />}
            label={i18n("type_custom_translate")}
            color="primary"
            variant="outlined"
            sx={{ ml: 1 }}
          />
        );
      default:
        return (
          <Chip
            size="small"
            icon={<FavoriteIcon />}
            label={i18n("type_favorite")}
            color="success"
            variant="outlined"
            sx={{ ml: 1 }}
          />
        );
    }
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" sx={{ width: "100%" }}>
          <Typography sx={{ flexGrow: 1 }}>
            {`${index + 1}. ${word}`}
            {wordData?.timestamp && (
              <Button
                size="small"
                onClick={jumpToTime}
                sx={{
                  minWidth: "auto",
                  padding: "0 4px",
                  marginLeft: "10px",
                  fontSize: "0.9rem",
                  color: "#1e88e5",
                  textTransform: "none",
                }}
              >
                {formatTime(wordData.timestamp)}
              </Button>
            )}
          </Typography>
          {getTypeChip()}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center" useFlexGap>
              <TextField
                select
                size="small"
                label={i18n("word_type")}
                value={wordType}
                onChange={handleTypeChange}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value={WORD_TYPE_FAVORITE}>
                  {i18n("type_favorite")}
                </MenuItem>
                <MenuItem value={WORD_TYPE_NO_TRANSLATE}>
                  {i18n("type_no_translate")}
                </MenuItem>
                <MenuItem value={WORD_TYPE_CUSTOM_TRANSLATE}>
                  {i18n("type_custom_translate")}
                </MenuItem>
              </TextField>

              {wordType === WORD_TYPE_CUSTOM_TRANSLATE && (
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap>
                  <TextField
                    size="small"
                    label={i18n("custom_translation")}
                    value={customTranslation}
                    onChange={handleCustomTranslationChange}
                    sx={{ minWidth: 250 }}
                    onBlur={handleSaveCustomTranslation}
                  />
                </Stack>
              )}

              <IconButton
                size="small"
                color="error"
                onClick={() => onRemoveWord(word)}
                title={i18n("remove_from_glossary")}
              >
                <DeleteIcon />
              </IconButton>
            </Stack>

            {wordType === WORD_TYPE_CUSTOM_TRANSLATE && customTranslation && (
              <Alert severity="info">
                <strong>{word}</strong> → {customTranslation}
              </Alert>
            )}

            {wordType === WORD_TYPE_NO_TRANSLATE && (
              <Alert severity="warning">
                <strong>{word}</strong> {i18n("type_no_translate")}
              </Alert>
            )}

            <DictCont text={word} enDict={enDict} />
            <SugCont text={word} enSug={enSug} />
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function FavWords() {
  const i18n = useI18n();
  const {
    favList,
    wordList,
    mergeWords,
    clearWords,
    updateWord,
    removeWord,
    favoriteList,
    noTranslateList,
    customTranslateList,
    WORD_TYPE_FAVORITE,
    WORD_TYPE_NO_TRANSLATE,
    WORD_TYPE_CUSTOM_TRANSLATE,
  } = useFavWords();
  const { setting } = useSetting();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState(0);

  const handleImport = (data) => {
    try {
      const newWords = data
        .split("\n")
        .map((line) => line.split(",")[0].trim())
        .filter(isValidWord);
      mergeWords(newWords);
    } catch (err) {
      kissLog("import rules", err);
    }
  };

  const handleClearWords = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("confirm_title"),
      cancelText: i18n("cancel"),
    });
    if (isConfirmed) {
      clearWords();
    }
  };

  const handleUpdateWord = (word, updates) => {
    updateWord(word, updates);
  };

  const handleRemoveWord = async (word) => {
    const isConfirmed = await confirm({
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });
    if (isConfirmed) {
      removeWord(word);
    }
  };

  const handleExportTxt = async () => {
    const fullWordData = [];

    for (const [word, data] of favList) {
      fullWordData.push({
        word,
        type: data.type || WORD_TYPE_FAVORITE,
        customTranslation: data.customTranslation || "",
        phonetic: data.phonetic || "",
        definition: data.definition || "",
        examples: data.examples || [],
        timestamp: data.timestamp || null,
      });
    }

    const lines = [];
    lines.push("生词本/专业词库导出文件");
    lines.push(`导出时间: ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    fullWordData.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.word}`);

      let typeLabel = i18n("type_favorite");
      if (item.type === WORD_TYPE_NO_TRANSLATE) {
        typeLabel = i18n("type_no_translate");
      } else if (item.type === WORD_TYPE_CUSTOM_TRANSLATE) {
        typeLabel = i18n("type_custom_translate");
      }
      lines.push(`   类型: ${typeLabel}`);

      if (item.customTranslation) {
        lines.push(`   自定义翻译: ${item.customTranslation}`);
      }

      const cleanPhonetic = item.phonetic;
      if (cleanPhonetic) {
        lines.push(`   音标: [${cleanPhonetic}]`);
      }

      if (item.definition) {
        lines.push(`   释义: ${item.definition}`);
      }

      if (item.examples && item.examples.length > 0) {
        lines.push("   例句:");
        item.examples.slice(0, 2).forEach((example, exIndex) => {
          lines.push(`   ${exIndex + 1}. ${example.eng}`);
          if (example.chs) {
            lines.push(`      ${example.chs}`);
          }
        });
      }

      if (item.timestamp) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        const videoLink = `https://www.youtube.com/watch?t=${totalSeconds}`;
        lines.push(`   视频链接: ${videoLink}`);
      }

      lines.push("");
    });

    return lines.join("\n");
  };

  const handleExportCsv = async () => {
    const fullWordData = [];

    for (const [word, data] of favList) {
      fullWordData.push({
        word,
        type: data.type || WORD_TYPE_FAVORITE,
        customTranslation: data.customTranslation || "",
        phonetic: data.phonetic || "",
        definition: data.definition || "",
        examples: data.examples || [],
        timestamp: data.timestamp || null,
      });
    }

    const header =
      "Word,Type,Custom Translation,Phonetic,Definition,Example1,Translation1,Example2,Translation2,Video Link";
    const rows = fullWordData.map((item) => {
      const escapeCSVField = (field) => {
        if (!field) return '""';
        return `"${field.toString().replace(/"/g, '""')}"`;
      };

      const typeLabel = item.type;
      const phonetic = item.phonetic ? `[${item.phonetic}]` : "";
      const definition = item.definition || "";
      const customTranslation = item.customTranslation || "";

      let example1 = "";
      let translation1 = "";
      let example2 = "";
      let translation2 = "";

      if (item.examples && item.examples.length > 0) {
        example1 = item.examples[0].eng || "";
        translation1 = item.examples[0].chs || "";
      }

      if (item.examples && item.examples.length > 1) {
        example2 = item.examples[1].eng || "";
        translation2 = item.examples[1].chs || "";
      }

      let videoLink = "";
      if (item.timestamp) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        videoLink = `https://www.youtube.com/watch?t=${totalSeconds}`;
      }

      return `${escapeCSVField(item.word)},${escapeCSVField(typeLabel)},${escapeCSVField(customTranslation)},${escapeCSVField(phonetic)},${escapeCSVField(definition)},${escapeCSVField(example1)},${escapeCSVField(translation1)},${escapeCSVField(example2)},${escapeCSVField(translation2)},${escapeCSVField(videoLink)}`;
    });

    const csvContent = [
      `"生词本/专业词库导出文件",,,,,,,,,,`,
      `,,,,,,,,,,`,
      header,
      ...rows,
    ].join("\n");

    return "\uFEFF" + csvContent;
  };

  const handleExportMd = async () => {
    const fullWordData = [];

    for (const [word, data] of favList) {
      fullWordData.push({
        word,
        type: data.type || WORD_TYPE_FAVORITE,
        customTranslation: data.customTranslation || "",
        phonetic: data.phonetic || "",
        definition: data.definition || "",
        examples: data.examples || [],
        timestamp: data.timestamp || null,
      });
    }

    const lines = [];
    lines.push("# 生词本/专业词库导出文件");
    lines.push(`_导出时间: ${new Date().toLocaleString("zh-CN")}_`);
    lines.push("");

    fullWordData.forEach((item, index) => {
      lines.push(`${index + 1}. **${item.word}**`);

      let typeLabel = i18n("type_favorite");
      if (item.type === WORD_TYPE_NO_TRANSLATE) {
        typeLabel = i18n("type_no_translate");
      } else if (item.type === WORD_TYPE_CUSTOM_TRANSLATE) {
        typeLabel = i18n("type_custom_translate");
      }
      lines.push(`   *${i18n("word_type")}:* ${typeLabel}`);

      if (item.customTranslation) {
        lines.push(`   *${i18n("custom_translation")}:* ${item.customTranslation}`);
      }

      const cleanPhonetic = item.phonetic;
      if (cleanPhonetic) {
        lines.push(`   *音标 Phonetic:* [${cleanPhonetic}]`);
      }

      if (item.definition) {
        lines.push(`   *释义 Definition:* ${item.definition}`);
      }

      if (item.examples && item.examples.length > 0) {
        lines.push("   *例句 Examples:*");
        item.examples.slice(0, 2).forEach((example, exIndex) => {
          lines.push(`   ${exIndex + 1}. ${example.eng}`);
          if (example.chs) {
            lines.push(`      ${example.chs}`);
          }
        });
      }

      if (item.timestamp) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        const videoLink = `https://www.youtube.com/watch?t=${totalSeconds}`;
        lines.push(
          `   *视频链接 Video Link:* [跳转到视频时间点](${videoLink})`
        );
      }

      lines.push("");
    });

    return lines.join("\n");
  };

  const handleTranslation = async () => {
    const { enDict } = setting?.tranboxSetting;
    const dict = dictHandlers[enDict];
    if (!dict) return "";

    const tranList = [];
    for (const word of wordList) {
      try {
        const data = await dict.apiFn(word);
        const title = `## ${dict.reWord(data) || word}`;
        const tran = dict
          .toText(data)
          .map((line) => `- ${line}`)
          .join("\n");
        tranList.push([title, tran].join("\n"));
      } catch (err) {
        kissLog("export translation", err);
      }
    }

    return tranList.join("\n\n");
  };

  const getTabLabel = (type) => {
    switch (type) {
      case 0:
        return `${i18n("favorite_words")} (${favoriteList.length})`;
      case 1:
        return `${i18n("no_translate_words")} (${noTranslateList.length})`;
      case 2:
        return `${i18n("custom_translate_words")} (${customTranslateList.length})`;
      default:
        return "";
    }
  };

  const getActiveList = () => {
    switch (activeTab) {
      case 0:
        return favoriteList;
      case 1:
        return noTranslateList;
      case 2:
        return customTranslateList;
      default:
        return favList;
    }
  };

  const activeList = getActiveList();

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">
          {i18n("glossary_setting")}: {i18n("type_favorite")} /{" "}
          {i18n("type_no_translate")} / {i18n("type_custom_translate")}
        </Alert>

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
            handleData={() => wordList.join("\n")}
            text={i18n("export")}
            fileName={`kiss-glossary_${Date.now()}.txt`}
          />

          <DownloadButton
            handleData={handleExportTxt}
            text={i18n("export") + " (TXT)"}
            fileName={`kiss-glossary_${Date.now()}.txt`}
          />

          <DownloadButton
            handleData={handleExportCsv}
            text={i18n("export") + " (CSV)"}
            fileName={`kiss-glossary_${Date.now()}.csv`}
          />

          <DownloadButton
            handleData={handleExportMd}
            text={i18n("export") + " (MD)"}
            fileName={`kiss-glossary_${Date.now()}.md`}
          />

          <DownloadButton
            handleData={handleTranslation}
            text={i18n("export_translation")}
            fileName={`kiss-glossary_${Date.now()}.md`}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={handleClearWords}
            startIcon={<ClearAllIcon />}
          >
            {i18n("clear_all")}
          </Button>
        </Stack>

        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          variant="fullWidth"
        >
          <Tab
            label={getTabLabel(0)}
            icon={<FavoriteIcon />}
            iconPosition="start"
          />
          <Tab
            label={getTabLabel(1)}
            icon={<BlockIcon />}
            iconPosition="start"
          />
          <Tab
            label={getTabLabel(2)}
            icon={<EditIcon />}
            iconPosition="start"
          />
        </Tabs>

        <Box>
          {activeList.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={4}>
              {activeTab === 0
                ? i18n("favorite_words")
                : activeTab === 1
                ? i18n("no_translate_words")
                : i18n("custom_translate_words")}
              : {i18n("error_cant_be_blank")}
            </Typography>
          ) : (
            activeList.map(([word, wordData], index) => (
              <FavAccordion
                key={word}
                word={word}
                index={index}
                wordData={wordData}
                onUpdateWord={handleUpdateWord}
                onRemoveWord={handleRemoveWord}
              />
            ))
          )}
        </Box>
      </Stack>
    </Box>
  );
}
