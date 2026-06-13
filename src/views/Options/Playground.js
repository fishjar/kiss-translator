import { useMemo, useState } from "react";
import TranForm from "../Selection/TranForm";
import {
  DEFAULT_SETTING,
  DEFAULT_TRANBOX_SETTING,
  resolveApiPromptList,
} from "../../config";
import { useSetting } from "../../hooks/Setting";

/**
 * 翻译测试沙盒游乐场组件 (Playground)
 * 提供一个沙盒输入框，允许用户在设置页面内实时测试当前配置的各个翻译引擎与样式效果
 */
export default function Playgound() {
  // 当前输入的测试文本状态
  const [text, setText] = useState("");
  // 从全局钩子中读取设置
  const { setting } = useSetting();
  // 解构获取当前翻译服务配置列表与语言检测器
  const { transApis, langDetector, tranboxSetting, prompts, subtitleSetting } =
    setting || DEFAULT_SETTING;
  const resolvedTransApis = useMemo(
    () => resolveApiPromptList(transApis, prompts, subtitleSetting),
    [prompts, subtitleSetting, transApis]
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
    <TranForm
      text={text}
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
      isPlaygound={true} // 标识为 Playground 环境以进行特定的渲染样式和交互处理
    />
  );
}
