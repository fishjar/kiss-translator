import { browser } from "../libs/browser";
import { STOKEY_SETTING } from "../config/storage";
import { createOriginRuleManager } from "./originRules";
import {
  installPluginOriginRules,
  ensurePluginOriginRules,
} from "./originRulesBackground";

jest.mock("../libs/browser", () => ({
  browser: {
    storage: { onChanged: { addListener: jest.fn() } },
    runtime: { getURL: () => "chrome-extension://test-id/" },
  },
}));
jest.mock("../libs/storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("../libs/log", () => ({
  logger: { child: () => ({ warn: jest.fn() }) },
}));
jest.mock("./originRules", () => ({ createOriginRuleManager: jest.fn() }));

test("startup and local settings changes synchronize rules; requests reuse the manager", async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  const ensure = jest.fn().mockResolvedValue(undefined);
  createOriginRuleManager.mockReturnValue({ refresh, ensure });
  installPluginOriginRules();
  installPluginOriginRules();
  expect(browser.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  const changed = browser.storage.onChanged.addListener.mock.calls[0][0];
  changed({ other: {} }, "local");
  changed({ [STOKEY_SETTING]: {} }, "sync");
  expect(refresh).toHaveBeenCalledTimes(1);
  changed({ [STOKEY_SETTING]: {} }, "local");
  expect(refresh).toHaveBeenCalledTimes(2);
  const instance = { apiSlug: "one" };
  await ensurePluginOriginRules(instance);
  expect(ensure).toHaveBeenCalledWith(instance);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(createOriginRuleManager).toHaveBeenCalledTimes(1);
});
