import {
  STOKEY_RULES,
  OPT_TRANS_ALL,
  OPT_STYLE_ALL,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
} from "../config";
import storage from "../libs/storage";
import { useStorages } from "./Storage";
import { matchValue } from "../libs/utils";

/**
 * 匹配规则增删改查 hook
 * @returns
 */
export function useRules() {
  const storages = useStorages();
  const list = storages?.[STOKEY_RULES] || [];

  const add = async (rule) => {
    const rules = [...list];
    if (rule.pattern === "*") {
      return;
    }
    if (rules.map((item) => item.pattern).includes(rule.pattern)) {
      return;
    }
    rules.unshift(rule);
    await storage.setObj(STOKEY_RULES, rules);
  };

  const del = async (pattern) => {
    let rules = [...list];
    if (pattern === "*") {
      return;
    }
    rules = rules.filter((item) => item.pattern !== pattern);
    await storage.setObj(STOKEY_RULES, rules);
  };

  const put = async (pattern, obj) => {
    const rules = [...list];
    if (pattern === "*") {
      obj.pattern = "*";
    }
    const rule = rules.find((r) => r.pattern === pattern);
    rule && Object.assign(rule, obj);
    await storage.setObj(STOKEY_RULES, rules);
  };

  const merge = async (newRules) => {
    const fromLangs = OPT_LANGS_FROM.map((item) => item[0]);
    const toLangs = OPT_LANGS_TO.map((item) => item[0]);
    const rules = [...list];
    newRules
      .filter(
        ({ pattern, selector }) =>
          pattern &&
          selector &&
          typeof pattern === "string" &&
          typeof selector === "string"
      )
      .map(
        ({
          pattern,
          selector,
          translator,
          fromLang,
          toLang,
          textStyle,
          transOpen,
        }) => ({
          pattern,
          selector,
          translator: matchValue(OPT_TRANS_ALL, translator),
          fromLang: matchValue(fromLangs, fromLang),
          toLang: matchValue(toLangs, toLang),
          textStyle: matchValue(OPT_STYLE_ALL, textStyle),
          transOpen: matchValue([true, false], transOpen),
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
    await storage.setObj(STOKEY_RULES, rules);
  };

  return { list, add, del, put, merge };
}
