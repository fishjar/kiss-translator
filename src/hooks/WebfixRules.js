import { STOKEY_WFRULES, KV_WFRULES_KEY } from "../config";
import { useStorage } from "./Storage";
import { trySyncWebfixRules } from "../libs/sync";
import { useCallback } from "react";
import { useSyncMeta } from "./Sync";

const DEFAULT_WFRULES = [];

/**
 * 修复规则 hook
 * @returns
 */
export function useWebfixRules() {
  const { data: list, save } = useStorage(STOKEY_WFRULES, DEFAULT_WFRULES);
  const { updateSyncMeta } = useSyncMeta();

  const updateRules = useCallback(
    async (rules) => {
      await save(rules);
      await updateSyncMeta(KV_WFRULES_KEY);
      trySyncWebfixRules();
    },
    [save, updateSyncMeta]
  );

  const add = useCallback(
    async (rule) => {
      const rules = [...list];
      if (rules.map((item) => item.pattern).includes(rule.pattern)) {
        return;
      }
      rules.unshift(rule);
      await updateRules(rules);
    },
    [list, updateRules]
  );

  const del = useCallback(
    async (pattern) => {
      let rules = [...list];
      rules = rules.filter((item) => item.pattern !== pattern);
      await updateRules(rules);
    },
    [list, updateRules]
  );

  const put = useCallback(
    async (pattern, obj) => {
      const rules = [...list];
      const rule = rules.find((r) => r.pattern === pattern);
      rule && Object.assign(rule, obj);
      await updateRules(rules);
    },
    [list, updateRules]
  );

  return { list, add, del, put };
}
