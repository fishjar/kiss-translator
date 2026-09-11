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
import { useState, useMemo, useEffect, useRef, useId } from "react";
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
import {
  ResizeHandle,
  usePrefersReducedMotion,
  CONTROL_HEIGHT,
  CONTROL_CENTER_FROM_RIGHT,
  NOTCH_STRIP_HEIGHT,
  NOTCH_HORIZONTAL_PAD,
} from "../../components/ResizeHandle";
import { useTextareaResize } from "../../components/useTextareaResize";
import { useFocusClosingGate } from "../../components/useFocusClosingGate";

// 控件嵌入边框的共享定位常量（转发导出，供测试与其他调用点从本组件导入）
export {
  CONTROL_HEIGHT,
  CONTROL_CENTER_FROM_RIGHT,
  NOTCH_STRIP_HEIGHT,
  NOTCH_HORIZONTAL_PAD,
} from "../../components/ResizeHandle";

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
  parseLatex = false,
  enDict: initEnDict = "-",
  enSug: initEnSug = "-",
  aiDictApiSlug = "-",
  aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
  prompts = [],
  selectionContext = "",
  isPlaygound = false,
  autoFocusInput = true,
  syncExternalTextWhileEditing = false,
}) {
  const i18n = useI18n();
  const prefersReducedMotion = usePrefersReducedMotion();

  // 当前是否处于文本框获取焦点的编辑提交模式
  const [editMode, setEditMode] = useState(false);
  // 输入框中临时编辑的文本，在失焦或点击提交时同步至外层全局 text 状态
  const [editText, setEditText] = useState(text);
  const editTextRef = useRef(editText);
  editTextRef.current = editText;

  // 唯一焦点退出 gate：TranForm / TranCont 共享的状态机，
  // 负责 focus-gating（focused）与 120ms 退出过渡（closing）。
  const {
    focused: originalFocused,
    closing,
    handleFocus: handleFieldFocus,
    handleBlur: handleFieldBlur,
  } = useFocusClosingGate({
    prefersReducedMotion,
    onTrueBlur: () => {
      // 提交语义立即生效：真正离开字段时提交当前编辑内容
      setText(editTextRef.current.trim());
    },
    onClosingEnd: () => {
      // 退出动画到期后 editMode 归位
      setEditMode(false);
    },
  });

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
  // 将检测结果与输入文本/检测器绑定，避免旧请求晚到后覆盖新文本的语种。
  const [detection, setDetection] = useState({
    key: "",
    lang: "",
    loading: false,
  });
  const inputRef = useRef(null);
  const fieldId = useId();
  // 原文文本框自定义高度：null 表示仍由 MUI TextareaAutosize 自动测量，
  // 用户首次拖动后切换为受控高度，后续内容变化不会覆盖用户调整的尺寸。
  const [resizeHeight, setResizeHeight] = useState(null);
  // 拖动高度 → TextField 的 minRows/maxRows/根节点高度样式（共享 hook）：
  // 未拖动时保持自动测量（minRows 随 Playgound 形态、maxRows=10 限制上限），
  // 拖动后全部释放量化，由像素高度驱动。
  const { minRows, maxRows, rootStyle } = useTextareaResize(
    resizeHeight,
    isPlaygound ? 2 : 1
  );
  const originalBoxRef = useRef(null);
  const showOriginalControls = originalFocused || closing;

  const detectionKey = useMemo(
    () => `${langDetector}\u0000${text}`,
    [langDetector, text]
  );
  const hasCurrentDetection = detection.key === detectionKey;
  const deLang = hasCurrentDetection ? detection.lang : "";
  const deLoading =
    Boolean(text.trim()) && (!hasCurrentDetection || detection.loading);

  // 允许自动聚焦时，将输入框聚焦并把光标定位在文本尾部。
  // autoFocusInput 可在异步初始化完成后由 false 切换为 true。
  useEffect(() => {
    if (!autoFocusInput) return;

    const input = inputRef.current;
    if (!input) return;

    input.focus();

    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, [autoFocusInput]);

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

  // 默认仅在非编辑态同步外部文本；主动文本翻译面板可选择让剪贴板更新覆盖临时编辑值。
  useEffect(() => {
    if (syncExternalTextWhileEditing || !editMode) {
      setEditText(text);
    }
  }, [text, editMode, syncExternalTextWhileEditing]);

  // 文本改变或配置切换时，发起异步语种检测
  useEffect(() => {
    let active = true;
    if (!text.trim()) {
      setDetection({ key: detectionKey, lang: "", loading: false });
      return () => {
        active = false;
      };
    }

    setDetection({ key: detectionKey, lang: "", loading: true });
    (async () => {
      try {
        const detectedLang = await tryDetectLang(text, langDetector);
        if (active) {
          setDetection({
            key: detectionKey,
            lang: detectedLang || "",
            loading: false,
          });
        }
      } catch (err) {
        kissLog("tranbox: detect lang", err);
        if (active) {
          setDetection({ key: detectionKey, lang: "", loading: false });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [text, langDetector, detectionKey]);

  // 从剪贴板粘贴文本到翻译框
  const handlePaste = async () => {
    // 剪贴板能力守卫：非安全上下文或未实现 readText 的环境直接降级为
    // 无操作；不依赖异常流作为正常路径。
    if (typeof navigator.clipboard?.readText !== "function") {
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      setText(text.trim());
      // 粘贴的内容立即成为当前编辑值并恢复编辑/提交态：粘贴动作等价于
      // 手动输入，rail 应切回 Done 提交，而非停留在空态粘贴按钮上。
      setEditText(text.trim());
      setEditMode(true);
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

          {/* 原始文本输入区域：onBlur 挂在包装层（焦点保活见 handleFieldBlur） */}
          <Box
            ref={originalBoxRef}
            sx={{ position: "relative" }}
            onBlur={handleFieldBlur}
          >
            <TextField
              id={fieldId}
              size="small"
              label={i18n("original_text")}
              fullWidth
              multiline
              inputRef={inputRef}
              minRows={minRows}
              maxRows={maxRows}
              sx={{
                "& textarea:not([aria-hidden='true'])": {
                  boxSizing: "border-box",
                  maxHeight: "100%",
                  resize: "none",
                  ...(resizeHeight != null
                    ? { overflow: "auto !important" }
                    : {}),
                },
              }}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                // 打字即进入编辑态：提交后焦点仍保留在 textarea，
                // 继续输入必须恢复 Done 提交态
                setEditMode(true);
              }}
              onFocus={() => {
                handleFieldFocus();
                setEditMode(true);
              }}
              InputProps={{
                style: {
                  paddingRight: 14,
                  ...(rootStyle || {}),
                },
              }}
            />
            {/* 覆盖层：与可能设置 overflow-y: auto 的输入根节点同级，避免滚动裁切
                控件（rail / 六点手柄 / 两处 notch 不再位于滚动根节点内部），
                也避免滚动时覆盖层随内容滚走。几何相对本包装层，
                其外框与输入根节点完全重合。 */}
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
              }}
            >
              {/* 右上角操作区：聚焦显示（编辑态提交，有内容非编辑复制，空态粘贴）；失焦播放退出动画后卸载 */}
              {showOriginalControls && (
                <>
                  {/* Notch 遮罩条：覆盖顶边框线段，形成 notch 效果 */}
                  <Box
                    data-testid="tranform-rail-notch"
                    style={{
                      position: "absolute",
                      right:
                        CONTROL_CENTER_FROM_RIGHT -
                        CONTROL_HEIGHT / 2 -
                        NOTCH_HORIZONTAL_PAD,
                      top: -Math.round(NOTCH_STRIP_HEIGHT / 2),
                      width: CONTROL_HEIGHT + NOTCH_HORIZONTAL_PAD * 2,
                      height: NOTCH_STRIP_HEIGHT,
                    }}
                    sx={{
                      backgroundColor: "background.paper",
                      zIndex: 1,
                      // 与 rail 统一为同一套 opacity + visibility 过渡（120ms）
                      opacity: closing ? 0 : 1,
                      visibility: closing ? "hidden" : "visible",
                      transition: prefersReducedMotion
                        ? "none"
                        : "opacity 120ms ease, visibility 120ms ease",
                    }}
                  />
                  <Stack
                    direction="row"
                    data-testid="tranform-rail"
                    style={{
                      position: "absolute",
                      right: CONTROL_CENTER_FROM_RIGHT - CONTROL_HEIGHT / 2,
                      top: -Math.round(CONTROL_HEIGHT / 2),
                      // 进入态保持 auto 以便命中；closing 期间屏蔽点击，防止残留按钮被触发
                      pointerEvents: closing ? "none" : "auto",
                    }}
                    sx={{
                      zIndex: 2,
                      // 与边框变色 / 缩放手柄统一为同一套 opacity + visibility 过渡（120ms）
                      opacity: closing ? 0 : 1,
                      visibility: closing ? "hidden" : "visible",
                      transition: prefersReducedMotion
                        ? "none"
                        : "opacity 120ms ease, visibility 120ms ease",
                    }}
                  >
                    {editText.trim() ? (
                      editMode ? (
                        /* 编辑模式：显示提交勾选图标 */
                        <IconButton
                          size="small"
                          aria-label={i18n("submit")}
                          // 鼠标按下时阻止默认行为，避免 textarea 先失焦卸载按钮，保证 onClick 正常触发
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditMode(false);
                            setText(editText.trim());
                          }}
                          title={i18n("submit")}
                        >
                          <DoneIcon fontSize="inherit" />
                        </IconButton>
                      ) : (
                        /* 有内容且非编辑态：显示一键复制按钮（复制当前编辑缓冲，
                           聚焦后未提交的改动同样被复制） */
                        <CopyBtn text={editText} title={i18n("copy")} />
                      )
                    ) : (
                      /* 空缓冲：显示一键粘贴按钮（同样阻止 mousedown 失焦） */
                      <IconButton
                        size="small"
                        aria-label={i18n("paste")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handlePaste}
                        title={i18n("paste")}
                      >
                        <ContentPasteIcon fontSize="inherit" />
                      </IconButton>
                    )}
                  </Stack>
                </>
              )}
              {/* 右下角纵向缩放手柄：内容门控依据当前编辑值 editText.trim()（而非
                  已提交的 text），空框输入立即可调、清空已有内容立即隐藏；
                  已有手动高度（resizeHeight）本身也构成显示手柄的理由——
                  清空内容后手柄常驻，可拖回最小完成复位。 */}
              <ResizeHandle
                visible={Boolean(
                  (originalFocused || closing) &&
                    (editText.trim() || resizeHeight != null)
                )}
                closing={closing}
                height={resizeHeight}
                containerRef={originalBoxRef}
                onHeightChange={setResizeHeight}
                prefersReducedMotion={prefersReducedMotion}
                controlsId={fieldId}
                title={i18n("field_resize_height")}
                ariaLabel={i18n("field_resize_height")}
                testId="tranform-resize-handle"
                notchTestId="tranform-resize-notch"
              />
            </Box>
          </Box>
        </>
      )}

      {/* ---------------- 翻译及释义面板的按需渲染分发 ---------------- */}
      {/* 1. 分别为每一个选定的翻译服务引擎渲染对应的 TranCont 内容翻译器 */}
      {activeApiSlugs.map((slug) => (
        <TranCont
          key={slug}
          text={translationText}
          fromLang={fromLang}
          toLang={realToLang}
          simpleStyle={simpleStyle}
          apiSlug={slug}
          transApis={transApis}
          translateVariants={translateVariants}
          parseLatex={parseLatex}
          detectedLang={deLang}
          sourceDetectionPending={fromLang === "auto" && deLoading}
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
