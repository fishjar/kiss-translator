import { useCallback } from "react";
import { DEFAULT_TOUCH_OPERATION } from "../config";
import { useSetting } from "./Setting";

export function useTouch(action) {
  const { setting, updateSetting } = useSetting();
  const touchOperations = setting?.touchOperations || DEFAULT_TOUCH_OPERATION;
  const touchOperation = touchOperations[action];

  const setTouchOperation = useCallback(
    async (val, idx) => {
      touchOperations[action][idx] = val;
      await updateSetting({ touchOperations: { ...touchOperations } });
    },
    [action, touchOperations, updateSetting]
  );

  return { touchOperation, setTouchOperation };
}
