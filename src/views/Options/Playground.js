import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import TranForm from "../Selection/TranForm";
import SubtitleSegmentationPlayground from "./SubtitleSegmentationPlayground";
import TerminologyPlayground from "./TerminologyPlayground";
import {
  DEFAULT_SETTING,
  DEFAULT_TRANBOX_SETTING,
  resolveApiPromptList,
} from "../../config";
import { useSetting } from "../../hooks/Setting";
import { useI18n } from "../../hooks/I18n";
import { debounce } from "../../libs/utils";

// localStorage 持久化键必须保持模块级：组件体内声明的键会被下方 useMemo 闭包
// 与卸载 cleanup 引用而触发 react-hooks/exhaustive-deps 警告（lint 以
// --max-warnings=0 作门禁），不得下移回组件体。
const LS_TERMS_KEY = "kt-playground-terms-draft";
const LS_AITERMS_KEY = "kt-playground-aiterms-draft";
// 例句轮换 seed 的持久化键（刷新后轮换状态不丢失，M3）。
const LS_TERM_SEED_KEY = "kt-playground-term-seed";
// 双 Tab 草稿竞态防护涉及的全部持久化键（B1）。
const DRAFT_STORAGE_KEYS = [LS_TERMS_KEY, LS_AITERMS_KEY, LS_TERM_SEED_KEY];
// 文本翻译页签多选接口的持久化键（TranForm 内部读写，刷新/页签往返后回填）。
const LS_API_SLUGS_KEY = "kt-playground-api-slugs";

export const normalizePlaygroundLineBreaks = (text) =>
  String(text ?? "")
    .replace(/\r\n?|\n/g, "\n")
    .replace(/[\t ]*(\n(?:[\t ]*\n)*)[\t ]*/g, (_, lineBreaks) =>
      lineBreaks.split("\n").length > 2 ? "\n\n" : " "
    );

/**
 * 翻译测试沙盒游乐场组件 (Playground)
 * 提供一个沙盒输入框，允许用户在设置页面内实时测试当前配置的各个翻译引擎与样式效果
 */
