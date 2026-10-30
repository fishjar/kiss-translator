import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
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
  PROMPT_MODE_FOLLOW_API,
} from "../../config";
import {
  Fragment,
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import TranCont from "./TranCont";
import { BrowserTtsBtn } from "./AudioBtn";
import CopyBtn from "./CopyBtn";
import DictionaryPanels from "../../components/TranslationPanel/DictionaryPanels";
import { isValidWord } from "../../libs/utils";
import { logger } from "../../libs/log";
import { tryDetectLang } from "../../libs/detect";
import { isSameTranslationLanguage } from "../../libs/language";
import { createMenuKeyDownHandler } from "../../libs/menuFocus";
import { isShadowHostMoving } from "../../libs/shadowHost";
import { isApiAvailableFor } from "../../config/serviceSelection";
import TextareaResizeGrip from "../../components/TextareaResizeGrip";
import useTextareaHeightLock, {
  useTextareaGripStyle,
  useReleaseOnGripHidden,
} from "../../hooks/useTextareaHeightLock";

export const formatLanguageOptionName = (name) => {
  const parts = String(name || "")
    .split(" - ")
    .map((part) => part.trim());

  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return parts[0];
  }

  return parts.join(" - ");
};

const resolveActiveApiSlugs = (apiSlugs, optApis) => {
  if (apiSlugs === undefined || apiSlugs === null) {
    return optApis.slice(0, 1).map((api) => api.key);
  }

  const validSlugs = new Set(optApis.map((api) => api.key));
  return apiSlugs.filter((slug) => validSlugs.has(slug));
};

