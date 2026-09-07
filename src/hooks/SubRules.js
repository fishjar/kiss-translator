import { DEFAULT_SUBRULES_LIST } from "../config";
import { useSetting } from "./Setting";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadOrFetchSubRules } from "../libs/subRules";
import { kissLog } from "../libs/log";

/**
 * 订阅规则
 * @returns
 */
/**
 * 订阅规则列表获取与切换管理的自定义 Hook
 */
export function useSubRules() {
  const [loading, setLoading] = useState(false);
  const [selectedRuleState, setSelectedRuleState] = useState({
    url: "",
    rules: [],
  });
  const requestIdRef = useRef(0);
  const selectedUrlRef = useRef("");
  const { setting, updateSetting } = useSetting();
  // 获取订阅规则源列表，如果没有配置，则默认加载 DEFAULT_SUBRULES_LIST
  const list = setting?.subrulesList || DEFAULT_SUBRULES_LIST;

  // 查出当前被选中的订阅源
  const selectedSub = useMemo(() => list.find((item) => item.selected), [list]);
  const selectedUrl = selectedSub ? selectedSub.url : "";
  selectedUrlRef.current = selectedUrl;
  const selectedRules =
    selectedRuleState.url === selectedUrl ? selectedRuleState.rules : [];
  const selectionPending = Boolean(
    selectedUrl && selectedRuleState.url !== selectedUrl
  );

  const setSelectedRulesForUrl = useCallback((url, rules) => {
    if (!url || selectedUrlRef.current !== url) return false;
    requestIdRef.current += 1;
    setSelectedRuleState({ url, rules: Array.isArray(rules) ? rules : [] });
    setLoading(false);
    return true;
  }, []);

  // 选中特定的订阅规则源
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

  // 添加一个新的规则订阅源
  const addSub = useCallback(
    (url) => {
      updateSetting((prev) => {
        if (prev.subrulesList.some((item) => item.url === url)) return prev;
        return {
          ...prev,
          subrulesList: [...prev.subrulesList, { url, selected: false }],
        };
      });
    },
    [updateSetting]
  );

  // 删除一个规则订阅源
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
    const requestId = ++requestIdRef.current;
    let active = true;

    if (!selectedUrl) {
      setSelectedRuleState({ url: "", rules: [] });
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void loadOrFetchSubRules(selectedUrl)
      .then((rules) => {
        if (
          active &&
          requestId === requestIdRef.current &&
          selectedUrlRef.current === selectedUrl
        ) {
          setSelectedRuleState({
            url: selectedUrl,
            rules: Array.isArray(rules) ? rules : [],
          });
        }
      })
      .catch((err) => {
        if (active && requestId === requestIdRef.current) {
          kissLog("loadOrFetchSubRules", err);
          setSelectedRuleState({ url: selectedUrl, rules: [] });
        }
      })
      .finally(() => {
        if (active && requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedUrl]);

  return {
    subList: list,
    selectSub,
    addSub,
    delSub,
    selectedSub,
    selectedUrl,
    selectedRules,
    setSelectedRulesForUrl,
    loading: loading || selectionPending,
  };
}
