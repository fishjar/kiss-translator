import { useCallback, useEffect, useMemo } from "react";
import { DEFAULT_API_LIST, API_SPE_TYPES } from "../config";
import { useSetting } from "./Setting";

function useApiState() {
  const { setting, updateSetting } = useSetting();
  const transApis = setting?.transApis || [];

  return { transApis, updateSetting };
}

export function useApiList() {
  const { transApis, updateSetting } = useApiState();

  useEffect(() => {
    const curSlugs = new Set(transApis.map((api) => api.apiSlug));
    const missApis = DEFAULT_API_LIST.filter(
      (api) => !curSlugs.has(api.apiSlug)
    );
    if (missApis.length > 0) {
      updateSetting((prev) => ({
        ...prev,
        transApis: [...(prev?.transApis || []), ...missApis],
      }));
    }
  }, [transApis, updateSetting]);

  const userApis = useMemo(
    () =>
      transApis
        .filter((api) => !API_SPE_TYPES.builtin.has(api.apiSlug))
        .sort((a, b) => a.apiSlug.localeCompare(b.apiSlug)),
    [transApis]
  );

  const builtinApis = useMemo(
    () => transApis.filter((api) => API_SPE_TYPES.builtin.has(api.apiSlug)),
    [transApis]
  );

  const enabledApis = useMemo(
    () => transApis.filter((api) => !api.isDisabled),
    [transApis]
  );

  const aiEnabledApis = useMemo(
    () => enabledApis.filter((api) => API_SPE_TYPES.ai.has(api.apiType)),
    [enabledApis]
  );

  const addApi = useCallback(
    (apiType) => {
      const defaultApiOpt =
        DEFAULT_API_LIST.find((da) => da.apiType === apiType) || {};
      const uuid = crypto.randomUUID();
      const apiSlug = `${apiType}_${crypto.randomUUID()}`;
      const apiName = `${apiType}_${uuid.slice(0, 8)}`;
      const newApi = {
        ...defaultApiOpt,
        apiSlug,
        apiName,
        apiType,
      };
      updateSetting((prev) => ({
        ...prev,
        transApis: [...(prev?.transApis || []), newApi],
      }));
    },
    [updateSetting]
  );

  const deleteApi = useCallback(
    (apiSlug) => {
      updateSetting((prev) => ({
        ...prev,
        transApis: (prev?.transApis || []).filter(
          (api) => api.apiSlug !== apiSlug
        ),
      }));
    },
    [updateSetting]
  );

  return {
    transApis,
    userApis,
    builtinApis,
    enabledApis,
    aiEnabledApis,
    addApi,
    deleteApi,
  };
}

export function useApiItem(apiSlug) {
  const { transApis, updateSetting } = useApiState();

  const api = useMemo(
    () => transApis.find((a) => a.apiSlug === apiSlug),
    [transApis, apiSlug]
  );

  const update = useCallback(
    (updateData) => {
      updateSetting((prev) => ({
        ...prev,
        transApis: (prev?.transApis || []).map((item) =>
          item.apiSlug === apiSlug ? { ...item, ...updateData, apiSlug } : item
        ),
      }));
    },
    [apiSlug, updateSetting]
  );

  const reset = useCallback(() => {
    updateSetting((prev) => ({
      ...prev,
      transApis: (prev?.transApis || []).map((item) => {
        if (item.apiSlug === apiSlug) {
          const defaultApiOpt =
            DEFAULT_API_LIST.find((da) => da.apiType === item.apiType) || {};
          return {
            ...defaultApiOpt,
            apiSlug: item.apiSlug,
            apiName: item.apiName,
            apiType: item.apiType,
            key: item.key,
          };
        }
        return item;
      }),
    }));
  }, [apiSlug, updateSetting]);

  return { api, update, reset };
}
