import { DEFAULT_RULE, KV_RULES_KEY, MSG_EDIT_RULE } from "../config";
import {
  checkRules,
  findMatchingRule,
  hostnamePattern,
  matchesRulePattern,
  resolveRuleContext,
} from "./rules";
import { SELECTOR_FIELDS, splitSelectorList } from "./selectorList";
import {
  getRulesWithDefault,
  getSettingWithDefault,
  setRules,
  putSyncMeta,
} from "./storage";
import { trySyncRules } from "./sync";
import { isExt } from "./client";
import { sendBgMsg } from "./msg";
import { getDomainOptions } from "./url";

const EDITABLE_FIELDS = [...SELECTOR_FIELDS, "autoScan", "pattern"];
let writeQueue = Promise.resolve();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// In extensions this queue lives in the background, shared by all editor tabs.
export function writeSiteRule({
  href,
  patch,
  expected,
  seed = null,
  inherited,
}) {
  const write = async () => {
    hostnamePattern(href);
    const defaultPattern = getDomainOptions(href)[0];
    const previousPattern = expected?.pattern || defaultPattern;
    if (previousPattern === "*") throw new Error("invalid-pattern");
    const rawPattern = patch?.pattern ?? previousPattern;
    if (typeof rawPattern !== "string") throw new Error("invalid-patch");
    const pattern = rawPattern.trim();
    const keys = Object.keys(patch || {});
    if (!keys.length || keys.some((key) => !EDITABLE_FIELDS.includes(key))) {
      throw new Error("invalid-patch");
    }
    for (const key of keys) {
      if (typeof patch[key] !== "string") throw new Error("invalid-patch");
      if (SELECTOR_FIELDS.includes(key)) splitSelectorList(patch[key]);
      else if (key === "pattern") {
        if (!pattern || pattern === "*") throw new Error("invalid-pattern");
      } else if (!["true", "false", "*"].includes(patch[key]))
        throw new Error("invalid-patch");
    }
    if (inherited) {
      const latest = await resolveRuleContext(
        href,
        await getSettingWithDefault()
      );
      if (keys.some((key) => latest.inherited[key] !== inherited[key]))
        throw new Error("rule-conflict");
    }
    const rules = await getRulesWithDefault();
    const index = rules.findIndex((rule) => rule.pattern === previousPattern);
    if (rules.some((rule, i) => i !== index && rule.pattern === pattern))
      throw new Error("duplicate-pattern");
    const current = index < 0 ? null : rules[index];
    const active = findMatchingRule(rules, href) || null;
    if (!current) {
      if (expected || !same(active, seed)) throw new Error("rule-conflict");
    } else if (
      !expected ||
      current.enabled === false ||
      (matchesRulePattern(href, current.pattern) &&
        active?.pattern !== previousPattern) ||
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
    const persisted = (await getRulesWithDefault()).find(
      (rule) => rule.pattern === pattern
    );
    if (!persisted || keys.some((key) => persisted[key] !== saved[key])) {
      throw new Error("rule-conflict");
    }
    // Sync must see this edit's timestamp before comparing remote versions.
    await putSyncMeta(KV_RULES_KEY);
    trySyncRules();
    return resolveRuleContext(href, await getSettingWithDefault(), pattern);
  };
  // Userscript pages on the same origin can also coordinate through Web Locks.
  const result = writeQueue.then(() =>
    !isExt && globalThis.navigator?.locks
      ? navigator.locks.request("kiss-rule-editor-write", write)
      : write()
  );
  writeQueue = result.catch(() => {});
  return result;
}

export const saveSiteRule = (request) =>
  isExt ? sendBgMsg(MSG_EDIT_RULE, request) : writeSiteRule(request);
