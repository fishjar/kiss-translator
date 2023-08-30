import { DEFAULT_SUBRULES_LIST } from "../config";
import { useSetting } from "./Setting";
import { useCallback } from "react";

/**
 * 订阅规则
 * @returns
 */
export function useSubRules() {
  const { data: setting, update: updateSetting } = useSetting();
  const list = setting?.subRulesList || DEFAULT_SUBRULES_LIST;

  const select = useCallback(
    async (url) => {
      const subRulesList = [...list];
      subRulesList.forEach((item) => {
        if (item.url === url) {
          item.selected = true;
        } else {
          item.selected = false;
        }
      });
      await updateSetting({ subRulesList });
    },
    [list]
  );

  const add = useCallback(
    async (url) => {
      const subRulesList = [...list];
      subRulesList.push({ url, selected: false });
      await updateSetting({ subRulesList });
    },
    [list]
  );

  const del = useCallback(
    async (url) => {
      let subRulesList = [...list];
      subRulesList = subRulesList.filter((item) => item.url !== url);
      await updateSetting({ subRulesList });
    },
    [list]
  );

  return { list, select, add, del };
}
