import { useCallback } from "react";
import {
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
} from "../../config";
import { kissLog } from "../../libs/log";
import { sendTabMsg } from "../../libs/msg";

export function usePopupFeatureToggles({ processActions, setSetting }) {
  const dispatchPageAction = useCallback(
    async (action, enabled, logLabel) => {
      const args = { enabled };
      try {
        if (processActions) processActions({ action, args });
        else await sendTabMsg(action, args);
      } catch (error) {
        kissLog(logLabel, error);
      }
    },
    [processActions]
  );

  const handleTransboxToggle = useCallback(
    async (enabled) => {
      setSetting((previous) => ({
        ...previous,
        tranboxSetting: {
          ...previous.tranboxSetting,
          transOpen: enabled,
        },
      }));
      await dispatchPageAction(
        MSG_TRANSBOX_TOGGLE,
        enabled,
        "toggle selection translation"
      );
    },
    [dispatchPageAction, setSetting]
  );

  const handleMouseHoverToggle = useCallback(
    async (enabled) => {
      setSetting((previous) => ({
        ...previous,
        mouseHoverSetting: {
          ...previous.mouseHoverSetting,
          useMouseHover: enabled,
        },
      }));
      await dispatchPageAction(
        MSG_MOUSEHOVER_TOGGLE,
        enabled,
        "toggle hover translation"
      );
    },
    [dispatchPageAction, setSetting]
  );

  const handleInputToggle = useCallback(
    async (enabled) => {
      setSetting((previous) => ({
        ...previous,
        inputRule: { ...previous.inputRule, transOpen: enabled },
      }));
      await dispatchPageAction(
        MSG_TRANSINPUT_TOGGLE,
        enabled,
        "toggle input translation"
      );
    },
    [dispatchPageAction, setSetting]
  );

  return {
    handleInputToggle,
    handleMouseHoverToggle,
    handleTransboxToggle,
  };
}
