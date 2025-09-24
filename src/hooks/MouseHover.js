import { DEFAULT_MOUSE_HOVER_SETTING } from "../config";
import { useSetting } from "./Setting";

export function useMouseHoverSetting() {
  const { setting, updateChild } = useSetting();
  const mouseHoverSetting =
    setting?.mouseHoverSetting || DEFAULT_MOUSE_HOVER_SETTING;
  const updateMouseHoverSetting = updateChild("mouseHoverSetting");

  return { mouseHoverSetting, updateMouseHoverSetting };
}
