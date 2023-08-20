import { STOKEY_RULES, DEFAULT_SUBRULES_LIST } from "../config";
import storage from "../libs/storage";
import { useStorages } from "./Storage";
import { syncRules } from "../libs/sync";
import { useSync } from "./Sync";
import { useSetting, useSettingUpdate } from "./Setting";
import { checkRules } from "../libs/rules";

/**
 * 匹配规则增删改查 hook
 * @returns
 */
export function useRules() {
  const storages = useStorages();
  const list = storages?.[STOKEY_RULES] || [];
  const sync = useSync();

  const update = async (rules) => {
    const updateAt = sync.opt?.rulesUpdateAt ? Date.now() : 0;
    await storage.setObj(STOKEY_RULES, rules);
    await sync.update({ rulesUpdateAt: updateAt });
    syncRules();
  };

  const add = async (rule) => {
    const rules = [...list];
    if (rule.pattern === "*") {
      return;
    }
    if (rules.map((item) => item.pattern).includes(rule.pattern)) {
      return;
    }
    rules.unshift(rule);
    await update(rules);
  };

  const del = async (pattern) => {
    let rules = [...list];
    if (pattern === "*") {
      return;
    }
    rules = rules.filter((item) => item.pattern !== pattern);
    await update(rules);
  };

  const put = async (pattern, obj) => {
    const rules = [...list];
    if (pattern === "*") {
      obj.pattern = "*";
    }
    const rule = rules.find((r) => r.pattern === pattern);
    rule && Object.assign(rule, obj);
    await update(rules);
  };

  const merge = async (newRules) => {
    const rules = [...list];
    newRules = checkRules(newRules);
    newRules.forEach((newRule) => {
      const rule = rules.find((oldRule) => oldRule.pattern === newRule.pattern);
      if (rule) {
        Object.assign(rule, newRule);
      } else {
        rules.unshift(newRule);
      }
    });
    await update(rules);
  };

  return { list, add, del, put, merge };
}

/**
 * 订阅规则
 * @returns
 */
export function useSubrules() {
  const setting = useSetting();
  const updateSetting = useSettingUpdate();
  const list = setting?.subrulesList || DEFAULT_SUBRULES_LIST;

  const select = async (url) => {
    const subrulesList = [...list];
    subrulesList.forEach((item) => {
      if (item.url === url) {
        item.selected = true;
      } else {
        item.selected = false;
      }
    });
    await updateSetting({ subrulesList });
  };

  const add = async (url) => {
    const subrulesList = [...list];
    subrulesList.push({ url });
    await updateSetting({ subrulesList });
  };

  const del = async (url) => {
    let subrulesList = [...list];
    subrulesList = subrulesList.filter((item) => item.url !== url);
    await updateSetting({ subrulesList });
  };

  return { list, select, add, del };
}
