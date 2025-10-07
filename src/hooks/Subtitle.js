import { DEFAULT_SUBTITLE_SETTING } from "../config";
import { useSetting } from "./Setting";

export function useSubtitle() {
  const { setting, updateChild } = useSetting();
  const subtitleSetting = setting?.subtitleSetting || DEFAULT_SUBTITLE_SETTING;
  const updateSubtitle = updateChild("subtitleSetting");

  return { subtitleSetting, updateSubtitle };
}
