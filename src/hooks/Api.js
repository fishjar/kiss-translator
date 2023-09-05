import { useCallback } from "react";
import { DEFAULT_TRANS_APIS } from "../config";
import { useSetting } from "./Setting";

export function useApi(translator) {
  const { setting, updateSetting } = useSetting();
  const apis = setting?.transApis || DEFAULT_TRANS_APIS;
  const api = apis[translator] || {};
  console.log("apis", translator, apis);

  const updateApi = useCallback(
    async (obj) => {
      const api = apis[translator] || {};
      const transApis = { ...apis, [translator]: { ...api, ...obj } };
      await updateSetting({ transApis });
    },
    [translator, apis, updateSetting]
  );

  const resetApi = useCallback(async () => {
    const transApis = { ...apis, [translator]: DEFAULT_TRANS_APIS[translator] };
    await updateSetting({ transApis });
  }, [translator, apis, updateSetting]);

  return { api, updateApi, resetApi };
}
