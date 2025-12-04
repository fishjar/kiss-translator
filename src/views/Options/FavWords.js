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

function FavAccordion({ word, index, createdAt, timestamp }) {
  const [expanded, setExpanded] = useState(false);
  const { setting } = useSetting();
  const { enDict, enSug } = setting?.tranboxSetting || {};

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  // 格式化时间为 MM:SS 格式
  const formatTime = (milliseconds) => {
    if (!milliseconds) return "";
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // 跳转到视频时间点
  const jumpToTime = (e) => {
    e.stopPropagation();
    if (timestamp) {
      // 发送消息到内容脚本，让视频跳转到指定时间
      window.postMessage(
        {
          type: "KISS_TRANSLATOR_JUMP_TO_TIME",
          time: timestamp,
        },
        "*"
      );
    }
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>
          {`${index + 1}. ${word}`}
          {timestamp && (
            <Button
              size="small"
              onClick={jumpToTime}
              style={{
                minWidth: "auto",
                padding: "0 4px",
                marginLeft: "10px",
                fontSize: "0.9rem",
                color: "#1e88e5",
                textTransform: "none",
              }}
            >
              {formatTime(timestamp)}
            </Button>
          )}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <Stack spacing={2}>
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
  const { favList, wordList, mergeWords, clearWords } = useFavWords();
  const { setting } = useSetting();
  const confirm = useConfirm();

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

  // 导出为纯文本格式
  const handleExportTxt = async () => {
    // 获取完整的单词信息
    const fullWordData = [];

    // 由于选项页面无法直接访问 YouTube 字幕列表中的完整数据，
    // 我们只能导出已存储在收藏夹中的信息
    for (const [word, data] of favList) {
      fullWordData.push({
        word,
        phonetic: data.phonetic || "",
        definition: data.definition || "",
        examples: data.examples || [],
        timestamp: data.timestamp || null,
      });
    }

    const lines = [];
    lines.push("生词本导出文件");
    lines.push(`导出时间: ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    fullWordData.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.word}`);

      // 清理音标，去除"US"标签和其他方括号，只保留音标本身，并用方括号包裹
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

      // 如果有时间戳，也导出时间信息
      if (item.timestamp) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        const videoLink = `https://www.youtube.com/watch?t=${totalSeconds}`;
        lines.push(`   视频链接: ${videoLink}`);
      }

      lines.push(""); // 空行分隔
    });

    return lines.join("\n");
  };

  // 导出为 CSV 格式
  const handleExportCsv = async () => {
    // 获取完整的单词信息（包括音标、释义、例句等）
    const fullWordData = [];

    // 由于选项页面无法直接访问 YouTube 字幕列表中的完整数据，
    // 我们只能导出已存储在收藏夹中的信息
    for (const [word, data] of favList) {
      fullWordData.push({
        word,
        phonetic: data.phonetic || "",
        definition: data.definition || "",
        examples: data.examples || [],
        timestamp: data.timestamp || null,
      });
    }

    // 创建包含多个例句列的表头
    const header =
      "Word,Phonetic,Definition,Example1,Translation1,Example2,Translation2,Video Link";
    const rows = fullWordData.map((item) => {
      // 转义特殊字符，特别是双引号
      const escapeCSVField = (field) => {
        if (!field) return '""';
        // 替换双引号为两个双引号，然后用双引号包围整个字段
        return `"${field.toString().replace(/"/g, '""')}"`;
      };

      // 清理音标，去除"US"标签和其他方括号，只保留音标本身，并用方括号包裹
      const cleanPhonetic = item.phonetic;
      const phonetic = cleanPhonetic ? `[${cleanPhonetic}]` : "";
      const definition = item.definition || "";

      // 获取前两个例句及其翻译
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

      // 创建YouTube链接
      let videoLink = "";
      if (item.timestamp) {
        // 由于在选项页面无法获取具体的视频ID，我们只能提供时间参数
        const totalSeconds = Math.floor(item.timestamp / 1000);
        videoLink = `https://www.youtube.com/watch?t=${totalSeconds}`;
      }

      return `${escapeCSVField(item.word)},${escapeCSVField(phonetic)},${escapeCSVField(definition)},${escapeCSVField(example1)},${escapeCSVField(translation1)},${escapeCSVField(example2)},${escapeCSVField(translation2)},${escapeCSVField(videoLink)}`;
    });

    // 创建CSV内容，添加说明行和表头
    const csvContent = [
      // 添加文件信息（在实际使用中，这应该是视频标题和链接）
      `"生词本导出文件",,,,,,,`,
      `,,,,,,,,`,
      // 表头
      header,
      // 数据行
      ...rows,
    ].join("\n");

    // 添加 BOM 头以支持 Excel 正确显示中文
    return "\uFEFF" + csvContent;
  };

  // 导出为 Markdown 格式
  const handleExportMd = async () => {
    // 获取完整的单词信息
    const fullWordData = [];

    // 由于选项页面无法直接访问 YouTube 字幕列表中的完整数据，
    // 我们只能导出已存储在收藏夹中的信息
    for (const [word, data] of favList) {
      fullWordData.push({
        word,
        phonetic: data.phonetic || "",
        definition: data.definition || "",
        examples: data.examples || [],
        timestamp: data.timestamp || null,
      });
    }

    const lines = [];
    lines.push("# 生词本导出文件");
    lines.push(`_导出时间: ${new Date().toLocaleString("zh-CN")}_`);
    lines.push("");

    fullWordData.forEach((item, index) => {
      lines.push(`${index + 1}. **${item.word}**`);

      // 清理音标，去除"US"标签和其他方括号，只保留音标本身，并用方括号包裹
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

      // 如果有时间戳，也导出时间信息
      if (item.timestamp) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        const videoLink = `https://www.youtube.com/watch?t=${totalSeconds}`;
        lines.push(
          `   *视频链接 Video Link:* [跳转到视频时间点](${videoLink})`
        );
      }

      lines.push(""); // 空行分隔
    });

    return lines.join("\n");
  };

  // 导出翻译
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

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">{i18n("favorite_words_helper")}</Alert>

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
            fileName={`kiss-words_${Date.now()}.txt`}
          />

          {/* 导出为 TXT 格式 */}
          <DownloadButton
            handleData={handleExportTxt}
            text={i18n("export") + " (TXT)"}
            fileName={`kiss-words_${Date.now()}.txt`}
          />

          {/* 导出为 CSV 格式 */}
          <DownloadButton
            handleData={handleExportCsv}
            text={i18n("export") + " (CSV)"}
            fileName={`kiss-words_${Date.now()}.csv`}
          />

          {/* 导出为 Markdown 格式 */}
          <DownloadButton
            handleData={handleExportMd}
            text={i18n("export") + " (MD)"}
            fileName={`kiss-words_${Date.now()}.md`}
          />

          <DownloadButton
            handleData={handleTranslation}
            text={i18n("export_translation")}
            fileName={`kiss-words_${Date.now()}.md`}
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

        <Box>
          {favList.map(([word, { createdAt, timestamp }], index) => (
            <FavAccordion
              key={word}
              index={index}
              word={word}
              createdAt={createdAt}
              timestamp={timestamp}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
