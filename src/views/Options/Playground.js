import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
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
export default function Playgound() {
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
  const [termSeed, setTermSeed] = useState("");
  // AI 专业术语草稿：与 termsDraft 一样提升到父级，并持久化到 localStorage。
  const [aiTermsDraft, setAiTermsDraft] = useState(
    () => readDraft(LS_AITERMS_KEY) ?? ""
  );

  // 草稿变更防抖写入 localStorage（临时测试数据留存，不写入正式规则/接口配置）：
  // 逐键同步写盘在高频输入下产生过量 storage 写，200ms trailing 防抖合并为末值单次写。
  const writeTermsDraft = useMemo(
    () =>
      debounce((v) => {
        try {
          window.localStorage.setItem(LS_TERMS_KEY, v);
        } catch {
          // localStorage 不可用时静默降级：仅丢失跨路由留存，不影响本页使用。
        }
      }, 200),
    []
  );
  const writeAiTermsDraft = useMemo(
    () =>
      debounce((v) => {
        try {
          window.localStorage.setItem(LS_AITERMS_KEY, v);
        } catch {
          // 同上，静默降级。
        }
      }, 200),
    []
  );
  const termsDraftRef = useRef(termsDraft);
  const aiTermsDraftRef = useRef(aiTermsDraft);

  // ref 同步并入 effect 体：渲染期零 ref 写。
  useEffect(() => {
    termsDraftRef.current = termsDraft;
    writeTermsDraft(termsDraft);
  }, [termsDraft, writeTermsDraft]);
  useEffect(() => {
    aiTermsDraftRef.current = aiTermsDraft;
    writeAiTermsDraft(aiTermsDraft);
  }, [aiTermsDraft, writeAiTermsDraft]);

  // 卸载：先同步 flush 最终已提交值（不丢字，硬关闭/崩溃前的最后落盘），再
  // cancel 未决定时器（无幽灵写盘）。refs 由上方 effect 体在 commit 阶段更新，
  // cleanup 运行时必为最新已提交值。
  useEffect(
    () => () => {
      try {
        window.localStorage.setItem(LS_TERMS_KEY, termsDraftRef.current);
      } catch {
        // 静默降级。
      }
      try {
        window.localStorage.setItem(LS_AITERMS_KEY, aiTermsDraftRef.current);
      } catch {
        // 静默降级。
      }
      writeTermsDraft.cancel();
      writeAiTermsDraft.cancel();
    },
    [writeTermsDraft, writeAiTermsDraft]
  );
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
    <Box>
      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        sx={{ mb: 2 }}
      >
        <Tab
          value="translation"
          label={i18n("playground_text_translation", "文本翻译")}
        />
        <Tab
          value="segmentation"
          label={i18n("subtitle_segmentation", "字幕断句")}
        />
        <Tab value="terms" label={i18n("terminology_playground", "专业术语")} />
      </Tabs>

      {activeTab === "translation" && (
        <>
          <FormControlLabel
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
            sx={{ width: "fit-content", ml: 0, mb: 2 }}
          />
          <TranForm
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
            isPlaygound={true} // 标识为 Playground 环境以进行特定的渲染样式和交互处理
            apiSlugsStorageKey={LS_API_SLUGS_KEY}
          />
        </>
      )}

      {activeTab === "segmentation" && (
        <SubtitleSegmentationPlayground
          subtitleSetting={subtitleSetting}
          transApis={resolvedTransApis}
          prompts={prompts}
        />
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
