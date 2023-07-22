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
  let rules = storages?.[STOKEY_RULES] || [];

  const add = async (rule) => {
    rules = [...rules];
    if (rule.pattern === "*") {
      return;
    }
    if (rules.map((item) => item.pattern).includes(rule.pattern)) {
      return;
    }
    await storage.setObj(STOKEY_RULES, [rule, ...rules]);
  };

  const del = async (pattern) => {
    rules = [...rules];
    if (pattern === "*") {
      return;
    }
    await storage.setObj(
      STOKEY_RULES,
      rules.filter((item) => item.pattern !== pattern)
    );
  };

  const put = async (index, obj) => {
    rules = [...rules];
    if (!rules[index]) {
      return;
    }
    if (index === rules.length - 1) {
      obj.pattern = "*";
    }
    rules[index] = { ...rules[index], ...obj };
    await storage.setObj(STOKEY_RULES, rules);
  };

  const merge = async (newRules) => {
    const fromLangs = OPT_LANGS_FROM.map((item) => item[0]);
    const toLangs = OPT_LANGS_TO.map((item) => item[0]);
    rules = [...rules];
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

  return { list: rules, add, del, put, merge };
}
