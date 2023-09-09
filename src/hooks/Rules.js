import { STOKEY_RULES, DEFAULT_RULES } from "../config";
import { useStorage } from "./Storage";
import { trySyncRules } from "../libs/sync";
import { checkRules } from "../libs/rules";
import { useCallback } from "react";

/**
 * 规则 hook
 * @returns
 */
export function useRules() {
  const { data: list, save } = useStorage(STOKEY_RULES, DEFAULT_RULES);

  const updateRules = useCallback(
    async (rules) => {
      await save(rules);
      trySyncRules();
    },
    [save]
  );

  const add = useCallback(
    async (rule) => {
      const rules = [...list];
      if (rule.pattern === "*") {
        return;
      }
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
      if (pattern === "*") {
        return;
      }
      rules = rules.filter((item) => item.pattern !== pattern);
      await updateRules(rules);
    },
    [list, updateRules]
  );

  const clear = useCallback(async () => {
    let rules = [...list];
    rules = rules.filter((item) => item.pattern === "*");
    await updateRules(rules);
  }, [list, updateRules]);

  const put = useCallback(
    async (pattern, obj) => {
      const rules = [...list];
      if (pattern === "*") {
        obj.pattern = "*";
      }
      const rule = rules.find((r) => r.pattern === pattern);
      rule && Object.assign(rule, obj);
      await updateRules(rules);
    },
    [list, updateRules]
  );

  const merge = useCallback(
    async (newRules) => {
      const rules = [...list];
      newRules = checkRules(newRules);
      newRules.forEach((newRule) => {
        const rule = rules.find(
          (oldRule) => oldRule.pattern === newRule.pattern
        );
        if (rule) {
          Object.assign(rule, newRule);
        } else {
          rules.unshift(newRule);
        }
      });
      await updateRules(rules);
    },
    [list, updateRules]
  );

  return { list, add, del, clear, put, merge };
}
