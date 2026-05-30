import { STOKEY_RULES, DEFAULT_RULES, KV_RULES_KEY } from "../config";
import { useStorage } from "./Storage";
import { checkRules } from "../libs/rules";
import { useCallback } from "react";
import { debounceSyncMeta } from "../libs/storage";

/**
 * 翻译规则列表增删改查管理的自定义 Hook
 */
export function useRules() {
  // 使用 useStorage 管理翻译规则的持久化读写
  const { data: list = [], save: saveRules } = useStorage(
    STOKEY_RULES,
    DEFAULT_RULES,
    KV_RULES_KEY
  );

  // 包装保存规则的函数，每次保存修改后都触发防抖云同步 (WebDAV 等)
  const save = useCallback(
    (objOrFn) => {
      saveRules(objOrFn);
      debounceSyncMeta(KV_RULES_KEY);
    },
    [saveRules]
  );

  // 添加单条规则，但限制通配符 "*" 规则的添加，且过滤重复 pattern 规则
  const add = useCallback(
    (rule) => {
      save((prev) => {
        if (
          rule.pattern === "*" ||
          prev.some((item) => item.pattern === rule.pattern)
        ) {
          return prev;
        }
        return [rule, ...prev];
      });
    },
    [save]
  );

  // 删除单条特定 pattern 的规则，不允许直接删除默认通配符 "*" 规则
  const del = useCallback(
    (pattern) => {
      save((prev) => {
        if (pattern === "*") {
          return prev;
        }
        return prev.filter((item) => item.pattern !== pattern);
      });
    },
    [save]
  );

  // 清空所有规则，但保留默认通配符 "*" 规则
  const clear = useCallback(() => {
    save((prev) => prev.filter((item) => item.pattern === "*"));
  }, [save]);

  // 修改/替换特定 pattern 规则的内部属性数据
  const put = useCallback(
    (pattern, obj) => {
      save((prev) => {
        return prev.map((item) =>
          item.pattern === pattern ? { ...item, ...obj } : item
        );
      });
    },
    [save]
  );

  // 批量合并新规则数组
  const merge = useCallback(
    (rules) => {
      save((prev) => {
        // 先对导入的规则列表进行基本的格式与字段合法性校验
        const adds = checkRules(rules);
        if (adds.length === 0) {
          return prev;
        }

        // 将要合并进来的合法新规则以 pattern 为 key 建成 Map 映射
        const addsMap = new Map(adds.map((item) => [item.pattern, item]));
        const prevPatterns = new Set(prev.map((item) => item.pattern));

        // 遍历原有规则列表：若原有 pattern 在新导入规则中也存在，则用新规则覆盖旧规则；若不存在则维持原样
        const updatedPrev = prev.map(
          (prevItem) => addsMap.get(prevItem.pattern) || prevItem
        );
        // 筛选出原有列表中不存在的纯新规则 pattern
        const newItems = adds.filter(
          (addItem) => !prevPatterns.has(addItem.pattern)
        );

        // 合并：将纯新添加的规则置顶，与覆盖更新后的原规则数组合并返回
        return [...newItems, ...updatedPrev];
      });
    },
    [save]
  );

  return { list, add, del, clear, put, merge };
}
