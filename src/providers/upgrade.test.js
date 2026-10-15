import {
  copyCompatibleConfig,
  serviceReferences,
  replaceServiceReferences,
} from "./upgrade";

const newApi = {
  apiSlug: "new",
  provider: {
    apiVersion: "1",
    capabilities: {
      translate: { handler: "translate" },
      dictionary: { handler: "dictionary" },
    },
  },
};
test("reference replacement preserves order, deduplicates and never rewrites instance identity or opaque data", () => {
  const setting = {
    transApis: [{ apiSlug: "old", pluginConfig: { apiSlug: "old" } }, newApi],
    tranboxSetting: { apiSlugs: ["a", "old", "new"], aiDictApiSlug: "old" },
    providerPlugins: [{ apiSlug: "old" }],
  };
  const rules = [{ apiSlug: "old", apiSlugs: ["stale"], code: "old" }];
  const selected = serviceReferences(setting, rules, "old");
  expect(selected).toHaveLength(3);
  const result = replaceServiceReferences(
    setting,
    rules,
    "old",
    newApi,
    selected
  );
  expect(result.setting.tranboxSetting).toEqual({
    apiSlugs: ["a", "new"],
    aiDictApiSlug: "new",
  });
  expect(result.rules[0]).toEqual({
    apiSlug: "new",
    apiSlugs: ["stale"],
    code: "old",
  });
  expect(result.setting.transApis[0]).toEqual(setting.transApis[0]);
  expect(setting.tranboxSetting.apiSlugs).toEqual(["a", "old", "new"]);
});
test("changed references and missing target capabilities abort instead of partially replacing", () => {
  const setting = { subtitleSetting: { summaryApiSlug: "old" } };
  const selected = serviceReferences(setting, [], "old");
  expect(() =>
    replaceServiceReferences(setting, [], "old", newApi, selected)
  ).toThrow("summarize");
  expect(() =>
    replaceServiceReferences(
      { subtitleSetting: {} },
      [],
      "old",
      newApi,
      selected
    )
  ).toThrow("变化");
});
test("copy rejects changed secret types and invalid new constraints and keeps independent data", () => {
  const api = {
    provider: {
      settings: [
        { key: "key", type: "password" },
        { key: "speed", type: "number" },
        { key: "model", type: "text" },
      ],
    },
    pluginConfig: { key: "secret", speed: 1, model: "m" },
  };
  const copied = copyCompatibleConfig(api, [
    { key: "key", type: "text" },
    { key: "speed", type: "number", min: 2 },
    { key: "model", type: "text" },
  ]);
  expect(copied).toEqual({ values: { model: "m" }, skipped: ["key", "speed"] });
  copied.values.model = "changed";
  expect(api.pluginConfig.model).toBe("m");
});
