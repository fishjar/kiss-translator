import { providerError, supportsProviderCapability } from "./capabilities";
import { assertPluginCompatibility } from "./compatibility";
import { validatePermissions, validateServiceConfig } from "./instances";

export const ORIGIN_RULE_START_ID = 10000;
const ORIGIN_RULE_END_ID = 19999;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const signature = (rules) => JSON.stringify(rules);

function userEntryKey(value) {
  try {
    const url = new URL(value);
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    )
      return `origin:${url.origin}`;
  } catch {
    // Existing user patterns are not required to be complete URLs.
  }
  return `pattern:${value}`;
}

/** Rebuild provenance from snapshots; removing one contributor cannot remove another. */
export function collectPluginOriginEntries(apis = []) {
  const entries = new Map();
  for (const api of apis) {
    const provider = api?.provider;
    if (
      !provider?.source?.external ||
      typeof api.apiSlug !== "string" ||
      !api.apiSlug ||
      api.isDisabled ||
      !["script", "declarative"].includes(provider.implementation?.kind) ||
      !provider.permissions?.originRewrite?.length
    )
      continue;
    try {
      assertPluginCompatibility(provider);
      validatePermissions(provider.permissions, provider.settings || []);
      if (
        !Object.keys(provider.capabilities || {}).some((capability) =>
          supportsProviderCapability(api, capability)
        )
      )
        continue;
      validateServiceConfig(
        provider,
        api.pluginConfig || {},
        api.enabledCapabilities ?? Object.keys(provider.capabilities)
      );
    } catch {
      // Invalid/incompatible snapshots must not activate network rules.
      continue;
    }
    for (const origin of provider.permissions.originRewrite) {
      if (!entries.has(origin))
        entries.set(origin, {
          origin,
          instanceIds: new Set(),
          pluginIds: new Set(),
        });
      const entry = entries.get(origin);
      entry.instanceIds.add(api.apiSlug);
      entry.pluginIds.add(provider.source.pluginId);
    }
  }
  return [...entries.values()]
    .sort((a, b) => a.origin.localeCompare(b.origin))
    .map((entry) => ({
      origin: entry.origin,
      instanceIds: [...entry.instanceIds].sort(),
      pluginIds: [...entry.pluginIds].sort(),
    }));
}

export function buildOriginRules(
  setting,
  initiatorDomain,
  entries = collectPluginOriginEntries(setting.transApis)
) {
  const userEntries = Array.isArray(setting.orilist)
    ? setting.orilist
    : String(setting.orilist || "").split(/\n|,/);
  const seen = new Set();
  const rules = [];
  const add = (origin, condition, priority) => {
    const id = ORIGIN_RULE_START_ID + rules.length;
    if (id > ORIGIN_RULE_END_ID)
      throw providerError(
        "RESOURCE_BUDGET_EXCEEDED",
        "Origin rule range exhausted."
      );
    rules.push({
      id,
      priority,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "Origin", operation: "set", value: origin }],
      },
      condition: {
        ...condition,
        resourceTypes: ["xmlhttprequest"],
        initiatorDomains: [initiatorDomain],
      },
    });
  };
  for (const raw of userEntries) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const value = raw.trim(),
      key = userEntryKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    add(value, { urlFilter: value }, 2);
  }
  for (const { origin } of entries) {
    const key = `origin:${origin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    add(origin, { regexFilter: `^${escapeRegex(origin)}/` }, 1);
  }
  return rules;
}

function ownsRule(rule, initiatorDomain) {
  return (
    rule.id >= ORIGIN_RULE_START_ID &&
    rule.id <= ORIGIN_RULE_END_ID &&
    rule.action?.type === "modifyHeaders" &&
    rule.action.requestHeaders?.some(
      (header) => header.header.toLowerCase() === "origin"
    ) &&
    rule.condition?.initiatorDomains?.includes(initiatorDomain)
  );
}

/** Serial, coalesced configuration updates. Requests only await the current barrier. */
export function createOriginRuleManager({ dnr, getSetting, initiatorDomain }) {
  let revision = 0;
  let tail = Promise.resolve();
  let installedSignature;
  let failure;
  let activeInstances = new Set();
  async function ready() {
    if (!revision) return refresh();
    let pending;
    do {
      pending = tail;
      await pending;
    } while (pending !== tail);
    if (failure) throw failure;
  }
  function refresh() {
    const version = ++revision;
    tail = tail.then(async () => {
      if (version !== revision) return;
      try {
        const setting = await getSetting();
        if (version !== revision) return;
        const entries = collectPluginOriginEntries(setting.transApis);
        const rules = buildOriginRules(setting, initiatorDomain, entries);
        const nextSignature = signature(rules);
        if (nextSignature !== installedSignature) {
          if (!dnr?.getDynamicRules || !dnr?.updateDynamicRules)
            throw providerError(
              "ORIGIN_REWRITE_UNSUPPORTED",
              "This browser does not support plugin Origin rewriting."
            );
          const oldRules = await dnr.getDynamicRules();
          if (version !== revision) return;
          const owned = oldRules.filter((rule) =>
            ownsRule(rule, initiatorDomain)
          );
          if (owned.length || rules.length)
            await dnr.updateDynamicRules({
              removeRuleIds: owned.map((rule) => rule.id),
              addRules: rules,
            });
          installedSignature = nextSignature;
        }
        activeInstances = new Set(
          entries.flatMap((entry) => entry.instanceIds)
        );
        failure = undefined;
      } catch (error) {
        failure = providerError(
          "ORIGIN_REWRITE_FAILED",
          `Unable to synchronize Origin rules: ${error.message}`
        );
        if (error.code === "ORIGIN_REWRITE_UNSUPPORTED") failure = error;
      }
    });
    // The internal queue always resolves; callers explicitly observe the final status.
    return ready();
  }
  return {
    refresh,
    async ensure(instance) {
      if (!instance.provider?.permissions?.originRewrite?.length) return;
      await ready();
      if (!activeInstances.has(instance.apiSlug))
        throw providerError(
          "SERVICE_UNAVAILABLE",
          "Origin rewriting requires an enabled, configured plugin instance."
        );
    },
  };
}
