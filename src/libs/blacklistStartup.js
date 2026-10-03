import { STOKEY_SETTING } from "../config";
import { isInBlacklist } from "./blacklist";
import { browser } from "./browser";

function parseSetting(value) {
  if (typeof value !== "string") return null;
  try {
    const setting = JSON.parse(value);
    if (
      !setting ||
      typeof setting !== "object" ||
      Array.isArray(setting) ||
      (setting.blacklist !== undefined && typeof setting.blacklist !== "string")
    ) {
      return null;
    }
    return setting;
  } catch (_error) {
    return null;
  }
}

/** Resume a blocked extension document after its blacklist entry is removed. */
export function createBlacklistStartupRecovery({
  getHref,
  onUnblocked,
  extensionBrowser = browser,
}) {
  let listener = null;
  let revision = 0;
  let resuming = false;
  let watchAfterResume = false;

  const removeListener = () => {
    if (!listener) return;
    extensionBrowser.storage.onChanged.removeListener(listener);
    listener = null;
    revision += 1;
  };

  const checkSetting = (value) => {
    if (!listener) return;
    const setting = parseSetting(value);
    if (!setting || isInBlacklist(getHref(), setting.blacklist)) return;

    removeListener();
    resuming = true;
    const resumeRevision = revision;
    const finish = () => {
      resuming = false;
      if (watchAfterResume) {
        watchAfterResume = false;
        watch();
      }
    };
    Promise.resolve()
      .then(() => {
        if (revision === resumeRevision) return onUnblocked();
      })
      .then(finish, finish);
  };

  const watch = () => {
    if (resuming) {
      watchAfterResume = true;
      return;
    }
    if (
      listener ||
      !extensionBrowser?.storage?.onChanged?.addListener ||
      !extensionBrowser?.storage?.onChanged?.removeListener ||
      !extensionBrowser?.storage?.local?.get
    ) {
      return;
    }

    const nextListener = (changes, area) => {
      if (
        listener !== nextListener ||
        area !== "local" ||
        !changes?.[STOKEY_SETTING]
      ) {
        return;
      }
      revision += 1;
      checkSetting(changes[STOKEY_SETTING].newValue);
    };
    listener = nextListener;
    extensionBrowser.storage.onChanged.addListener(listener);

    // Re-read after subscribing to cover edits made during the startup read.
    const readRevision = revision;
    Promise.resolve()
      .then(() => extensionBrowser.storage.local.get([STOKEY_SETTING]))
      .then(
        (stored) => {
          if (revision === readRevision) {
            checkSetting(stored?.[STOKEY_SETTING]);
          }
        },
        () => {}
      );
  };

  const cancel = () => {
    watchAfterResume = false;
    removeListener();
    revision += 1;
  };

  return { watch, cancel };
}
