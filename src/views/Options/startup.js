import {
  STOKEY_RULES,
  STOKEY_SETTING,
  STOKEY_SYNC,
  STOKEY_WORDS,
} from "../../config";
import { isGm } from "../../libs/client";
import { adaptScript } from "../../libs/gm";
import { kissLog } from "../../libs/log";
import { runDataMigration } from "../../libs/storage";
import { refreshStorageKeys } from "../../libs/storageRefresh";
import { trySyncRules, trySyncSetting, trySyncWords } from "../../libs/sync";
import { sleep } from "../../libs/utils";
import { normalizeOptionsPath } from "./paths";

export const OPTIONS_SYNC_KEYS = [STOKEY_SETTING, STOKEY_RULES, STOKEY_WORDS];

export function getRequiredOptionsSyncKeys(path) {
  const pathname = normalizeOptionsPath(path);
  if (pathname === "/sync") return OPTIONS_SYNC_KEYS;
  if (
    pathname === "/" ||
    pathname === "/rules" ||
    pathname.startsWith("/rules/")
  ) {
    return [STOKEY_SETTING, STOKEY_RULES];
  }
  if (pathname === "/words" || pathname.startsWith("/words/")) {
    return [STOKEY_SETTING, STOKEY_WORDS];
  }
  return [STOKEY_SETTING];
}

async function prepareGmBridge() {
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    if (
      window.APP_INFO &&
      window.APP_INFO.name === process.env.REACT_APP_NAME
    ) {
      const { version, eventName } = window.APP_INFO;
      const installed = version?.split(".");
      const bundled = process.env.REACT_APP_VERSION?.split(".");
      if (
        !installed ||
        !bundled ||
        installed[0] !== bundled[0] ||
        installed[1] !== bundled[1]
      ) {
        throw new Error(
          `The version of the local script(v${version}) is not the latest version(v${process.env.REACT_APP_VERSION}).`
        );
      }

      if (eventName) adaptScript(eventName);
      return;
    }

    if (attempt < 8) await sleep(1000);
  }

  throw new Error(
    "Time out. Please confirm whether to install or enable KISS Translator GreaseMonkey script?"
  );
}

async function prepareLocalStorage() {
  if (isGm) await prepareGmBridge();
  // Finish legacy writes before mounting hooks or applying remote settings.
  if ((await runDataMigration()) === false) {
    throw new Error(
      "Unable to migrate local settings. Please reload this page."
    );
  }
}

async function syncAndRefresh(key, sync) {
  try {
    await sync();
  } catch (error) {
    kissLog(`sync options ${key}`, error?.message || error);
  }

  // Failed network requests may still update sync metadata or local storage.
  await refreshStorageKeys([key, STOKEY_SYNC]);
}

export function createOptionsStartup() {
  const localReady = prepareLocalStorage();
  // Settings initialize the shared remote destination before other syncs start.
  let previous = localReady.then(() =>
    syncAndRefresh(STOKEY_SETTING, trySyncSetting)
  );
  const completed = { [STOKEY_SETTING]: previous };
  const remaining = [
    [STOKEY_RULES, trySyncRules],
    [STOKEY_WORDS, trySyncWords],
  ];
  const required = getRequiredOptionsSyncKeys(window.location.hash);
  if (required.includes(STOKEY_WORDS) && !required.includes(STOKEY_RULES)) {
    remaining.reverse();
  }
  // Complete the entry page first without racing shared sync metadata writes.
  remaining.forEach(([key, sync]) => {
    previous = previous.then(() => syncAndRefresh(key, sync));
    completed[key] = previous;
  });
  return { localReady, completed };
}
