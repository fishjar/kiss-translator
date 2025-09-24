import { DEFAULT_TRANBOX_SETTING } from "../config";
import { useSetting } from "./Setting";

export function useTranbox() {
  const { setting, updateChild } = useSetting();
  const tranboxSetting = setting?.tranboxSetting || DEFAULT_TRANBOX_SETTING;
  const updateTranbox = updateChild("tranboxSetting");

  return { tranboxSetting, updateTranbox };
}
