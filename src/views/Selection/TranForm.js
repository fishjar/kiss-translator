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
import { isSameTranslationLanguage } from "../../libs/language";

export const formatLanguageOptionName = (name) => {
  const parts = String(name || "")
    .split(" - ")
    .map((part) => part.trim());

  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return parts[0];
  }

  return parts.join(" - ");
};

/**
 * 翻译交互核心表单组件 (集成源/目标语言选择、多引擎翻译、词典展示、汉典展示、语言检测与文本输入)
 */
export default function TranForm({
  text,
  setText,
  translationText = text,
  apiSlugs: initApiSlugs,
  fromLang: initFromLang,
  toLang: initToLang,
  toLang2: initToLang2,
  transApis,
  simpleStyle = false,
  langDetector: initLangDetector = "-",
  translateVariants = true,
  enDict: initEnDict = "-",
  enSug: initEnSug = "-",
  aiDictApiSlug = "-",
  aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
  prompts = [],
  selectionContext = "",
  isPlaygound = false,
  playgroundConfigHeader = null,
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
      isSameTranslationLanguage(deLang, toLang, translateVariants)
    ) {
      return toLang2;
    }

    return toLang;
  }, [fromLang, toLang, toLang2, deLang, translateVariants]);

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

  const commitEditText = () => {
    setEditMode(false);
    setText(editText.trim());
  };

  const translationResults = activeApiSlugs.map((slug) => (
    <TranCont
      key={slug}
      text={translationText}
      fromLang={fromLang}
      toLang={realToLang}
      simpleStyle={simpleStyle}
      apiSlug={slug}
      transApis={transApis}
      isPlayground={isPlaygound}
      translateVariants={translateVariants}
    />
  ));

  return (
    <Stack
      className={isPlaygound ? "kt-playground-translator" : undefined}
      spacing={simpleStyle ? 1 : 2}
      useFlexGap={isPlaygound}
    >
      {/* 极简模式下不展示任何语言、服务商配置栏以及原始文本框 */}
      {!simpleStyle && (
        <>
          <Box className={isPlaygound ? "kt-playground-config" : undefined}>
            {isPlaygound && playgroundConfigHeader}
            {/* 各类服务参数、语种设置下拉菜单网格 */}
            <Grid
              className={isPlaygound ? "kt-playground-config__grid" : undefined}
              container
              spacing={2}
              columns={12}
            >
              {/* 多选框：允许同时勾选多个翻译引擎进行结果对比 */}
              <Grid
                className={
                  isPlaygound ? "kt-playground-config__service" : undefined
                }
                item
                xs={xs}
                md={md}
              >
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
                      {formatLanguageOptionName(name)}
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
                      {formatLanguageOptionName(name)}
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
                          {formatLanguageOptionName(name)}
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
                      value={
                        deLang &&
                        formatLanguageOptionName(OPT_LANGS_MAP.get(deLang))
                      }
                      label={i18n("detected_result")}
                      placeholder="—"
                      InputLabelProps={{ shrink: true }}
                      InputProps={{
                        readOnly: true,
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
          <Box
            className={
              isPlaygound ? "kt-playground-translator__source" : undefined
            }
          >
            <TextField
              className={
                isPlaygound
                  ? "kt-translation-text-field kt-translation-text-field--source"
                  : undefined
              }
              size="small"
              label={i18n("original_text")}
              InputLabelProps={isPlaygound ? { shrink: true } : undefined}
              fullWidth
              multiline
              inputRef={inputRef}
              minRows={isPlaygound ? 4 : 1}
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
              onBlur={commitEditText}
              InputProps={{
                endAdornment: (
                  <Stack
                    className={
                      isPlaygound
                        ? "kt-translation-text-field__actions"
                        : undefined
                    }
                    direction="row"
                    sx={
                      isPlaygound
                        ? undefined
                        : {
                            position: "absolute",
                            right: 0,
                            top: 0,
                          }
                    }
                  >
                    {editMode && editText !== text ? (
                      /* 编辑模式：显示提交勾选图标 */
                      <IconButton
                        size="small"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (document.activeElement === inputRef.current) {
                            inputRef.current.blur();
                          } else {
                            commitEditText();
                          }
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
      {isPlaygound ? (
        <Stack
          className="kt-playground-translator__results"
          spacing={2}
          useFlexGap
        >
          {translationResults.length > 0 ? (
            translationResults
          ) : (
            <Box className="kt-playground-translator__empty" role="status">
              {i18n(
                "playground_translation_select_service",
                "请先选择至少一个可用的翻译服务"
              )}
            </Box>
          )}
        </Stack>
      ) : (
        translationResults
      )}

      {/* 2. 根据可用能力在默认词典与 AI 词典之间分流展示 */}
      {(defaultDictAvailable || aiDictAvailable) && (
        <Box
          className={
            isPlaygound ? "kt-playground-translator__auxiliary" : undefined
          }
        >
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
      {isWord &&
        OPT_SUG_MAP.has(enSug) &&
        (isPlaygound ? (
          <Box className="kt-playground-translator__auxiliary">
            <SugCont text={text} enSug={enSug} />
          </Box>
        ) : (
          <SugCont text={text} enSug={enSug} />
        ))}
    </Stack>
  );
}
