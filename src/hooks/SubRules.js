import { DEFAULT_SUBRULES_LIST, DEFAULT_OW_RULE } from "../config";
import { useSetting } from "./Setting";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadOrFetchSubRules } from "../libs/subRules";
import { kissLog } from "../libs/log";

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
    (url) => {
      updateSetting((prev) => ({
        ...prev,
        subrulesList: prev.subrulesList.map((item) => ({
          ...item,
          selected: item.url === url,
        })),
      }));
    },
    [updateSetting]
  );

  const addSub = useCallback(
    (url) => {
      updateSetting((prev) => ({
        ...prev,
        subrulesList: [...prev.subrulesList, { url, selected: false }],
      }));
    },
    [updateSetting]
  );

  const delSub = useCallback(
    (url) => {
      updateSetting((prev) => ({
        ...prev,
        subrulesList: prev.subrulesList.filter((item) => item.url !== url),
      }));
    },
    [updateSetting]
  );

  useEffect(() => {
    (async () => {
      if (selectedUrl) {
        try {
          setLoading(true);
          const rules = await loadOrFetchSubRules(selectedUrl);
          setSelectedRules(rules);
        } catch (err) {
          kissLog("loadOrFetchSubRules", err);
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [selectedUrl]);

  return {
    subList: list,
    selectSub,
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
  const { setting, updateChild } = useSetting();
  const owSubrule = setting?.owSubrule || DEFAULT_OW_RULE;
  const updateOwSubrule = updateChild("owSubrule");

  return { owSubrule, updateOwSubrule };
}