export default function Playgound({ initialSettingsReady = true }) {
  // 当前输入的测试文本状态
  const [text, setText] = useState("");
  // Playground 内的页签状态只影响页面展示，不写入用户设置。
  const [activeTab, setActiveTab] = useState("translation");
  const [mergeSingleLineBreaks, setMergeSingleLineBreaks] = useState(false);
  // 专业术语页签草稿：术语输入、AI 术语输入、例句 seed 都提升到父级状态，
  // 不会随页签子组件卸载而销毁（页签往返不丢失用户草稿，且不写入正式规则）。
  // 同时持久化到 localStorage，跨路由切换（组件卸载）后回来仍可回填。
  const readDraft = (key) => {
    try {
      const v = window.localStorage.getItem(key);
      return typeof v === "string" ? v : null;
    } catch {
      return null;
    }
  };
  const [termsDraft, setTermsDraft] = useState(
    () => readDraft(LS_TERMS_KEY) ?? ""
  );
  // 有 localStorage 回填时标记为已编辑，避免挂载时被规则初始术语覆盖。
  // 仅当回填草稿为非空字符串时才视为已编辑：空串（用户清空过）不应阻断
  // 术语页挂载时的默认填入示例 + 例句自动生成，保证开箱即可测试。
  const [termDraftTouched, setTermDraftTouched] = useState(() => {
    const draft = readDraft(LS_TERMS_KEY);
    return typeof draft === "string" && draft.trim() !== "";
  });
  // 例句轮换 seed（"" = 缺省确定性行为；切片按钮后递增轮换）。
  // 持久化到 localStorage：刷新后轮换状态不丢失（M3）。
  const [termSeed, setTermSeed] = useState(() => readDraft(LS_TERM_SEED_KEY) ?? "");
  // AI 专业术语草稿：与 termsDraft 一样提升到父级，并持久化到 localStorage。
  const [aiTermsDraft, setAiTermsDraft] = useState(
    () => readDraft(LS_AITERMS_KEY) ?? ""
  );

  // 草稿变更防抖写入 localStorage（临时测试数据留存，不写入正式规则/接口配置）：
  // 逐键同步写盘在高频输入下产生过量 storage 写，200ms trailing 防抖合并为末值单次写。
  const writeTermsDraft = useMemo(
    () =>
      debounce((v) => {
        // 带竞态比对的写盘，并同步"自身最后已知 LS 值"（B1）。
        flushDraftIfUnchanged(LS_TERMS_KEY, v);
      }, 200),
    []
  );
  const writeAiTermsDraft = useMemo(
    () =>
      debounce((v) => {
        flushDraftIfUnchanged(LS_AITERMS_KEY, v);
      }, 200),
    []
  );
  const writeTermSeed = useMemo(
    () =>
      debounce((v) => {
        flushDraftIfUnchanged(LS_TERM_SEED_KEY, v);
      }, 200),
    []
  );
  const termsDraftRef = useRef(termsDraft);
  const aiTermsDraftRef = useRef(aiTermsDraft);
  const termSeedRef = useRef(termSeed);
  // 双 Tab 竞态防护（B1）：每个键的"自身最后已知 LS 值"。同步点覆盖：
  // 初始读取（挂载 useState 初始化时读取的同值）、自身写盘、storage 事件。
  // 卸载/兜底 flush 写盘前先比对当前 LS 值：仅当仍与自身最后已知值一致才写回，
  // 防止后关闭的 Tab 用旧草稿覆盖另一 Tab 的新草稿。
  const lastKnownValuesRef = useRef({
    [LS_TERMS_KEY]: readDraft(LS_TERMS_KEY),
    [LS_AITERMS_KEY]: readDraft(LS_AITERMS_KEY),
    [LS_TERM_SEED_KEY]: readDraft(LS_TERM_SEED_KEY),
  });

  // 带竞态比对的同步写盘：他 Tab 已改写（当前 LS ≠ 自身最后已知值）时放弃写入。
  const flushDraftIfUnchanged = (key, value) => {
    try {
      if (window.localStorage.getItem(key) !== lastKnownValuesRef.current[key]) {
        return;
      }
      window.localStorage.setItem(key, value);
      lastKnownValuesRef.current[key] = value;
    } catch {
      // localStorage 不可用时静默降级。
    }
  };

  // 卸载/页面隐藏兜底时的三键同步 flush（M3：硬关页/刷新不触发 React 卸载，
  // 防抖窗口内的尾字会丢；pagehide/beforeunload 时把 refs 中的最新值落盘）。
  const flushAllDrafts = () => {
    flushDraftIfUnchanged(LS_TERMS_KEY, termsDraftRef.current);
    flushDraftIfUnchanged(LS_AITERMS_KEY, aiTermsDraftRef.current);
    flushDraftIfUnchanged(LS_TERM_SEED_KEY, termSeedRef.current);
  };

  // ref 同步并入 effect 体：渲染期零 ref 写。
  useEffect(() => {
    termsDraftRef.current = termsDraft;
    writeTermsDraft(termsDraft);
  }, [termsDraft, writeTermsDraft]);
  useEffect(() => {
    aiTermsDraftRef.current = aiTermsDraft;
    writeAiTermsDraft(aiTermsDraft);
  }, [aiTermsDraft, writeAiTermsDraft]);
  useEffect(() => {
    termSeedRef.current = termSeed;
    writeTermSeed(termSeed);
  }, [termSeed, writeTermSeed]);

  // 卸载：先同步 flush 最终已提交值（不丢字，硬关闭/崩溃前的最后落盘），再
  // cancel 未决定时器（无幽灵写盘）。refs 由上方 effect 体在 commit 阶段更新，
  // cleanup 运行时必为最新已提交值。flush 前带 B1 竞态比对。
  useEffect(
    () => () => {
      flushAllDrafts();
      writeTermsDraft.cancel();
      writeAiTermsDraft.cancel();
      writeTermSeed.cancel();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // 硬关页/刷新兜底（M3）：浏览器关闭/刷新不触发组件卸载 cleanup，
  // pagehide/beforeunload 时同步落盘三键（B1 比对同样生效）。
  useEffect(() => {
    window.addEventListener("pagehide", flushAllDrafts);
    window.addEventListener("beforeunload", flushAllDrafts);
    return () => {
      window.removeEventListener("pagehide", flushAllDrafts);
      window.removeEventListener("beforeunload", flushAllDrafts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 双 Tab 草稿同步（B1）：监听 storage 事件，另一 Tab 改写草稿时把新值
  // 归一化后同步进本地草稿 state 与"自身最后已知值"，保证后续写回比对正确。
  useEffect(() => {
    const onStorage = (event) => {
      if (!DRAFT_STORAGE_KEYS.includes(event.key)) return;
      // 归一化：他 Tab 删除键（newValue 为 null）视为清空草稿。
      const next = typeof event.newValue === "string" ? event.newValue : "";
      lastKnownValuesRef.current[event.key] = event.newValue;
      // 立即同步对应草稿 ref 并取消未决防抖写：state 更新要等 effect 提交，
      // 若 pagehide/beforeunload 在提交前触发，兜底 flush 会拿过期 ref 旧值
      // 写回并覆盖远端新值；同步 ref 让兜底 flush 永远拿到广播后的最新值。
      if (event.key === LS_TERMS_KEY) {
        termsDraftRef.current = next;
        writeTermsDraft.cancel();
        setTermsDraft(next);
        // 非空远端草稿到达视为用户已有内容：置 touched，防止子组件挂载期
        // 用默认示例覆盖远端草稿（空值仅清空草稿，不改 touched）。
        if (next.trim() !== "") setTermDraftTouched(true);
      } else if (event.key === LS_AITERMS_KEY) {
        aiTermsDraftRef.current = next;
        writeAiTermsDraft.cancel();
        setAiTermsDraft(next);
      } else {
        termSeedRef.current = next;
        writeTermSeed.cancel();
        setTermSeed(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
    // 三个防抖写入器均由 useMemo([]) 生成、跨渲染稳定，依赖仅为其满足
    // exhaustive-deps 门禁，实际不会触发重订阅。
  }, [writeTermsDraft, writeAiTermsDraft, writeTermSeed]);
  const i18n = useI18n();
  // 从全局钩子中读取设置
  const { setting } = useSetting();
  // 解构获取当前翻译服务配置列表与语言检测器
  const {
    transApis,
    langDetector,
    tranboxSetting,
    prompts,
    subtitleSetting,
    translateVariants,
    parseLatex,
  } = setting || DEFAULT_SETTING;
  const resolvedTransApis = useMemo(
    () => resolveApiPromptList(transApis, prompts, subtitleSetting),
    [prompts, subtitleSetting, transApis]
  );
  const translationText = useMemo(
    () => (mergeSingleLineBreaks ? normalizePlaygroundLineBreaks(text) : text),
    [mergeSingleLineBreaks, text]
  );
  // 解构翻译框的首选 API 服务 Slug、首选与次选语言、以及词典与联想配置
  const {
    apiSlugs,
    fromLang,
    toLang,
    toLang2,
    enDict,
    enSug,
    aiDictApiSlug,
    aiDictPromptSlug,
  } = tranboxSetting || DEFAULT_TRANBOX_SETTING;
  return (
    <Box className="kt-playground">
      <Tabs
        className="kt-playground__tabs"
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        aria-label={i18n("playground", "Playground")}
      >
        <Tab
          id="kt-playground-translation-tab"
          aria-controls="kt-playground-translation-panel"
          value="translation"
          label={i18n("playground_text_translation", "文本翻译")}
        />
        <Tab
          id="kt-playground-segmentation-tab"
          aria-controls="kt-playground-segmentation-panel"
          value="segmentation"
          label={i18n("subtitle_segmentation", "字幕断句")}
        />
        <Tab value="terms" label={i18n("terminology_playground", "专业术语")} />
      </Tabs>

      {activeTab === "translation" && (
        <Box
          id="kt-playground-translation-panel"
          role="tabpanel"
          aria-labelledby="kt-playground-translation-tab"
        >
          <TranForm
            initialSettingsReady={initialSettingsReady}
            text={text}
            translationText={translationText}
            setText={setText}
            apiSlugs={apiSlugs}
            fromLang={fromLang}
            toLang={toLang}
            toLang2={toLang2}
            transApis={resolvedTransApis}
            simpleStyle={false}
            langDetector={langDetector}
            enDict={enDict}
            enSug={enSug}
            aiDictApiSlug={aiDictApiSlug}
            aiDictPromptSlug={aiDictPromptSlug}
            prompts={prompts}
            translateVariants={translateVariants}
            parseLatex={parseLatex}
            isPlaygound={true}
            apiSlugsStorageKey={LS_API_SLUGS_KEY}
            playgroundConfigHeader={
              <Box className="kt-playground-config__header">
                <Box className="kt-playground-config__copy">
                  <Typography component="h2">
                    {i18n("playground_translation_config_title", "翻译配置")}
                  </Typography>
                  <Typography component="p">
                    {i18n(
                      "playground_translation_config_description",
                      "选择本次测试使用的服务、语言和辅助工具"
                    )}
                  </Typography>
                </Box>
                <FormControlLabel
                  className="kt-playground-config__normalize"
                  control={
                    <Switch
                      size="small"
                      checked={mergeSingleLineBreaks}
                      onChange={(event) =>
                        setMergeSingleLineBreaks(event.target.checked)
                      }
                    />
                  }
                  label={i18n(
                    "playground_merge_single_line_breaks",
                    "合并单个换行（保留段落）"
                  )}
                />
              </Box>
            }
          />
        </Box>
      )}

      {activeTab === "segmentation" && (
        <Box
          id="kt-playground-segmentation-panel"
          role="tabpanel"
          aria-labelledby="kt-playground-segmentation-tab"
        >
          <SubtitleSegmentationPlayground
            subtitleSetting={subtitleSetting}
            transApis={resolvedTransApis}
            prompts={prompts}
          />
        </Box>
      )}

      {activeTab === "terms" && (
        <TerminologyPlayground
          setText={setText}
          setActiveTab={setActiveTab}
          termsDraft={termsDraft}
          setTermsDraft={setTermsDraft}
          termDraftTouched={termDraftTouched}
          setTermDraftTouched={setTermDraftTouched}
          termSeed={termSeed}
          setTermSeed={setTermSeed}
          aiTermsDraft={aiTermsDraft}
          setAiTermsDraft={setAiTermsDraft}
          transApis={resolvedTransApis}
        />
      )}
    </Box>
  );
}
