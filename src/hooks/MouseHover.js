import { useCallback } from "react";
import { DEFAULT_MOUSE_HOVER_SETTING } from "../config";
import { useSetting } from "./Setting";

export function useMouseHoverSetting() {
  const { setting, updateSetting } = useSetting();
  const mouseHoverSetting =
    setting?.mouseHoverSetting || DEFAULT_MOUSE_HOVER_SETTING;

  const updateMouseHoverSetting = useCallback(
    async (obj) => {
      Object.assign(mouseHoverSetting, obj);
      await updateSetting({ mouseHoverSetting });
    },
    [mouseHoverSetting, updateSetting]
  );

  return { mouseHoverSetting, updateMouseHoverSetting };
}
