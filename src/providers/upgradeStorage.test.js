jest.mock("../libs/storage", () => ({
  storage: { withTransaction: jest.fn() },
  normalizeStoredSetting: (setting) => setting,
}));
jest.mock("./upgrade", () => ({ upgradeServiceInstance: jest.fn() }));
import { storage } from "../libs/storage";
import { STOKEY_SETTING } from "../config/storage";
import { commitServiceUpgrade } from "./upgradeStorage";
import { upgradeServiceInstance } from "./upgrade";

let setting, save;
beforeEach(() => {
  jest.clearAllMocks();
  setting = {
    transApis: [
      { apiSlug: "stable", apiName: "latest", httpTimeout: 77 },
      { apiSlug: "other" },
    ],
    tranboxSetting: { apiSlugs: ["stable"] },
    subtitleSetting: { asrApiSlug: "stable" },
  };
  upgradeServiceInstance.mockImplementation((api) => ({
    ...api,
    provider: { version: "new" },
  }));
  save = jest.fn(async (key, update) => {
    const next = update(setting);
    setting = next;
    return next;
  });
  storage.withTransaction.mockImplementation((operation) =>
    operation({ saveEdit: save })
  );
});

test("rebases on the latest instance and writes settings only, retaining references and other instances", async () => {
  const original = setting;
  const pack = {};
  await commitServiceUpgrade("stable", pack);
  expect(upgradeServiceInstance).toHaveBeenCalledWith(
    original.transApis[0],
    pack
  );
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toBe(STOKEY_SETTING);
  expect(setting.transApis).toHaveLength(2);
  expect(setting.transApis[0]).toMatchObject({
    apiSlug: "stable",
    apiName: "latest",
    httpTimeout: 77,
  });
  expect(setting.transApis[1]).toBe(original.transApis[1]);
  expect(setting.tranboxSetting).toBe(original.tranboxSetting);
  expect(setting.subtitleSetting).toBe(original.subtitleSetting);
});

test("deleted instances are never recreated", async () => {
  const original = setting;
  await expect(commitServiceUpgrade("deleted", {})).rejects.toThrow("deleted");
  expect(setting).toBe(original);
  expect(upgradeServiceInstance).not.toHaveBeenCalled();
});

test("write failure preserves the original saved snapshot", async () => {
  const original = setting;
  save.mockImplementation(async (key, update) => {
    update(setting);
    throw new Error("write failed");
  });
  await expect(commitServiceUpgrade("stable", {})).rejects.toThrow(
    "write failed"
  );
  expect(setting).toBe(original);
});
