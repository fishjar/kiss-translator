import { DEFAULT_RULE, KV_RULES_KEY, MSG_EDIT_RULE } from "../config";
import {
  checkRules,
  findMatchingRule,
  hostnamePattern,
  resolveRuleContext,
} from "./rules";
import { SELECTOR_FIELDS, splitSelectorList } from "./selectorList";
import {
  getRulesWithDefault,
  getSettingWithDefault,
  setRules,
  debounceSyncMeta,
} from "./storage";
import { trySyncRules } from "./sync";
import { isExt } from "./client";
import { sendBgMsg } from "./msg";

const EDITABLE_FIELDS = [...SELECTOR_FIELDS, "autoScan"];
let writeQueue = Promise.resolve();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// In extensions this queue lives in the background, shared by all editor tabs.
export function writeSiteRule({ href, patch, expected, seed = null }) {
  const write = async () => {
    const pattern = hostnamePattern(href);
    const keys = Object.keys(patch || {});
    if (!keys.length || keys.some((key) => !EDITABLE_FIELDS.includes(key))) {
      throw new Error("invalid-patch");
    }
    for (const key of keys) {
      if (typeof patch[key] !== "string") throw new Error("invalid-patch");
      if (SELECTOR_FIELDS.includes(key)) splitSelectorList(patch[key]);
      else if (!["true", "false", "*"].includes(patch[key]))
        throw new Error("invalid-patch");
    }
    const rules = await getRulesWithDefault();
    const index = rules.findIndex((rule) => rule.pattern === pattern);
    const current = index < 0 ? null : rules[index];
    const active = findMatchingRule(rules, href) || null;
    if (!current) {
      if (expected || !same(active, seed)) throw new Error("rule-conflict");
    } else if (
      !expected ||
      current.enabled === false ||
      active?.pattern !== pattern ||
      keys.some(
        (key) =>
          (current[key] ?? DEFAULT_RULE[key]) !==
          (expected[key] ?? DEFAULT_RULE[key])
      )
    ) {
      throw new Error("rule-conflict");
    }
    // A new host rule shadows the matched personal override in this tier.
    // Preserve its unrelated service/style settings and inheritance semantics.
    const saved = checkRules([
      {
        ...DEFAULT_RULE,
        ...(current || seed),
        ...patch,
        pattern,
        enabled: true,
      },
    ])[0];
    const next = [...rules];
    if (index < 0) next.unshift(saved);
    else next[index] = saved;
    await setRules(next);
    debounceSyncMeta(KV_RULES_KEY);
    trySyncRules();
    return resolveRuleContext(href, await getSettingWithDefault());
  };
  const result = writeQueue.then(write);
  writeQueue = result.catch(() => {});
  return result;
}

export const saveSiteRule = (request) =>
  isExt ? sendBgMsg(MSG_EDIT_RULE, request) : writeSiteRule(request);
