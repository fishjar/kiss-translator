import { DEFAULT_INPUT_RULE } from "../config";
import { useSetting } from "./Setting";

/**
 * 输入框内翻译规则的读取与更新自定义 Hook
 * @returns {object} { inputRule, updateInputRule }
 */
export function useInputRule() {
  const { setting, updateChild } = useSetting();
  // 获取当前配置，若无则使用默认输入规则
  const inputRule = setting?.inputRule || DEFAULT_INPUT_RULE;
  // 获取局部更新配置中 inputRule 部分的更新函数
  const updateInputRule = updateChild("inputRule");

  return { inputRule, updateInputRule };
}
