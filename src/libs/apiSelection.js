export function getEnabledApis(transApis = []) {
  return transApis
    .map((api, index) => ({ api, index }))
    .filter(({ api }) => api?.apiSlug && !api.isDisabled)
    .sort((a, b) => {
      const orderA = Number(a.api.sortOrder) || 0;
      const orderB = Number(b.api.sortOrder) || 0;
      return orderA - orderB || a.index - b.index;
    })
    .map(({ api }) => api);
}

export function resolveApiSelection(transApis, apiSlug) {
  const enabledApis = getEnabledApis(transApis);
  return enabledApis.find((api) => api.apiSlug === apiSlug) || enabledApis[0];
}

export function normalizeRuleApi(rule, transApis) {
  const api = resolveApiSelection(transApis, rule.apiSlug);
  return api && api.apiSlug !== rule.apiSlug
    ? { ...rule, apiSlug: api.apiSlug }
    : rule;
}
