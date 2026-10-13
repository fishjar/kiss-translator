jest.mock("../libs/storage", () => ({
  storage: { withTransaction: jest.fn() },
}));
import { storage } from "../libs/storage";
import { STOKEY_SETTING, STOKEY_RULES } from "../config/storage";
import { commitServiceReplacement } from "./upgradeStorage";
import { instanceTestSignature, serviceReferences } from "./upgrade";

const api = {
  apiSlug: "new",
  provider: {
    apiVersion: "1",
    capabilities: { translate: { handler: "translate" } },
  },
  pluginConfig: { model: "m" },
};
let setting;
let rules;
let save;
beforeEach(() => {
  setting = { transApis: [api], tranboxSetting: { apiSlugs: ["old"] } };
  rules = null;
  save = jest.fn();
  storage.withTransaction.mockImplementation((operation) =>
    operation({
      getObj: async (key) => (key === STOKEY_SETTING ? setting : rules),
      saveEdit: save,
    })
  );
});
test("settings-only replacement never writes an empty rules array over implicit defaults", async () => {
  const selected = serviceReferences(setting, [], "old");
  await commitServiceReplacement("old", "new", selected, {
    translate: instanceTestSignature(api),
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toBe(STOKEY_SETTING);
  expect(save.mock.calls[0][1]().tranboxSetting.apiSlugs).toEqual(["new"]);
});
test("configuration changes invalidate test evidence before any write is staged", async () => {
  const selected = serviceReferences(setting, [], "old");
  const verified = instanceTestSignature(api);
  setting = {
    ...setting,
    transApis: [{ ...api, pluginConfig: { model: "changed" } }],
  };
  await expect(
    commitServiceReplacement("old", "new", selected, { translate: verified })
  ).rejects.toThrow("重新测试");
  expect(save).not.toHaveBeenCalled();
});
test("a reordered rule cannot be mistaken for the rule reviewed at that array position", async () => {
  rules = [
    { apiSlug: "old", pattern: "first" },
    { apiSlug: "old", pattern: "second" },
  ];
  const selected = serviceReferences(setting, rules, "old").filter(
    (item) => item.scope === "rules"
  );
  rules.reverse();
  await expect(
    commitServiceReplacement("old", "new", selected, {
      translate: instanceTestSignature(api),
    })
  ).rejects.toThrow("变化");
  expect(save).not.toHaveBeenCalled();
});
