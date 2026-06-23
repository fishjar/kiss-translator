import Stack from "@mui/material/Stack";
import { useMemo, useState } from "react";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { useI18n } from "../../hooks/I18n";
import Box from "@mui/material/Box";
import { useFavWords } from "../../hooks/FavWords";
import DictCont from "../Selection/DictCont";
import AiDictCont from "../Selection/AiDictCont";
import SugCont from "../Selection/SugCont";
import Zdic from "../Selection/Zdic";
import DownloadButton from "./DownloadButton";
import UploadButton from "./UploadButton";
import Button from "@mui/material/Button";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import Alert from "@mui/material/Alert";
import { isSingleChineseChar, isValidWord } from "../../libs/utils";
import { kissLog } from "../../libs/log";
import { useConfirm } from "../../hooks/Confirm";
import { useSetting } from "../../hooks/Setting";
import { dictHandlers } from "../Selection/DictHandler";
import {
  DEFAULT_SETTING,
  DEFAULT_TRANBOX_SETTING,
  OPT_DICT_MAP,
  PROMPT_MODE_FOLLOW_API,
  findPromptBySlug,
  resolveApiPromptList,
} from "../../config";

function resolveAiDictApiSetting({
  aiDictApiSlug,
  aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
  prompts = [],
  transApis = [],
}) {
  if (!aiDictApiSlug || aiDictApiSlug === "-") {
    return null;
  }

  const apiSetting = transApis.find((api) => api.apiSlug === aiDictApiSlug);
  if (!apiSetting) {
    return null;
  }

  if (aiDictPromptSlug === PROMPT_MODE_FOLLOW_API) {
    return apiSetting.dictPrompt ? apiSetting : null;
  }

  const prompt = findPromptBySlug(prompts, aiDictPromptSlug);
  if (!prompt) {
    return null;
  }

  return {
    ...apiSetting,
    dictPromptSlug: prompt.slug,
    dictPrompt: prompt.systemPrompt,
    dictUserPrompt: prompt.userPrompt,
  };
}

/**
 * 单个生词的折叠手风琴面板组件
 *
 * @param {Object} props
 * @param {string} props.word - 生词/词组文本
 * @param {number} props.index - 单词在生词表中的序号
 * @param {number} [props.createdAt] - 收藏生词的创建时间戳
 * @param {number} [props.timestamp] - 关联的视频播放时间戳 (毫秒)
 */
