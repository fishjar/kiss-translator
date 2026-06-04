import { DEFAULT_SUBRULES_LIST } from "../config";
import { useSetting } from "./Setting";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [selectedRules, setSelectedRules] = useState([]);
  const { setting, updateSetting } = useSetting();
  // 获取订阅规则源列表，如果没有配置，则默认加载 DEFAULT_SUBRULES_LIST
  const list = setting?.subrulesList || DEFAULT_SUBRULES_LIST;

  // 查出当前被选中的订阅源
  const selectedSub = useMemo(() => list.find((item) => item.selected), [list]);
  const selectedUrl = selectedSub ? selectedSub.url : "";

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
      updateSetting((prev) => ({
        ...prev,
        subrulesList: [...prev.subrulesList, { url, selected: false }],
      }));
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

  // 监听选中的订阅源 url 变化，触发异步拉取最新规则列表的副作用
  // REVIEW: 这里的 useEffect 在异步加载 rules 时没有进行竞态条件的处理。
  // 若用户快速切换不同的订阅源 url，会导致先发起的请求滞后返回并覆盖较新订阅源的规则。
  // 建议在 useEffect 中声明 ignore 标识符，在 cleanup 时将其置为 true，以防止滞后返回的数据修改 selectedRules 状态。
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
      } else {
        // 当没有选中任何订阅源时，清空当前激活的订阅规则
        setSelectedRules([]);
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
