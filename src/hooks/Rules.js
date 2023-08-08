import {
  STOKEY_RULES,
  OPT_TRANS_ALL,
  OPT_STYLE_ALL,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  GLOBAL_KEY,
} from "../config";
import storage from "../libs/storage";
import { useStorages } from "./Storage";
import { matchValue } from "../libs/utils";
import { syncRules } from "../libs/sync";
import { useSync } from "./Sync";

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
    try {
      await syncRules();
    } catch (err) {
      console.log("[sync rules]", err);
    }
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
    const fromLangs = OPT_LANGS_FROM.map((item) => item[0]);
    const toLangs = OPT_LANGS_TO.map((item) => item[0]);
    newRules
      .filter(({ pattern }) => pattern && typeof pattern === "string")
      .map(
        ({
          pattern,
          selector,
          translator,
          fromLang,
          toLang,
          textStyle,
          transOpen,
          bgColor,
        }) => ({
          pattern,
          selector: typeof selector === "string" ? selector : "",
          bgColor: typeof bgColor === "string" ? bgColor : "",
          translator: matchValue([GLOBAL_KEY, ...OPT_TRANS_ALL], translator),
          fromLang: matchValue([GLOBAL_KEY, ...fromLangs], fromLang),
          toLang: matchValue([GLOBAL_KEY, ...toLangs], toLang),
          textStyle: matchValue([GLOBAL_KEY, ...OPT_STYLE_ALL], textStyle),
          transOpen: matchValue([GLOBAL_KEY, "true", "false"], transOpen),
        })
      )
      .forEach((newRule) => {
        const rule = rules.find(
          (oldRule) => oldRule.pattern === newRule.pattern
        );
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