function FavAccordion({
  word,
  index,
  createdAt,
  timestamp,
  tranboxSetting,
  transApis,
  prompts,
}) {
  // 控制当前手风琴展开与收起状态
  const [expanded, setExpanded] = useState(false);
  // 提取配置中用户选择的查词词典 (enDict) 和联想源 (enSug)
  const { enDict, enSug, aiDictApiSlug, aiDictPromptSlug, fromLang, toLang } =
    tranboxSetting || DEFAULT_TRANBOX_SETTING;
  const i18n = useI18n();
  const [dictTab, setDictTab] = useState("default");
  const isWord = useMemo(() => isValidWord(word), [word]);
  const isChineseChar = useMemo(() => isSingleChineseChar(word), [word]);
  const defaultDictAvailable =
    (isWord && OPT_DICT_MAP.has(enDict)) || isChineseChar;
  const aiDictApiSetting = useMemo(
    () =>
      resolveAiDictApiSetting({
        aiDictApiSlug,
        aiDictPromptSlug,
        prompts,
        transApis,
      }),
    [aiDictApiSlug, aiDictPromptSlug, prompts, transApis]
  );
  const aiDictAvailable = Boolean(word?.trim() && aiDictApiSetting);

  // 展开折叠切换处理
  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  // 将时间戳 (毫秒数) 格式化为 MM:SS 格式，方便视频时间跳转提示展示
  const formatTime = (milliseconds) => {
    if (!milliseconds) return "";
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // 处理点击跳转到视频指定时间点的事件
  const jumpToTime = (e) => {
    e.stopPropagation();
    if (timestamp) {
      // 通过 window.postMessage 向主页面发送跨文档消息，通知视频播放器跳转到对应时间
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
          {/* 序号与生词本身 */}
          {`${index + 1}. ${word}`}
          {/* 若带有视频时间戳，展示可点击跳转的时间按钮 */}
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
        {/* 仅在展开时懒加载渲染词典解释与联想提示组件，以提升长列表性能 */}
        {expanded && (
          <Stack spacing={2}>
            {(defaultDictAvailable || aiDictAvailable) && (
              <Box>
                {aiDictAvailable ? (
                  <>
                    <Tabs
                      value={defaultDictAvailable ? dictTab : "ai"}
                      onChange={(_, value) => setDictTab(value)}
                      variant="scrollable"
                      allowScrollButtonsMobile
                      sx={{ minHeight: 36, mb: 1 }}
                    >
                      {defaultDictAvailable && (
                        <Tab
                          value="default"
                          label={i18n("default_dict", "默认词典")}
                          sx={{ minHeight: 36, py: 0.5 }}
                        />
                      )}
                      <Tab
                        value="ai"
                        label={i18n("ai_dict", "AI词典")}
                        sx={{ minHeight: 36, py: 0.5 }}
                      />
                    </Tabs>
                    {defaultDictAvailable && dictTab === "default" && (
                      <>
                        {isWord && OPT_DICT_MAP.has(enDict) && (
                          <DictCont text={word} enDict={enDict} />
                        )}
                        {isChineseChar && <Zdic text={word} />}
                      </>
                    )}
                    {(!defaultDictAvailable || dictTab === "ai") && (
                      <AiDictCont
                        text={word}
                        fromLang={fromLang}
                        speechLang={fromLang}
                        toLang={toLang}
                        apiSetting={aiDictApiSetting}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {isWord && OPT_DICT_MAP.has(enDict) && (
                      <DictCont text={word} enDict={enDict} />
                    )}
                    {isChineseChar && <Zdic text={word} />}
                  </>
                )}
              </Box>
            )}
            <SugCont text={word} enSug={enSug} />
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

/**
 * 生词本管理器主页面组件 (用于查看、检索、清空和导入导出收藏的词汇)
 */
export default function FavWords() {
  const i18n = useI18n();
  // 全局生词管理 Hook，提供生词字典、单纯单词列表、合并导入与清空方法
  const { favList, wordList, mergeWords, clearWords } = useFavWords();
  const { setting } = useSetting();
  const { transApis, prompts, subtitleSetting, tranboxSetting } =
    setting || DEFAULT_SETTING;
  const resolvedTransApis = useMemo(
    () => resolveApiPromptList(transApis, prompts, subtitleSetting),
    [prompts, subtitleSetting, transApis]
  );
  const confirm = useConfirm();

  // 导入解析方法：解析纯文本，按行提取逗号分隔的第一个字段作为有效单词进行合并
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

  // 清空整个生词库的二次确认对话框
  const handleClearWords = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("confirm_title"),
      cancelText: i18n("cancel"),
    });
    if (isConfirmed) {
      clearWords();
    }
  };

  // 导出为格式化纯文本 (.txt) 格式方法
  const handleExportTxt = async () => {
    const fullWordData = [];

    // 从全局内存的 map / map 数据结构中读取收藏的完整释义字段
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

      // 提取并展示包裹方括号的干净音标
      const cleanPhonetic = item.phonetic;
      if (cleanPhonetic) {
        lines.push(`   音标: [${cleanPhonetic}]`);
      }

      if (item.definition) {
        lines.push(`   释义: ${item.definition}`);
      }

      // 如果有保存的例句，最多导出 2 条
      if (item.examples && item.examples.length > 0) {
        lines.push("   例句:");
        item.examples.slice(0, 2).forEach((example, exIndex) => {
          lines.push(`   ${exIndex + 1}. ${example.eng}`);
          if (example.chs) {
            lines.push(`      ${example.chs}`);
          }
        });
      }

      // 导出关联的 YouTube 视频定位播放 URL
      if (item.timestamp) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        const videoLink = `https://www.youtube.com/watch?t=${totalSeconds}`;
        lines.push(`   视频链接: ${videoLink}`);
      }

      lines.push(""); // 空行分隔
    });

    return lines.join("\n");
  };

  // 导出为适合 Excel/Anki 导入的 CSV 电子表格格式方法
  const handleExportCsv = async () => {
    const fullWordData = [];

    for (const [word, data] of favList) {
      fullWordData.push({
        word,
        phonetic: data.phonetic || "",
        definition: data.definition || "",
        examples: data.examples || [],
        timestamp: data.timestamp || null,
      });
    }

    // 表头定义，包含音标、基本释义、例句与译文、视频跳链
    const header =
      "Word,Phonetic,Definition,Example1,Translation1,Example2,Translation2,Video Link";
    const rows = fullWordData.map((item) => {
      // 转义 CSV 字段以防逗号与双引号断句冲突
      const escapeCSVField = (field) => {
        if (!field) return '""';
        return `"${field.toString().replace(/"/g, '""')}"`;
      };

      const cleanPhonetic = item.phonetic;
      const phonetic = cleanPhonetic ? `[${cleanPhonetic}]` : "";
      const definition = item.definition || "";

      let example1 = "";
      let translation1 = "";
      let example2 = "";
      let translation2 = "";

      // 提取最多两个例句
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

      return `${escapeCSVField(item.word)},${escapeCSVField(phonetic)},${escapeCSVField(definition)},${escapeCSVField(example1)},${escapeCSVField(translation1)},${escapeCSVField(example2)},${escapeCSVField(translation2)},${escapeCSVField(videoLink)}`;
    });

    const csvContent = [
      `"生词本导出文件",,,,,,,`,
      `,,,,,,,,`,
      header,
      ...rows,
    ].join("\n");

    // 添加 BOM 字节头 (\uFEFF) 强行让 Windows 记事本与 Excel 使用 UTF-8 编码解析中文，杜绝乱码
    return "\uFEFF" + csvContent;
  };

  // 导出为格式美观的 Markdown (.md) 电子学习笔记格式
  const handleExportMd = async () => {
    const fullWordData = [];

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

  // 实时调用词典 API 生成包含完整第三方释义的导出文本
  const handleTranslation = async () => {
    const { enDict } = setting?.tranboxSetting;
    const dict = dictHandlers[enDict];
    if (!dict) return "";

    const tranList = [];
    // REVIEW: 循环中串行 await 查词请求。若生词本中存在大量单词，这会导致严重的 HTTP 请求堆积、耗时极长乃至超时。建议改为并发限制（Pool分批）请求，以提升生成速度。
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
        {/* 生词本操作说明提示条 */}
        <Alert severity="info">{i18n("favorite_words_helper")}</Alert>

        {/* 导入、导出以及清空控制操作按钮栏 */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
        >
          {/* 上传导入纯文本生词本按钮 */}
          <UploadButton
            text={i18n("import")}
            handleImport={handleImport}
            fileType="text"
            fileExts={[".txt", ".csv"]}
          />

          {/* 默认纯单词行导出 (.txt) 按钮 */}
          <DownloadButton
            handleData={() => wordList.join("\n")}
            text={i18n("export")}
            fileName={`kiss-words_${Date.now()}.txt`}
          />

          {/* 格式化带释义与例句的 TXT 导出按钮 */}
          <DownloadButton
            handleData={handleExportTxt}
            text={i18n("export") + " (TXT)"}
            fileName={`kiss-words_${Date.now()}.txt`}
          />

          {/* 带释义与例句的 CSV 导出按钮 */}
          <DownloadButton
            handleData={handleExportCsv}
            text={i18n("export") + " (CSV)"}
            fileName={`kiss-words_${Date.now()}.csv`}
          />

          {/* 带释义与例句的 Markdown 导出按钮 */}
          <DownloadButton
            handleData={handleExportMd}
            text={i18n("export") + " (MD)"}
            fileName={`kiss-words_${Date.now()}.md`}
          />

          {/* 第三方词典翻译释义 Markdown 导出按钮 */}
          <DownloadButton
            handleData={handleTranslation}
            text={i18n("export_translation")}
            fileName={`kiss-words_${Date.now()}.md`}
          />
          {/* 一键清空所有生词 */}
          <Button
            size="small"
            variant="outlined"
            onClick={handleClearWords}
            startIcon={<ClearAllIcon />}
          >
            {i18n("clear_all")}
          </Button>
        </Stack>

        {/* 手风琴风折叠的生词列表区域 */}
        <Box>
          {favList.map(([word, { createdAt, timestamp }], index) => (
            <FavAccordion
              key={word}
              index={index}
              word={word}
              createdAt={createdAt}
              timestamp={timestamp}
              tranboxSetting={tranboxSetting}
              transApis={resolvedTransApis}
              prompts={prompts}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
