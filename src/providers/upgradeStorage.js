import { storage, normalizeStoredSetting } from "../libs/storage";
import { STOKEY_SETTING } from "../config/storage";
import { upgradeServiceInstance } from "./upgrade";

/** Rebase on the latest saved instance under the settings storage lock. */
export async function commitServiceUpgrade(apiSlug, pack) {
  return storage.withTransaction((transaction) =>
    transaction.saveEdit(STOKEY_SETTING, (current) => {
      const setting = normalizeStoredSetting(current);
      const api = setting.transApis.find((item) => item.apiSlug === apiSlug);
      if (!api) throw new Error("Service instance has been deleted.");
      const upgraded = upgradeServiceInstance(api, pack);
      return {
        ...setting,
        transApis: setting.transApis.map((item) =>
          item.apiSlug === apiSlug ? upgraded : item
        ),
      };
    })
  );
}
