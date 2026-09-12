import { useEffect, useMemo, useState } from "react";
import { MSG_COMMAND_SHORTCUTS } from "../config";
import { isExt } from "../libs/client";
import { sendBgMsg } from "../libs/msg";
import { normalizeShortcutKeys } from "../libs/shortcutLabel";

export function buildOverviewShortcutMap(setting, browserCommands = []) {
  const commandMap = Object.fromEntries(
    browserCommands.map(({ name, shortcut }) => [name, shortcut])
  );
  const configured = setting?.shortcuts || {};
  const resolveCommand = (name, fallback) =>
    Object.prototype.hasOwnProperty.call(commandMap, name)
      ? commandMap[name]
      : fallback;
  const resolveFirstCommand = (names, fallback) => {
    const matchedName = names.find((name) =>
      Object.prototype.hasOwnProperty.call(commandMap, name)
    );
    return matchedName ? commandMap[matchedName] : fallback;
  };

  return {
    page: normalizeShortcutKeys(
      resolveCommand("toggleTranslate", configured.toggleTranslate)
    ),
    popup: normalizeShortcutKeys(
      resolveFirstCommand(
        ["_execute_action", "_execute_browser_action"],
        configured.togglePopup
      )
    ),
    style: normalizeShortcutKeys(
      resolveCommand("toggleStyle", configured.toggleStyle)
    ),
    selection: normalizeShortcutKeys(
      resolveCommand("openTranbox", setting?.tranboxSetting?.tranboxShortcut)
    ),
    input: normalizeShortcutKeys(setting?.inputRule?.triggerShortcut),
    settings: normalizeShortcutKeys(
      resolveCommand("openOptions", configured.openSetting)
    ),
  };
}

export function useOverviewShortcuts(setting) {
  const [browserCommands, setBrowserCommands] = useState([]);

  useEffect(() => {
    if (!isExt) return undefined;
    let active = true;
    Promise.resolve(sendBgMsg(MSG_COMMAND_SHORTCUTS))
      .then((commands) => {
        if (active) setBrowserCommands(commands || []);
      })
      .catch(() => {
        if (active) setBrowserCommands([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return useMemo(
    () => buildOverviewShortcutMap(setting, browserCommands),
    [browserCommands, setting]
  );
}
