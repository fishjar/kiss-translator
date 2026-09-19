import { useCallback, useMemo } from "react";
import {
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
} from "../../config";
import { useConfirmedPopupUpdate } from "./useConfirmedPopupUpdate";

const getFeatureValues = (setting) => ({
  selection: setting?.tranboxSetting?.transOpen,
  hover: setting?.mouseHoverSetting?.useMouseHover,
  input: setting?.inputRule?.transOpen,
});

export function usePopupFeatureToggles({
  setting,
  setSetting,
  dispatchPageAction,
  onError,
}) {
  const value = useMemo(() => getFeatureValues(setting), [setting]);
  const setValue = useCallback(
    (update) => {
      setSetting((previous) => {
        const next = update(getFeatureValues(previous));
        return {
          ...previous,
          tranboxSetting: {
            ...previous.tranboxSetting,
            transOpen: next.selection,
          },
          mouseHoverSetting: {
            ...previous.mouseHoverSetting,
            useMouseHover: next.hover,
          },
          inputRule: { ...previous.inputRule, transOpen: next.input },
        };
      });
    },
    [setSetting]
  );
  const update = useConfirmedPopupUpdate({ value, setValue, onError });
  const toggle = useCallback(
    (name, action, enabled, topFrame = false) =>
      update({ [name]: enabled }, async () => {
        const response = await dispatchPageAction(
          action,
          { enabled },
          topFrame
        );
        return getFeatureValues(response?.setting);
      }),
    [dispatchPageAction, update]
  );

  return {
    handleTransboxToggle: (enabled) =>
      toggle("selection", MSG_TRANSBOX_TOGGLE, enabled),
    handleMouseHoverToggle: (enabled) =>
      toggle("hover", MSG_MOUSEHOVER_TOGGLE, enabled),
    handleInputToggle: (enabled) =>
      toggle("input", MSG_TRANSINPUT_TOGGLE, enabled, true),
  };
}