/**
 * Translation form with language and service choices, dictionaries, detection, and text input.
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
  scene,
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
  ttsApiSlug = "",
  prompts = [],
  selectionContext = "",
  selectionSource = null,
  isPlaygound = false,
  autoFocusInput = true,
  syncExternalTextWhileEditing = false,
  apiSlugsStorageKey = undefined,
  playgroundConfigHeader = null,
  playgroundConfigExtra = null,
  playgroundConfigExpanded = true,
  configActions = null,
  initialSettingsReady = true,
}) {
  const i18n = useI18n();

  // Keep the draft while focus moves between source and result controls.
  const [editMode, setEditMode] = useState(false);
  // Keep draft input until blur or submission updates the outer text state.
  const [editText, setEditText] = useState(text);
  const editTextRef = useRef(editText);
  // Source validity belongs to the selection snapshot, not to the current text.
  // This prevents a manually edited word from restoring its old source when the
  // draft is changed back to the selected text. External text synchronization
  // never calls invalidateFavoriteSource; a new snapshot resets the ref below.
  const favoriteSourceSnapshotRef = useRef(selectionSource);
  const favoriteSourceInvalidatedRef = useRef(false);
  const favoriteSourceSnapshotChanged =
    favoriteSourceSnapshotRef.current !== selectionSource;
  useLayoutEffect(() => {
    favoriteSourceSnapshotRef.current = selectionSource;
    favoriteSourceInvalidatedRef.current = false;
  }, [selectionSource]);
  const invalidateFavoriteSource = useCallback(() => {
    if (favoriteSourceSnapshotRef.current) {
      favoriteSourceInvalidatedRef.current = true;
    }
  }, []);
  const favoriteSource = useMemo(() => {
    const selectedText = String(selectionSource?.text || "").trim();
    const currentText = String(text || "").trim();
    const draftText = String(editText || "").trim();
    if (
      (!favoriteSourceSnapshotChanged &&
        favoriteSourceInvalidatedRef.current) ||
      !selectedText ||
      selectedText !== currentText ||
      draftText !== currentText
    ) {
      return null;
    }

    const sentence = String(selectionSource?.sentence || "").trim();
    const url = String(selectionSource?.url || "").trim();
    return sentence || url ? { sentence, url } : null;
  }, [editText, favoriteSourceSnapshotChanged, selectionSource, text]);
  const [requestRevision, setRequestRevision] = useState(0);
  const [apiSlugs, setApiSlugs] = useState(initApiSlugs);
  const [hasUserChangedApiSlugs, setHasUserChangedApiSlugs] = useState(false);
  const [fromLang, setFromLang] = useState(initFromLang);
  const [toLang, setToLang] = useState(initToLang);
  const [toLang2, setToLang2] = useState(initToLang2);
  const [langDetector, setLangDetector] = useState(initLangDetector);
  const [enDict, setEnDict] = useState(initEnDict);
  const [enSug, setEnSug] = useState(initEnSug);
  const initialSettingsAppliedRef = useRef(initialSettingsReady);
  // Bind detection results to their input and detector to ignore stale requests.
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
  const formRef = useRef(null);
  const focusedTextControlRef = useRef(null);
  const previousSimpleStyleRef = useRef(simpleStyle);
  const [isShadowMenu, setIsShadowMenu] = useState(false);
  const gripStyle = useTextareaGripStyle();
  const sourceHeightLock = useTextareaHeightLock(
    isPlaygound ? "tranform-source-playground" : "tranform-source"
  );
  useReleaseOnGripHidden(gripStyle, sourceHeightLock.releaseHeight);

  // 内容清空 → 彻底解锁：清除会话高度记忆并还原 root，手柄随内容门控
  // 消失；门控表达式的锁定分支保留（服务于「有内容且已锁」的存续态）。
  // useLayoutEffect：空内容解锁须先于绘制，防重挂载首帧以记忆高度闪现。
  // releaseHeight/textareaRef 经解构取稳定引用后进依赖数组：releaseHeight
  // 是 useCallback([lockKey]) 产物（lockKey 不变则引用恒定），textareaRef
  // 是 useRef 产物（身份恒定）——行为零变更，消除对 hook 返回对象整体的
  // exhaustive-deps 告警形态（发布面：CRA 下 warning 即构建失败）。
  const { textareaRef, releaseHeight } = sourceHeightLock;
  useLayoutEffect(() => {
    if (!editText.trim()) {
      releaseHeight();
    }
  }, [editText, releaseHeight]);
  const setInputRef = useCallback(
    (input) => {
      inputRef.current = input;
      textareaRef.current = input;
      setIsShadowMenu(Boolean(input?.getRootNode()?.host));
    },
    [textareaRef]
  );
  const selectMenuProps = useMemo(
    () => ({
      container: () => inputRef.current?.closest(".kt-m3-root"),
      disableScrollLock: true,
      // MUI's trap sees the shadow host as active and otherwise steals focus
      // from the selected option. Its normal focus restoration still applies.
      disableAutoFocus: isShadowMenu,
      disableEnforceFocus: isShadowMenu,
      MenuListProps: {
        onKeyDownCapture: createMenuKeyDownHandler({
          shadowOnly: true,
          disableListWrap: true,
        }),
      },
      sx: { zIndex: 2147483647 },
    }),
    [isShadowMenu]
  );

  const detectionKey = useMemo(
    () => `${langDetector}\u0000${text}`,
    [langDetector, text]
  );
  const hasCurrentDetection = detection.key === detectionKey;
  const deLang = hasCurrentDetection ? detection.lang : "";
  const deLoading =
    Boolean(text.trim()) && (!hasCurrentDetection || detection.loading);

  // The locked Playground can show local defaults before startup sync finishes.
  // Adopt the complete initial settings before the unlocked form paints.
  // Subsequent settings changes must preserve the user's choices.
  useLayoutEffect(() => {
    if (!initialSettingsReady || initialSettingsAppliedRef.current) return;
    initialSettingsAppliedRef.current = true;
    setFromLang(initFromLang);
    setToLang(initToLang);
    setToLang2(initToLang2);
    setLangDetector(initLangDetector);
    setEnDict(initEnDict);
    setEnSug(initEnSug);
  }, [
    initialSettingsReady,
    initFromLang,
    initToLang,
    initToLang2,
    initLangDetector,
    initEnDict,
    initEnSug,
  ]);

  // Focus the input at the end of its text when autofocus is enabled.
  // autoFocusInput may become true after asynchronous initialization.
  useEffect(() => {
    const expanded = previousSimpleStyleRef.current && !simpleStyle;
    previousSimpleStyleRef.current = simpleStyle;
    if (simpleStyle || (!autoFocusInput && !expanded)) return;

    const input = inputRef.current;
    if (!input) return;

    input.focus();

    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, [autoFocusInput, simpleStyle]);

  // Notify listeners, such as the vocabulary list, when selected or entered text is a valid English word.
  useEffect(() => {
    if (isValidWord(text)) {
      const event = new CustomEvent("kiss-add-word", {
        detail: { word: text },
      });
      document.dispatchEvent(event);
    }
  }, [text]);

  // Synchronize the selected APIs from the outer state.
  useEffect(() => {
    if (!hasUserChangedApiSlugs) {
      setApiSlugs(initApiSlugs);
    }
  }, [initApiSlugs, hasUserChangedApiSlugs]);

  useLayoutEffect(() => {
    editTextRef.current = editText;
  }, [editText]);

  // Commit external replacements before removed-control observers can submit a
  // draft from the same render. Hosts opt in for clipboard and selection updates.
  // lastSyncedTextRef records the text this effect last observed, so an
  // editMode transition alone (for example the one handlePaste triggers) no
  // longer clears a pasted draft: only a genuine external text change, or
  // leaving edit mode, may resync the draft to the committed text.
  // lastSyncedEditingRef records the previous value of the sync option so
  // a false→true transition mid-edit counts as a fresh sync trigger (host
  // text overwrites the draft) without losing the editMode-only protection
  // that still applies when the option is not enabled or stable.
  const lastSyncedTextRef = useRef(text);
  const lastSyncedEditingRef = useRef(syncExternalTextWhileEditing);
  useLayoutEffect(() => {
    const syncOptionJustEnabled =
      syncExternalTextWhileEditing && !lastSyncedEditingRef.current;
    lastSyncedEditingRef.current = syncExternalTextWhileEditing;
    if (
      lastSyncedTextRef.current === text &&
      editMode &&
      !syncOptionJustEnabled
    ) {
      return;
    }
    lastSyncedTextRef.current = text;
    if (syncExternalTextWhileEditing || !editMode) {
      editTextRef.current = text;
      setEditText(text);
    }
  }, [text, editMode, syncExternalTextWhileEditing]);

  // Detect the language asynchronously when text or settings change.
  useEffect(() => {
    let active = true;
    if (!text.trim()) {
      setDetection({ key: detectionKey, lang: "", loading: false });
      return () => {
        active = false;
      };
    }

    setDetection({ key: detectionKey, lang: "", loading: true });
    void (async () => {
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
        if (active) {
          logger.child("tran-form").warn("tranbox: detect lang", err);
          setDetection({ key: detectionKey, lang: "", loading: false });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [text, langDetector, detectionKey]);

  // Paste into the visible draft without translating until the user submits.
  const handlePaste = async () => {
    try {
      const pastedText = (await navigator.clipboard.readText()).trim();
      if (!pastedText) return;
      if (pastedText !== editTextRef.current) {
        invalidateFavoriteSource();
      }
      setEditText(pastedText);
      setEditMode(true);
      inputRef.current?.focus({ preventScroll: true });
    } catch (err) {
      // Clipboard access is optional; leave the current draft unchanged.
    }
  };

  // Use the secondary target when the detected source matches the primary target.
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

  // Keep only enabled translation providers.
  const optApis = useMemo(
    () =>
      transApis
        .filter((api) => isApiAvailableFor(api, "translate"))
        .map((api) => ({
          key: api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [transApis]
  );

  const xs = useMemo(() => (isPlaygound ? 6 : 4), [isPlaygound]);
  const md = useMemo(() => (isPlaygound ? 3 : 4), [isPlaygound]);

  const activeApiSlugs = useMemo(
    () => resolveActiveApiSlugs(apiSlugs, optApis),
    [apiSlugs, optApis]
  );
  const dictionaryTranslationApi = useMemo(
    () => transApis.find((api) => api.apiSlug === activeApiSlugs[0]) || null,
    [transApis, activeApiSlugs]
  );

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

  // Dictionary availability now lives in DictionaryPanels alone; the source row
  // no longer gates the read-aloud icon on it.

  const commitEditText = useCallback(() => {
    setEditMode(false);
    setText(editTextRef.current.trim());
  }, [setText]);

  useLayoutEffect(() => {
    if (!editMode) return;
    const form = formRef.current;
    const commitRemovedControl = () => {
      const control = focusedTextControlRef.current;
      if (control && !form.contains(control)) {
        focusedTextControlRef.current = null;
        commitEditText();
      }
    };
    // Removing a focused action does not emit blur. Results can remove their
    // actions after streaming ends without rerendering this form.
    commitRemovedControl();
    const observer = new MutationObserver(commitRemovedControl);
    observer.observe(form, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [editMode, commitEditText]);

  const submitAndBlur = (event) => {
    event.stopPropagation();
    const input = inputRef.current;
    // A focused input commits through blur, including inside a shadow root.
    // Otherwise commit directly so pointer submissions update the text once.
    if (input && input.getRootNode().activeElement === input) {
      input.blur();
    } else {
      commitEditText();
    }
    setRequestRevision((revision) => revision + 1);
  };

  const preserveSourceFocus = useCallback((event) => {
    const input = inputRef.current;
    // Result actions use the current translation without submitting a draft.
    // Preserve pointer focus without preventing keyboard navigation.
    if (
      event.button === 0 &&
      event.target.closest("button") &&
      input?.ownerDocument.hasFocus() &&
      input?.getRootNode().activeElement === input
    ) {
      event.preventDefault();
    }
  }, []);

  const ConfigContainer = isPlaygound ? Collapse : Fragment;
  const translationResults = activeApiSlugs.map((slug) => (
    <TranCont
      scene={scene}
      ttsApiSlug={ttsApiSlug}
      key={slug}
      text={translationText}
      fromLang={fromLang}
      toLang={realToLang}
      simpleStyle={simpleStyle}
      apiSlug={slug}
      transApis={transApis}
      isPlayground={isPlaygound}
      translateVariants={translateVariants}
      parseLatex={parseLatex}
      detectedLang={deLang}
      sourceDetectionPending={fromLang === "auto" && deLoading}
      requestRevision={requestRevision}
      onActionPointerDown={preserveSourceFocus}
    />
  ));
  return (
    <Stack
      ref={formRef}
      className={isPlaygound ? "kt-playground-translator" : undefined}
      spacing={simpleStyle ? 1 : 2}
      useFlexGap={isPlaygound}
      onFocusCapture={(event) => {
        const control = event.target.closest?.(
          ".kt-translation-source, .kt-translation-result"
        );
        focusedTextControlRef.current =
          control && event.currentTarget.contains(control)
            ? event.target
            : null;
      }}
      onBlur={(event) => {
        if (!editMode || isShadowHostMoving(event.target)) return;
        const textControls = ".kt-translation-source, .kt-translation-result";
        const current = event.target.closest?.(textControls);
        const next = event.relatedTarget?.closest?.(textControls);
        // Tab can reach the old result's copy/speech controls before submitting.
        // Leaving this form's text controls still commits through normal blur.
        if (
          current &&
          event.currentTarget.contains(current) &&
          (!next || !event.currentTarget.contains(next))
        ) {
          commitEditText();
        }
      }}
    >
      {/* Keep actions mounted so collapsing the form preserves keyboard focus. */}
      {(!simpleStyle || configActions) && (
        <Box
          className={
            simpleStyle
              ? "kt-translation-config-actions"
              : isPlaygound
                ? "kt-playground-config"
                : configActions
                  ? "kt-translation-config-row"
                  : undefined
          }
        >
          {!simpleStyle && (
            <>
              {isPlaygound && playgroundConfigHeader}
              <ConfigContainer
                {...(isPlaygound
                  ? {
                      in: playgroundConfigExpanded,
                      id: "kt-playground-config-content",
                    }
                  : {})}
              >
                {/* Service and language settings grid. */}
                <Grid
                  className={
                    isPlaygound
                      ? "kt-playground-config__grid"
                      : "kt-translation-config"
                  }
                  container
                  spacing={2}
                  columns={12}
                >
                  {/* Select multiple translation engines to compare their results. */}
                  <Grid
                    className={
                      isPlaygound
                        ? "kt-playground-config__service"
                        : "kt-translation-config__service"
                    }
                    item
                    xs={xs}
                    md={md}
                  >
                    <TextField
                      select
                      SelectProps={{
                        multiple: true,
                        MenuProps: selectMenuProps,
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
                          writeStoredApiChoice(
                            apiSlugsStorageKey,
                            e.target.value
                          );
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
                  {/* Source language. */}
                  <Grid
                    className={
                      isPlaygound
                        ? undefined
                        : "kt-translation-config__language"
                    }
                    item
                    xs={xs}
                    md={md}
                  >
                    <TextField
                      select
                      SelectProps={{ MenuProps: selectMenuProps }}
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
                  {/* Target language. */}
                  <Grid
                    className={
                      isPlaygound
                        ? undefined
                        : "kt-translation-config__language"
                    }
                    item
                    xs={xs}
                    md={md}
                  >
                    <TextField
                      select
                      SelectProps={{ MenuProps: selectMenuProps }}
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

                  {/* Show additional configuration controls in the Playground. */}
                  {isPlaygound && (
                    <>
                      {/* Secondary target language. */}
                      <Grid item xs={xs} md={md}>
                        <TextField
                          select
                          SelectProps={{ MenuProps: selectMenuProps }}
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
                      {/* English dictionary service. */}
                      <Grid item xs={xs} md={md}>
                        <TextField
                          select
                          SelectProps={{ MenuProps: selectMenuProps }}
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
                      {/* Input suggestion service. */}
                      <Grid item xs={xs} md={md}>
                        <TextField
                          select
                          SelectProps={{ MenuProps: selectMenuProps }}
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
                      {/* Language detection engine. */}
                      <Grid item xs={xs} md={md}>
                        <TextField
                          select
                          SelectProps={{ MenuProps: selectMenuProps }}
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
                      {/* Read-only language detection result. */}
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
                          inputProps={{ "aria-busy": deLoading }}
                          InputProps={{
                            readOnly: true,
                            startAdornment: deLoading ? (
                              <Box
                                sx={{
                                  width: 16,
                                  height: 16,
                                  display: "grid",
                                  placeItems: "center",
                                }}
                              >
                                <CircularProgress
                                  size={16}
                                  aria-label={i18n("detected_lang")}
                                />
                              </Box>
                            ) : null,
                          }}
                        />
                      </Grid>
                    </>
                  )}
                </Grid>
                {isPlaygound && playgroundConfigExtra}
              </ConfigContainer>
            </>
          )}
          {configActions}
        </Box>
      )}
      {/* Hide the source input in simple mode. */}
      {!simpleStyle && (
        <>
          {/* Source text input. */}
          <Box
            className={
              isPlaygound ? "kt-playground-translator__source" : undefined
            }
          >
            <TextField
              className={`kt-translation-source ${
                isPlaygound
                  ? "kt-resizable-text-field kt-translation-text-field kt-translation-text-field--source"
                  : "kt-resizable-text-field"
              }`}
              size="small"
              label={i18n("original_text")}
              InputLabelProps={isPlaygound ? { shrink: true } : undefined}
              fullWidth
              multiline
              inputRef={setInputRef}
              minRows={isPlaygound ? 4 : 1}
              maxRows={10}
              inputProps={{
                className: "kt-resizable-textarea",
                style: {
                  resize: gripStyle === "hidden" ? "vertical" : "none",
                  ...(isPlaygound
                    ? {}
                    : { boxSizing: "border-box", paddingInlineEnd: 16 }),
                },
              }}
              sx={{
                "& .MuiInputBase-root": {
                  overflow: "visible",
                },
              }}
              value={editText}
              onChange={(e) => {
                invalidateFavoriteSource();
                setEditText(e.target.value);
              }}
              onFocus={() => {
                setEditMode(true);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!event.repeat && editText.trim()) submitAndBlur(event);
                }
              }}
              InputProps={{
                ...sourceHeightLock.rootProps,
                endAdornment: (
                  <>
                    <Stack
                      className={
                        isPlaygound
                          ? "kt-translation-text-field__actions"
                          : undefined
                      }
                      direction="row"
                      onPointerDown={preserveSourceFocus}
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
                      {!editText.trim() ? (
                        <IconButton
                          size="small"
                          onClick={handlePaste}
                          title={i18n("paste")}
                          aria-label={i18n("paste")}
                        >
                          <ContentPasteIcon fontSize="inherit" />
                        </IconButton>
                      ) : editMode ? (
                        <IconButton
                          size="small"
                          onClick={submitAndBlur}
                          title={i18n("submit")}
                          aria-label={i18n("submit")}
                        >
                          <DoneIcon fontSize="inherit" />
                        </IconButton>
                      ) : (
                        <CopyBtn
                          text={text}
                          title={i18n("copy")}
                          copiedLabel={i18n("copy_success", "Copied")}
                        />
                      )}
                      {Boolean(editText.trim()) && (
                        <BrowserTtsBtn
                          serviceId={ttsApiSlug}
                          text={editText}
                          lang={
                            fromLang === "auto" ? deLang || "en-US" : fromLang
                          }
                          title={i18n("read_source_aloud")}
                          stopTitle={i18n("stop_speaking")}
                        />
                      )}
                    </Stack>
                    {(editText.trim() ||
                      sourceHeightLock.lockedHeight != null) && (
                      <TextareaResizeGrip
                        target={sourceHeightLock.textareaRef}
                        onResize={sourceHeightLock.applyHeight}
                        value={sourceHeightLock.lockedHeight}
                        label={i18n("field_resize_height")}
                        variant={gripStyle}
                        onRelease={sourceHeightLock.releaseHeight}
                        unlockHint={i18n("field_resize_unlock_hint")}
                      />
                    )}
                  </>
                ),
              }}
            />
          </Box>
        </>
      )}

      {/* Translation and definition panels. */}
      {/* 1. Render a TranCont result for each selected translation service. */}
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

      {/* 2 and 3. Dictionary, Chinese character dictionary and suggestions. */}
      <DictionaryPanels
        text={text}
        enDict={enDict}
        enSug={enSug}
        fromLang={fromLang}
        toLang={realToLang}
        detectedLang={deLang}
        transApis={transApis}
        prompts={prompts}
        aiDictApiSlug={aiDictApiSlug}
        aiDictPromptSlug={aiDictPromptSlug}
        requestRevision={requestRevision}
        source={favoriteSource}
        context={selectionContext}
        ttsApiSlug={ttsApiSlug}
        translateVariants={translateVariants}
        dictionaryTranslationApi={dictionaryTranslationApi}
        isPlayground={isPlaygound}
      />
    </Stack>
  );
}
