import {
  buildOriginRules,
  collectPluginOriginEntries,
  createOriginRuleManager,
} from "./originRules";
import { validatePermissions } from "./instances";

const A = "https://a.example",
  B = "https://b.example",
  C = "https://c.example";
const instance = (id, origins = [A], overrides = {}) => ({
  apiSlug: id,
  enabledCapabilities: ["chat"],
  pluginConfig: {},
  provider: {
    apiVersion: 1,
    source: { external: true, pluginId: id },
    implementation: { kind: "script" },
    capabilities: { chat: { handler: "chat", outputModes: ["complete"] } },
    settings: [],
    permissions: { network: origins, originRewrite: origins },
  },
  ...overrides,
});
const domains = (rules) => rules.map((r) => r.action.requestHeaders[0].value);

function fixture(setting, initial = []) {
  let current = setting;
  let rules = initial;
  const dnr = {
    getDynamicRules: jest.fn(async () => rules),
    updateDynamicRules: jest.fn(async ({ removeRuleIds, addRules }) => {
      rules = [
        ...rules.filter((r) => !removeRuleIds.includes(r.id)),
        ...addRules,
      ];
    }),
  };
  const getSetting = jest.fn(async () => current);
  const manager = createOriginRuleManager({
    dnr,
    getSetting,
    initiatorDomain: "extension-id",
  });
  return {
    manager,
    dnr,
    getSetting,
    set: (value) => {
      current = value;
    },
    rules: () => rules,
  };
}

test("multiple plugins and instances merge with the user list without changing saved settings", () => {
  const setting = {
    orilist: `${A},\n${A}`,
    transApis: [
      instance("one", [A, B]),
      instance("two", [B, C]),
      instance("three", [B]),
    ],
  };
  const before = JSON.stringify(setting);
  const entries = collectPluginOriginEntries(setting.transApis);
  expect(entries.find((e) => e.origin === B).instanceIds).toEqual([
    "one",
    "three",
    "two",
  ]);
  const rules = buildOriginRules(setting, "extension-id");
  expect(domains(rules)).toEqual([A, B, C]);
  expect(rules.map((r) => r.priority)).toEqual([2, 1, 1]);
  expect(JSON.stringify(setting)).toBe(before);
});

test("normalizes complete user-origin identities but preserves existing pattern semantics", () => {
  const rules = buildOriginRules(
    {
      orilist: `https://A.EXAMPLE:443/,${A},a.example/path,a.example/path`,
      transApis: [instance("one")],
    },
    "extension-id"
  );
  expect(domains(rules)).toEqual(["https://A.EXAMPLE:443/", "a.example/path"]);
  expect(rules[1].condition.urlFilter).toBe("a.example/path");
});

test("plugin matching is exact across scheme, host, port and URL position", () => {
  const [rule] = buildOriginRules(
    { transApis: [instance("one", ["https://api.example:8443"])] },
    "extension-id"
  );
  const pattern = new RegExp(rule.condition.regexFilter);
  expect(pattern.test("https://api.example:8443/v1/chat/completions")).toBe(
    true
  );
  for (const url of [
    "http://api.example:8443/v1",
    "https://api.example/v1",
    "https://api.example:84430/v1",
    "https://sub.api.example:8443/v1",
    "https://evil.example/?url=https://api.example:8443/",
  ])
    expect(pattern.test(url)).toBe(false);
  expect(rule.condition.initiatorDomains).toEqual(["extension-id"]);
  expect(rule.condition.resourceTypes).toEqual(["xmlhttprequest"]);
});

test("disabled, unconfigured, incompatible and non-executable snapshots do not activate rules", () => {
  const disabled = instance("disabled", [A], { isDisabled: true });
  const noCapabilities = instance("off", [A], { enabledCapabilities: [] });
  const required = instance("missing");
  required.provider.settings = [{ key: "model", type: "text", required: true }];
  const future = instance("future");
  future.provider.minHostVersion = "9999.0.0";
  const native = instance("native");
  native.provider.implementation.kind = "native";
  const invalid = instance("invalid");
  invalid.provider.permissions.network = [];
  expect(
    collectPluginOriginEntries([
      disabled,
      noCapabilities,
      required,
      future,
      native,
      invalid,
    ])
  ).toEqual([]);
  expect(
    buildOriginRules(
      { providerPlugins: [instance("template")], transApis: [] },
      "extension-id"
    )
  ).toEqual([]);
});

test.each([
  null,
  "https://a.example",
  ["https://a.example/"],
  ["https://a.example/path"],
  ["https://a.example?q=1"],
  ["https://*.example"],
  [B],
  ["ftp://a.example"],
])("rejects invalid or out-of-permission declarations: %j", (originRewrite) => {
  expect(() =>
    validatePermissions({ network: [A], originRewrite }, [])
  ).toThrow();
});

