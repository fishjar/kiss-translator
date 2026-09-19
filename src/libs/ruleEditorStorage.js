import {
  DEFAULT_RULE,
  KV_RULES_KEY,
  MSG_EDIT_RULE,
  STOKEY_RULES,
  STOKEY_SETTING,
  STOKEY_RULESCACHE_PREFIX,
  STOKEY_DISABLED_SUB_RULES,
} from "../config";
import {
  checkRules,
  findMatchingRule,
  hostnamePattern,
  matchesRulePattern,
  deriveRuleContext,
} from "./rules";
import { SELECTOR_FIELDS, splitSelectorList } from "./selectorList";
import {
  getSettingWithDefault,
  normalizeStoredSetting,
  withTransaction,
} from "./storage";
import { loadOrFetchSubRules } from "./subRules";
import { kissLog } from "./log";
import { trySyncRules } from "./sync";
import { isExt } from "./client";
import { sendBgMsg } from "./msg";
import { getDomainOptions } from "./url";

const EDITABLE_FIELDS = [...SELECTOR_FIELDS, "autoScan", "pattern"];
let writeQueue = Promise.resolve();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const selectedSource = (setting) =>
  setting.injectRules
    ? setting.subrulesList?.find((source) => source.selected)?.url || ""
    : "";

// In extensions this queue lives in the background, shared by all editor tabs.
export function writeSiteRule({
  href,
  patch,
  expected,
  seed = null,
  inherited,
}) {
  const timestamp = Date.now();
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const preparedSource = selectedSource(await getSettingWithDefault());
      // Fetching may write the subscription cache, so it must precede the lock.
      if (preparedSource) {
        try {
          await loadOrFetchSubRules(preparedSource);
        } catch (error) {
          kissLog("load injectRules", error);
        }
      }
      const context = await withTransaction(async (transaction) => {
        const setting = normalizeStoredSetting(
          await transaction.getObj(STOKEY_SETTING)
        );
        const source = selectedSource(setting);
        // Prepare a newly selected source outside the transaction, then retry.
        if (source !== preparedSource) return null;
        const subRules = source
          ? (await transaction.getObj(STOKEY_RULESCACHE_PREFIX + source)) || []
          : [];
        const disabled = source
          ? (await transaction.getObj(STOKEY_DISABLED_SUB_RULES)) || {}
          : {};
        const dependencies = {
          subRules,
          disabledPatterns: Array.isArray(disabled[source])
            ? disabled[source]
            : [],
        };
        const result = await transaction.saveEdit(
          STOKEY_RULES,
          (rules) => {
            const latest = deriveRuleContext(href, {
              ...dependencies,
              personalRules: rules,
            });
            if (
              inherited &&
              keys.some((key) => latest.inherited[key] !== inherited[key])
            )
              throw new Error("rule-conflict");
            const index = rules.findIndex(
              (rule) => rule.pattern === previousPattern
            );
            if (
              rules.some((rule, i) => i !== index && rule.pattern === pattern)
            )
              throw new Error("duplicate-pattern");
            const current = index < 0 ? null : rules[index];
            const active = findMatchingRule(rules, href) || null;
            if (!current) {
              if (expected || !same(active, seed))
                throw new Error("rule-conflict");
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
            // Preserve unrelated fields from the latest rule and its priority.
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
            return next;
          },
          KV_RULES_KEY,
          { timestamp }
        );
        return deriveRuleContext(
          href,
          { ...dependencies, personalRules: result.value },
          pattern
        );
      });
      if (!context) continue;
      trySyncRules();
      return context;
    }
    throw new Error("rule-conflict");
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
