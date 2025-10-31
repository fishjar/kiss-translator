import { STOKEY_RULES, DEFAULT_RULES, KV_RULES_KEY } from "../config";
import { useStorage } from "./Storage";
import { checkRules } from "../libs/rules";
import { useCallback } from "react";
import { debounceSyncMeta } from "../libs/storage";

/**
 * 规则 hook
 * @returns
 */
export function useRules() {
  const { data: list = [], save: saveRules } = useStorage(
    STOKEY_RULES,
    DEFAULT_RULES,
    KV_RULES_KEY
  );

  const save = useCallback(
    (objOrFn) => {
      saveRules(objOrFn);
      debounceSyncMeta(KV_RULES_KEY);
    },
    [saveRules]
  );

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

  const clear = useCallback(() => {
    save((prev) => prev.filter((item) => item.pattern === "*"));
  }, [save]);

  const put = useCallback(
    (pattern, obj) => {
      save((prev) => {
        // if (pattern !== obj.pattern) {
        //   return prev;
        // }
        return prev.map((item) =>
          item.pattern === pattern ? { ...item, ...obj } : item
        );
      });
    },
    [save]
  );

  const merge = useCallback(
    (rules) => {
      save((prev) => {
        const adds = checkRules(rules);
        if (adds.length === 0) {
          return prev;
        }

        // const map = new Map();
        // // 不进行深度合并
        // // [...prev, ...adds].forEach((item) => {
        // //   const k = item.pattern;
        // //   map.set(k, { ...(map.get(k) || {}), ...item });
        // // });
        // prev.forEach((item) => map.set(item.pattern, item));
        // adds.forEach((item) => map.set(item.pattern, item));
        // return [...map.values()];

        const addsMap = new Map(adds.map((item) => [item.pattern, item]));
        const prevPatterns = new Set(prev.map((item) => item.pattern));
        const updatedPrev = prev.map(
          (prevItem) => addsMap.get(prevItem.pattern) || prevItem
        );
        const newItems = adds.filter(
          (addItem) => !prevPatterns.has(addItem.pattern)
        );

        return [...newItems, ...updatedPrev];
      });
    },
    [save]
  );

  return { list, add, del, clear, put, merge };
}