test("duplicate valid declarations are accepted and deduplicated", () => {
  expect(() =>
    validatePermissions({ network: [A], originRewrite: [A, A] }, [])
  ).not.toThrow();
  expect(
    domains(
      buildOriginRules({ transApis: [instance("one", [A, A])] }, "extension-id")
    )
  ).toEqual([A]);
});

test("removing contributors only removes origins no longer provided by anyone", async () => {
  const one = instance("one", [A, B]),
    two = instance("two", [B, C]);
  const f = fixture({ orilist: A, transApis: [one, two] });
  await f.manager.refresh();
  expect(domains(f.rules())).toEqual([A, B, C]);
  f.set({ orilist: A, transApis: [two] });
  await f.manager.refresh();
  expect(f.dnr.updateDynamicRules).toHaveBeenCalledTimes(1);
  expect(domains(f.rules())).toEqual([A, B, C]);
  f.set({ orilist: A, transApis: [{ ...two, isDisabled: true }] });
  await f.manager.refresh();
  expect(domains(f.rules())).toEqual([A]);
  await expect(f.manager.ensure(two)).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
  });
});

test("reordering and repeating contributors does not cause browser updates or serialize requests", async () => {
  const one = instance("one", [B, A]),
    two = instance("two", [A]);
  const f = fixture({ transApis: [one, two] });
  await f.manager.refresh();
  f.set({ transApis: [two, one, two] });
  await f.manager.refresh();
  const reads = f.getSetting.mock.calls.length;
  await Promise.all(Array.from({ length: 20 }, () => f.manager.ensure(one)));
  expect(f.getSetting).toHaveBeenCalledTimes(reads);
  expect(f.dnr.updateDynamicRules).toHaveBeenCalledTimes(1);
});

test("initial execution waits for rule installation", async () => {
  const one = instance("one"),
    f = fixture({ transApis: [one] });
  let complete;
  f.dnr.updateDynamicRules.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  let ready = false;
  const waiting = f.manager.ensure(one).then(() => {
    ready = true;
  });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(ready).toBe(false);
  complete();
  await waiting;
  expect(ready).toBe(true);
});

test("coalesces pending changes and applies the newest settings", async () => {
  const f = fixture({ transApis: [instance("one", [A])] });
  const first = f.manager.refresh();
  f.set({ transApis: [instance("two", [B])] });
  const second = f.manager.refresh();
  await Promise.all([first, second]);
  expect(domains(f.rules())).toEqual([B]);
  expect(f.dnr.updateDynamicRules).toHaveBeenCalledTimes(1);
});

test("startup reconciles stale Origin rules but preserves CSP and unrelated rules", async () => {
  const stale = buildOriginRules(
    { transApis: [instance("old", [C])] },
    "extension-id"
  );
  const csp = { id: 1, action: { type: "modifyHeaders", responseHeaders: [] } };
  const unrelated = { id: 25000, action: { type: "block" } };
  const f = fixture({ transApis: [instance("new", [A])] }, [
    csp,
    unrelated,
    ...stale,
  ]);
  await f.manager.refresh();
  expect(f.rules()).toContain(csp);
  expect(f.rules()).toContain(unrelated);
  expect(
    domains(f.rules().filter((r) => r.id >= 10000 && r.id < 20000))
  ).toEqual([A]);
});

test("failed synchronization blocks affected plugins, can recover, and leaves ordinary plugins unaffected", async () => {
  const one = instance("one"),
    f = fixture({ transApis: [one] });
  f.dnr.updateDynamicRules.mockRejectedValueOnce(new Error("quota exceeded"));
  await expect(f.manager.refresh()).rejects.toMatchObject({
    code: "ORIGIN_REWRITE_FAILED",
  });
  await expect(f.manager.ensure(one)).rejects.toThrow("quota exceeded");
  await expect(f.manager.ensure({ provider: {} })).resolves.toBeUndefined();
  await f.manager.refresh();
  await expect(f.manager.ensure(one)).resolves.toBeUndefined();
});

test("unsupported browsers report a feature error", async () => {
  const manager = createOriginRuleManager({
    dnr: undefined,
    getSetting: async () => ({ transApis: [instance("one")] }),
    initiatorDomain: "id",
  });
  await expect(manager.ensure(instance("one"))).rejects.toMatchObject({
    code: "ORIGIN_REWRITE_UNSUPPORTED",
  });
});

test("wildcard rewrite origins remain forbidden even if the network list contains them", () => {
  expect(() =>
    validatePermissions(
      { network: ["https://*.example"], originRewrite: ["https://*.example"] },
      []
    )
  ).toThrow();
});
