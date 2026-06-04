import { DEFAULT_MOUSE_HOVER_SETTING } from "../config";
import { useSetting } from "./Setting";

/**
 * 鼠标悬停翻译相关配置读取与更新的自定义 Hook
 * @returns {object} { mouseHoverSetting, updateMouseHoverSetting }
 */
export function useMouseHoverSetting() {
  const { setting, updateChild } = useSetting();
  // 获取当前的鼠标悬浮设置，若未配置则加载默认的悬浮触发规则
  const mouseHoverSetting =
    setting?.mouseHoverSetting || DEFAULT_MOUSE_HOVER_SETTING;
  // 生成专用于修改 mouseHoverSetting 的原子更新函数
  const updateMouseHoverSetting = updateChild("mouseHoverSetting");

  return { mouseHoverSetting, updateMouseHoverSetting };
}
