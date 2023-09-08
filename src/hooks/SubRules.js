import { DEFAULT_SUBRULES_LIST, DEFAULT_OW_RULE } from "../config";
import { useSetting } from "./Setting";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadOrFetchSubRules } from "../libs/subRules";
import { delSubRules } from "../libs/storage";

/**
 * 订阅规则
 * @returns
 */
export function useSubRules() {
  const [loading, setLoading] = useState(false);
  const [selectedRules, setSelectedRules] = useState([]);
  const { setting, updateSetting } = useSetting();
  const list = setting?.subrulesList || DEFAULT_SUBRULES_LIST;

  const selectedSub = useMemo(() => list.find((item) => item.selected), [list]);
  const selectedUrl = selectedSub.url;

  const selectSub = useCallback(
    async (url) => {
      const subrulesList = [...list];
      subrulesList.forEach((item) => {
        if (item.url === url) {
          item.selected = true;
        } else {
          item.selected = false;
        }
      });
      await updateSetting({ subrulesList });
    },
    [list, updateSetting]
  );

  const updateSub = useCallback(
    async (url, obj) => {
      const subrulesList = [...list];
      subrulesList.forEach((item) => {
        if (item.url === url) {
          Object.assign(item, obj);
        }
      });
      await updateSetting({ subrulesList });
    },
    [list, updateSetting]
  );

  const addSub = useCallback(
    async (url) => {
      const subrulesList = [...list];
      subrulesList.push({ url, selected: false, syncAt: Date.now() });
      await updateSetting({ subrulesList });
    },
    [list, updateSetting]
  );

  const delSub = useCallback(
    async (url) => {
      let subrulesList = [...list];
      subrulesList = subrulesList.filter((item) => item.url !== url);
      await updateSetting({ subrulesList });
      await delSubRules(url);
    },
    [list, updateSetting]
  );

  useEffect(() => {
    (async () => {
      if (selectedUrl) {
        try {
          setLoading(true);
          const rules = await loadOrFetchSubRules(selectedUrl);
          setSelectedRules(rules);
        } catch (err) {
          console.log("[loadOrFetchSubRules]", err);
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [selectedUrl]);

  return {
    subList: list,
    selectSub,
    updateSub,
    addSub,
    delSub,
    selectedSub,
    selectedUrl,
    selectedRules,
    setSelectedRules,
    loading,
  };
}

/**
 * 覆写订阅规则
 * @returns
 */
export function useOwSubRule() {
  const { setting, updateSetting } = useSetting();
  const { owSubrule = DEFAULT_OW_RULE } = setting;

  const updateOwSubrule = useCallback(
    async (obj) => {
      await updateSetting({ owSubrule: { ...owSubrule, ...obj } });
    },
    [owSubrule, updateSetting]
  );

  return { owSubrule, updateOwSubrule };
}
