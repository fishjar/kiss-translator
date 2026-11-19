import { browser } from "../libs/browser";
import { getSettingWithDefault } from "../libs/storage";
import { STOKEY_SETTING } from "../config/storage";
import { logger } from "../libs/log";
import { createOriginRuleManager } from "./originRules";

let manager;
let installed = false;
function getManager() {
  if (!manager)
    manager = createOriginRuleManager({
      dnr: browser?.declarativeNetRequest,
      getSetting: getSettingWithDefault,
      initiatorDomain: browser?.runtime?.getURL
        ? new URL(browser.runtime.getURL("")).hostname
        : "",
    });
  return manager;
}
const report = (error) =>
  logger.child("providers").warn("Origin rule synchronization failed", error);

export function installPluginOriginRules() {
  if (installed) return;
  installed = true;
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STOKEY_SETTING])
      void refreshPluginOriginRules().catch(report);
  });
  void refreshPluginOriginRules().catch(report);
}

export function refreshPluginOriginRules() {
  return getManager().refresh();
}

export function ensurePluginOriginRules(instance) {
  return getManager().ensure(instance);
}
