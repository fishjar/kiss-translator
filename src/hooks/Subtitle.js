import { DEFAULT_SUBTITLE_SETTING } from "../config";
import { useSetting } from "./Setting";

/**
 * 视频字幕翻译相关偏好设置的读取与更新自定义 Hook
 * @returns {object} { subtitleSetting, updateSubtitle }
 */
export function useSubtitle() {
  const { setting, updateChild } = useSetting();
  // 获取当前字幕的设置数据，若未设置则加载系统预设的默认值
  const subtitleSetting = setting?.subtitleSetting || DEFAULT_SUBTITLE_SETTING;
  // 生成专门用于修改全局配置中 subtitleSetting 分支的原子更新方法
  const updateSubtitle = updateChild("subtitleSetting");

  return { subtitleSetting, updateSubtitle };
}
