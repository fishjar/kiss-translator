import { DEFAULT_INPUT_RULE } from "../config";
import { useSetting } from "./Setting";

export function useInputRule() {
  const { setting, updateChild } = useSetting();
  const inputRule = setting?.inputRule || DEFAULT_INPUT_RULE;
  const updateInputRule = updateChild("inputRule");

  return { inputRule, updateInputRule };
}
