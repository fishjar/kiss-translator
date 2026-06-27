import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import DoneIcon from "@mui/icons-material/Done";
import CircularProgress from "@mui/material/CircularProgress";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  OPT_LANGDETECTOR_ALL,
  OPT_DICT_ALL,
  OPT_SUG_ALL,
  OPT_LANGS_MAP,
  OPT_DICT_MAP,
  OPT_SUG_MAP,
  PROMPT_MODE_FOLLOW_API,
  findPromptBySlug,
} from "../../config";
import { useState, useMemo, useEffect, useRef } from "react";
import TranCont from "./TranCont";
import DictCont from "./DictCont";
import AiDictCont from "./AiDictCont";
import SugCont from "./SugCont";
import CopyBtn from "./CopyBtn";
import Zdic from "./Zdic";
import { isValidWord, isSingleChineseChar } from "../../libs/utils";
import { kissLog } from "../../libs/log";
import { tryDetectLang } from "../../libs/detect";

/**
 * 翻译交互核心表单组件 (集成源/目标语言选择、多引擎翻译、词典展示、汉典展示、语言检测与文本输入)
 */
export default function TranForm({
  text,
  setText,
  apiSlugs: initApiSlugs,
  fromLang: initFromLang,
  toLang: initToLang,
  toLang2: initToLang2,
  transApis,
  simpleStyle = false,
  langDetector: initLangDetector = "-",
  enDict: initEnDict = "-",
  enSug: initEnSug = "-",
  aiDictApiSlug = "-",
  aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
  prompts = [],
  selectionContext = "",
  isPlaygound = false,
}) {
  const i18n = useI18n();

  // 当前是否处于文本框获取焦点的编辑提交模式
  const [editMode, setEditMode] = useState(false);
  // 输入框中临时编辑的文本，在失焦或点击提交时同步至外层全局 text 状态
  const [editText, setEditText] = useState(text);
  const [apiSlugs, setApiSlugs] = useState(initApiSlugs);
  const [hasUserChangedApiSlugs, setHasUserChangedApiSlugs] = useState(false);
  const [fromLang, setFromLang] = useState(initFromLang);
  const [toLang, setToLang] = useState(initToLang);
  const [toLang2, setToLang2] = useState(initToLang2);
  const [langDetector, setLangDetector] = useState(initLangDetector);
  const [enDict, setEnDict] = useState(initEnDict);
  const [enSug, setEnSug] = useState(initEnSug);
  const [dictTab, setDictTab] = useState("default");
  const hasUserChangedDictTabRef = useRef(false);
  // 异步自动检测到的源文本语言代码 (例如 "en", "zh")
  const [deLang, setDeLang] = useState("");
  const [deLoading, setDeLoading] = useState(false);
  const inputRef = useRef(null);

  // 挂载时：输入框自动获取焦点，并将光标定位在文本尾部
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.focus();

    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, []);

  // 监听划词/输入文本，如果是合法的英文单词，则分发自定义事件，便于其他监听器(如生词本系统)感知新单词
  useEffect(() => {
    if (isValidWord(text)) {
      const event = new CustomEvent("kiss-add-word", {
        detail: { word: text },
      });
      document.dispatchEvent(event);
    }
  }, [text]);

  // 同步外层传入的 API 启用列表状态
  useEffect(() => {
    if (!hasUserChangedApiSlugs) {
      setApiSlugs(initApiSlugs);
    }
  }, [initApiSlugs, hasUserChangedApiSlugs]);

  // 如果没有处于编辑态，输入框显示内容需要实时同步外部 text
  useEffect(() => {
    if (!editMode) {
      setEditText(text);
    }
  }, [text, editMode]);

  // 文本改变或配置切换时，发起异步语种检测
  useEffect(() => {
    if (!text.trim()) {
      setDeLang("");
      return;
    }

    (async () => {
      try {
        setDeLoading(true);
        const deLang = await tryDetectLang(text, langDetector);
        if (deLang) {
          setDeLang(deLang);
        }
      } catch (err) {
        kissLog("tranbox: detect lang", err);
      } finally {
        setDeLoading(false);
      }
    })();
  }, [text, langDetector, setDeLang, setDeLoading]);

  // 从剪贴板粘贴文本到翻译框
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setText(text.trim());
    } catch (err) {
      //
    }
  };

  // 智能决策最终翻译的目标语言（实现源语种与主目标语种相同时，自动降级切换翻译到第二备用目标语种的逻辑）
  const realToLang = useMemo(() => {
    if (
      fromLang === "auto" &&
      toLang !== toLang2 &&
      toLang2 !== "-" &&
      deLang === toLang
    ) {
      return toLang2;
    }

    return toLang;
  }, [fromLang, toLang, toLang2, deLang]);

  // 过滤出未被禁用的翻译服务商
  const optApis = useMemo(
    () =>
      transApis
        .filter((api) => !api.isDisabled)
        .map((api) => ({
          key: api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [transApis]
  );

  const isWord = useMemo(() => isValidWord(text), [text]);
  const xs = useMemo(() => (isPlaygound ? 6 : 4), [isPlaygound]);
  const md = useMemo(() => (isPlaygound ? 3 : 4), [isPlaygound]);

  const activeApiSlugs = useMemo(() => {
    const validSlugs = new Set(optApis.map((api) => api.key));
    return apiSlugs.filter((slug) => validSlugs.has(slug));
  }, [apiSlugs, optApis]);

  // 默认词典覆盖英文单词和单个汉字：英文走 Bing/有道，单字走汉典。
  const defaultDictAvailable =
    (isWord && OPT_DICT_MAP.has(enDict)) || isSingleChineseChar(text);
  const aiDictApiSetting = useMemo(() => {
    if (!aiDictApiSlug || aiDictApiSlug === "-") {
      return null;
    }

    const apiSetting = transApis.find((api) => api.apiSlug === aiDictApiSlug);
    if (!apiSetting) {
      return null;
    }

    // 跟随接口时必须确保 API 配置已经解析出了 dictPrompt，否则 AI 词典不可用。
    if (aiDictPromptSlug === PROMPT_MODE_FOLLOW_API) {
      return apiSetting.dictPrompt ? apiSetting : null;
    }

    // 指定全局词典提示词时，用该提示词覆盖接口内置词典提示词。
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
  }, [aiDictApiSlug, aiDictPromptSlug, prompts, transApis]);
  const aiDictAvailable = Boolean(text?.trim() && aiDictApiSetting);

  useEffect(() => {
    if (hasUserChangedDictTabRef.current) {
      return;
    }

    // 默认词典可用时优先展示更快、更稳定的本地/在线词典；否则自动切到 AI 词典。
    if (defaultDictAvailable) {
      setDictTab("default");
      return;
    }

    if (aiDictAvailable) {
      setDictTab("ai");
    }
  }, [text, defaultDictAvailable, aiDictAvailable]);

  return (
    <Stack spacing={simpleStyle ? 1 : 2}>
      {/* 极简模式下不展示任何语言、服务商配置栏以及原始文本框 */}
      {!simpleStyle && (
        <>
          <Box>
            {/* 各类服务参数、语种设置下拉菜单网格 */}
            <Grid container spacing={2} columns={12}>
              {/* 多选框：允许同时勾选多个翻译引擎进行结果对比 */}
              <Grid item xs={xs} md={md}>
                <TextField
                  select
                  SelectProps={{
                    multiple: true,
                    MenuProps: { disablePortal: !isPlaygound },
                  }}
                  fullWidth
                  size="small"
                  value={activeApiSlugs}
                  name="apiSlugs"
                  label={i18n("translate_service_multiple")}
                  onChange={(e) => {
                    setHasUserChangedApiSlugs(true);
                    setApiSlugs(e.target.value);
                  }}
                >
                  {optApis.map(({ key, name }) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {/* 源语言 */}
              <Grid item xs={xs} md={md}>
                <TextField
                  select
                  SelectProps={{ MenuProps: { disablePortal: !isPlaygound } }}
                  fullWidth
                  size="small"
                  name="fromLang"
                  value={fromLang}
                  label={i18n("from_lang")}
                  onChange={(e) => {
                    setFromLang(e.target.value);
                  }}
                >
                  {OPT_LANGS_FROM.map(([lang, name]) => (
                    <MenuItem key={lang} value={lang}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {/* 目标语言 */}
              <Grid item xs={xs} md={md}>
                <TextField
                  select
                  SelectProps={{ MenuProps: { disablePortal: !isPlaygound } }}
                  fullWidth
                  size="small"
                  name="toLang"
                  value={toLang}
                  label={i18n("to_lang")}
                  onChange={(e) => {
                    setToLang(e.target.value);
                  }}
                >
                  {OPT_LANGS_TO.map(([lang, name]) => (
                    <MenuItem key={lang} value={lang}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* 如果是 Playground 设置测试环境，展示更丰富的参数调节滑块 */}
              {isPlaygound && (
                <>
                  {/* 第二备用目标语言 */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{
                        MenuProps: { disablePortal: !isPlaygound },
                      }}
                      fullWidth
                      size="small"
                      name="toLang2"
                      value={toLang2}
                      label={i18n("to_lang2")}
                      onChange={(e) => {
                        setToLang2(e.target.value);
                      }}
                    >
                      {OPT_LANGS_TO.map(([lang, name]) => (
                        <MenuItem key={lang} value={lang}>
                          {name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {/* 查词所用英语词典 */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{
                        MenuProps: { disablePortal: !isPlaygound },
                      }}
                      fullWidth
                      size="small"
                      name="enDict"
                      value={enDict}
                      label={i18n("english_dict")}
                      onChange={(e) => {
                        setEnDict(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_DICT_ALL.map((item) => (
                        <MenuItem value={item} key={item}>
                          {item}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {/* 输入建议联想服务 */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{
                        MenuProps: { disablePortal: !isPlaygound },
                      }}
                      fullWidth
                      size="small"
                      name="enSug"
                      value={enSug}
                      label={i18n("english_suggest")}
                      onChange={(e) => {
                        setEnSug(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_SUG_ALL.map((item) => (
                        <MenuItem value={item} key={item}>
                          {item}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {/* 语种检测引擎选择 */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{
                        MenuProps: { disablePortal: !isPlaygound },
                      }}
                      fullWidth
                      size="small"
                      name="langDetector"
                      value={langDetector}
                      label={i18n("detected_lang")}
                      onChange={(e) => {
                        setLangDetector(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_LANGDETECTOR_ALL.map((item) => (
                        <MenuItem value={item} key={item}>
                          {item}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {/* 语种检测的实时计算结果展示 (只读) */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      fullWidth
                      size="small"
                      name="deLang"
                      value={deLang && OPT_LANGS_MAP.get(deLang)}
                      label={i18n("detected_result")}
                      disabled
                      InputProps={{
                        startAdornment: deLoading ? (
                          <CircularProgress size={16} />
                        ) : null,
                      }}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </Box>

          {/* 原始文本输入区域 */}
          <Box>
            <TextField
              size="small"
              label={i18n("original_text")}
              fullWidth
              multiline
              inputRef={inputRef}
              minRows={isPlaygound ? 2 : 1}
              maxRows={10}
              sx={{
                "& textarea": {
                  resize: "vertical",
                },
              }}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
              }}
              onFocus={() => {
                setEditMode(true);
              }}
              // REVIEW: TextField 的 onBlur 会立即触发 setEditMode(false) 并提交数据，而 DoneIcon 的 onClick 也会执行相同逻辑。这会在点击提交按钮时产生多余重入。更关键的是，在某些系统或移动端环境下，onBlur 优先于 click 触发会使 EditMode 瞬间置为 false，导致 DoneIcon 被提早销毁而无法正常响应 onClick 事件。建议在图标按钮上改用 onMouseDown + preventDefault，或使用 onCommit 统一提交通道。
              onBlur={() => {
                setEditMode(false);
                setText(editText.trim());
              }}
              InputProps={{
                endAdornment: (
                  <Stack
                    direction="row"
                    sx={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                    }}
                  >
                    {editMode ? (
                      /* 编辑模式：显示提交勾选图标 */
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditMode(false);
                          setText(editText.trim());
                        }}
                        title={i18n("submit")}
                      >
                        <DoneIcon fontSize="inherit" />
                      </IconButton>
                    ) : text ? (
                      /* 有内容时：显示一键复制按钮 */
                      <CopyBtn text={text} title={i18n("copy")} />
                    ) : (
                      /* 无内容时：显示一键粘贴按钮 */
                      <IconButton
                        size="small"
                        onClick={handlePaste}
                        title={i18n("paste")}
                      >
                        <ContentPasteIcon fontSize="inherit" />
                      </IconButton>
                    )}
                  </Stack>
                ),
              }}
            />
          </Box>
        </>
      )}

      {/* ---------------- 翻译及释义面板的按需渲染分发 ---------------- */}
      {/* 1. 分别为每一个选定的翻译服务引擎渲染对应的 TranCont 内容翻译器 */}
      {activeApiSlugs.map((slug) => (
        <TranCont
          key={slug}
          text={text}
          fromLang={fromLang}
          toLang={realToLang}
          simpleStyle={simpleStyle}
          apiSlug={slug}
          transApis={transApis}
        />
      ))}

      {/* 2. 根据可用能力在默认词典与 AI 词典之间分流展示 */}
      {(defaultDictAvailable || aiDictAvailable) && (
        <Box>
          {aiDictAvailable ? (
            <>
              <Tabs
                value={defaultDictAvailable ? dictTab : "ai"}
                onChange={(_, value) => {
                  hasUserChangedDictTabRef.current = true;
                  setDictTab(value);
                }}
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
                    <DictCont text={text} enDict={enDict} />
                  )}
                  {isSingleChineseChar(text) && <Zdic text={text} />}
                </>
              )}
              {(!defaultDictAvailable || dictTab === "ai") && (
                <AiDictCont
                  text={text}
                  fromLang={fromLang}
                  speechLang={fromLang === "auto" ? deLang : fromLang}
                  toLang={realToLang}
                  apiSetting={aiDictApiSetting}
                  context={
                    // 只在段落上下文确实包含当前文本时传入，避免手动输入内容复用旧划词上下文。
                    selectionContext && selectionContext.includes(text)
                      ? selectionContext
                      : ""
                  }
                />
              )}
            </>
          ) : (
            <>
              {isWord && OPT_DICT_MAP.has(enDict) && (
                <DictCont text={text} enDict={enDict} />
              )}
              {isSingleChineseChar(text) && <Zdic text={text} />}
            </>
          )}
        </Box>
      )}

      {/* 3. 如果是合法的英文单词且启用了输入建议，渲染联想建议组件 */}
      {isWord && OPT_SUG_MAP.has(enSug) && (
        <SugCont text={text} enSug={enSug} />
      )}
    </Stack>
  );
}
