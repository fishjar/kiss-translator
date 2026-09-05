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

/**
 * 翻译交互核心表单组件 (集成源/目标语言选择、多引擎翻译、词典展示、汉典展示、语言检测与文本输入)
 */

// ─── 接口多选本地持久化（可选）───────────────────────────────────────────────
// 仅当宿主显式传入 apiSlugsStorageKey 时启用（Playground 等），普通 Selection/TranForm
// 不传 key 时行为完全不变。读取/写入全程异常降级：localStorage 不可用、脏 JSON、
// 非数组、非字符串元素都视为"无可恢复值"，回落既有默认逻辑。
// 有效存储的 [] 表示用户显式未选择接口（合法状态）；过滤后没有任何有效 slug 且非
// 显式空选择则视为无可恢复值，走默认逻辑。
function readStoredApiChoice(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return { status: "none" };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { status: "none" };
    if (parsed.some((slug) => typeof slug !== "string")) {
      return { status: "none" };
    }
    // 去重：重复 slug 视为同一选择。
    const slugs = [...new Set(parsed)];
    return { status: "restored", slugs, isEmpty: slugs.length === 0 };
  } catch {
    return { status: "none" };
  }
}

function writeStoredApiChoice(storageKey, slugs) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(slugs));
  } catch {
    // localStorage 不可用：静默降级，仅丢失跨刷新留存，不影响页面使用。
  }
}

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
  autoFocusInput = true,
  syncExternalTextWhileEditing = false,
  apiSlugsStorageKey = undefined,
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
  // 将检测结果与输入文本/检测器绑定，避免旧请求晚到后覆盖新文本的语种。
  const [detection, setDetection] = useState({
    key: "",
    lang: "",
    loading: false,
  });
  const inputRef = useRef(null);
  // 待恢复的本地持久化接口选择（对应当前 storageKey 渲染期只读一次）。
  // 哨兵语义：undefined = 未初始化（渲染期读取一次的唯一时机）；null = 已处理。
  // 处理终态置 null 而非 undefined，避免渲染期读取条件被终态重新武装——否则
  // 每个处理周期确定性重读 localStorage，且后续 effect 会携带陈旧快照再次执行
  // 恢复分支，回退用户在窗口期内做出的选择。
  const pendingApiSlugsRestoreRef = useRef(undefined);
  if (apiSlugsStorageKey && pendingApiSlugsRestoreRef.current === undefined) {
    pendingApiSlugsRestoreRef.current = readStoredApiChoice(apiSlugsStorageKey);
  }

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

  // 本地持久化接口选择恢复（apiSlugsStorageKey 可选）。
  // 在 initApiSlugs 同步 effect 之后声明，保证恢复值胜出且标记为用户选择（不再被外部 prop 覆盖）。
  // 异步 transApis 尚未就绪（optApis 为空）时保持 pending，待其到达后重新过滤恢复。
  useEffect(() => {
    const pending = pendingApiSlugsRestoreRef.current;
    if (!pending) return; // 无 key / 非 Playground 宿主：保持既有行为
    if (pending.status === "none") {
      pendingApiSlugsRestoreRef.current = null; // 无可恢复值：回落默认逻辑
      return;
    }
    if (optApis.length === 0) return; // 等异步 transApis 到达后再过滤
    pendingApiSlugsRestoreRef.current = null;

    const validSlugs = new Set(optApis.map((api) => api.key));
    const filtered = pending.slugs.filter((slug) => validSlugs.has(slug));

    if (pending.isEmpty) {
      // 有效存储 [] = 用户显式未选择接口：保持空选择，不被默认值覆盖
      setHasUserChangedApiSlugs(true);
      setApiSlugs([]);
    } else if (filtered.length > 0) {
      // 恢复仍在启用的有效接口
      setHasUserChangedApiSlugs(true);
      setApiSlugs(filtered);
    }
    // 过滤后无有效 slug 且非显式空选择 → 无可恢复值，走既有默认逻辑
    // (optional chaining safe; deps: optApis only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optApis]);

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
                    // 仅在宿主显式提供 storageKey 时写回（空数组 = 用户显式清空）。
                    if (apiSlugsStorageKey) {
                      writeStoredApiChoice(apiSlugsStorageKey, e.target.value);
                    }
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
          text={translationText}
          fromLang={fromLang}
          toLang={realToLang}
          simpleStyle={simpleStyle}
          apiSlug={slug}
          transApis={transApis}
          translateVariants={translateVariants}
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
