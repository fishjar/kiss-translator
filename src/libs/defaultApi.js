import {
  DEFAULT_INPUT_RULE,
  DEFAULT_SUBTITLE_SETTING,
  DEFAULT_TRANBOX_SETTING,
  DEFAULT_RULES,
  GLOBLA_RULE,
} from "../config";

export const applyDefaultApiToSetting = (setting, apiSlug) => ({
  ...setting,
  inputRule: {
    ...DEFAULT_INPUT_RULE,
    ...(setting?.inputRule || {}),
    apiSlug,
  },
  tranboxSetting: {
    ...DEFAULT_TRANBOX_SETTING,
    ...(setting?.tranboxSetting || {}),
    apiSlugs: [apiSlug],
  },
  subtitleSetting: {
    ...DEFAULT_SUBTITLE_SETTING,
    ...(setting?.subtitleSetting || {}),
    apiSlug,
  },
});

export const applyDefaultApiToRules = (rules, apiSlug) => {
  const list = Array.isArray(rules) ? rules : DEFAULT_RULES;
  const hasGlobalRule = list.some((rule) => rule?.pattern === "*");

  if (!hasGlobalRule) {
    return [{ ...GLOBLA_RULE, apiSlug }, ...list];
  }

  return list.map((rule) =>
    rule?.pattern === "*" ? { ...rule, apiSlug } : rule
  );
};
