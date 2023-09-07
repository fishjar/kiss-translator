import { useCallback } from "react";
import { DEFAULT_TRANS_APIS } from "../config";
import { useSetting } from "./Setting";

export function useApi(translator) {
  const { setting, updateSetting } = useSetting();
  const transApis = setting?.transApis || DEFAULT_TRANS_APIS;

  const updateApi = useCallback(
    async (obj) => {
      const api = transApis[translator] || {};
      Object.assign(transApis, { [translator]: { ...api, ...obj } });
      await updateSetting({ transApis });
    },
    [translator, transApis, updateSetting]
  );

  const resetApi = useCallback(async () => {
    Object.assign(transApis, { [translator]: DEFAULT_TRANS_APIS[translator] });
    await updateSetting({ transApis });
  }, [translator, transApis, updateSetting]);

  return { api: transApis[translator] || {}, updateApi, resetApi };
}
