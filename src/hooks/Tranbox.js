import { DEFAULT_TRANBOX_SETTING } from "../config";
import { useSetting } from "./Setting";

/**
 * 翻译面板 (Translation Box) 样式及展示偏好设置的读取与更新自定义 Hook
 * @returns {object} { tranboxSetting, updateTranbox }
 */
export function useTranbox() {
  const { setting, updateChild } = useSetting();
  // 获取当前的翻译面板配置，若未设置则加载系统预设的默认值
  const tranboxSetting = setting?.tranboxSetting || DEFAULT_TRANBOX_SETTING;
  // 生成专门用于修改全局配置中 tranboxSetting 分支的原子更新方法
  const updateTranbox = updateChild("tranboxSetting");

  return { tranboxSetting, updateTranbox };
}
