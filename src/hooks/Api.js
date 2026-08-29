import { useCallback, useMemo } from "react";
import {
  DEFAULT_API_LIST,
  API_SPE_TYPES,
  normalizeApiModelListUrls,
  normalizeApiThinkingSettings,
} from "../config";
import { useSetting } from "./Setting";

// 内部辅助 Hook，获取翻译 API 的排序状态和更新配置的方法
function useApiState() {
  const { setting, updateSetting } = useSetting();
  // 统一排序，所有使用transApis的地方都是按照 sortOrder 从小到大排序好的
  const transApis = useMemo(
    () =>
      [
        ...normalizeApiThinkingSettings(
          normalizeApiModelListUrls(setting?.transApis || [])
        ),
      ].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [setting?.transApis]
  );

  return { transApis, updateSetting };
}

// 统一收拢 API 列表顺序，避免批量修改后留下重复或交叉的 sortOrder。
function normalizeApiOrder(apis = []) {
  const pinnedApis = apis
    .filter((api) => api.sortOrder === -1 && !api.isDisabled)
    .map((api) => ({ ...api, sortOrder: -1 }));
  const normalApis = apis
    .filter((api) => api.sortOrder !== -1 && !api.isDisabled)
    .map((api, index) => ({ ...api, sortOrder: index }));
  const disabledApis = apis
    .filter((api) => api.isDisabled)
    .map((api, index) => ({ ...api, sortOrder: 999 + index }));

  return [...pinnedApis, ...normalApis, ...disabledApis];
}

function getDisplayOrderedApis(apis = []) {
  return [...apis].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/**
 * 翻译 API 列表管理的自定义 Hook，支持列表筛选、新增、复制、删除和字母排序
 */
export function useApiList() {
  const { transApis, updateSetting } = useApiState();

  // 获取用户添加的自定义 API 列表，按照拼音/字母表排序
  // 过滤掉内置 API (如 google, bing, deeplBuiltin 等)
  const userApis = useMemo(
    () => transApis.filter((api) => !API_SPE_TYPES.builtin.has(api.apiSlug)),
    [transApis]
  );

  // 获取内置 API 列表
  const builtinApis = useMemo(
    () => transApis.filter((api) => API_SPE_TYPES.builtin.has(api.apiSlug)),
    [transApis]
  );

  // 获取所有启用的 API 列表
  const enabledApis = useMemo(
    () => transApis.filter((api) => !api.isDisabled),
    [transApis]
  );

  // 获取所有启用的 AI 类型的 API 列表
  const aiEnabledApis = useMemo(
    () => enabledApis.filter((api) => API_SPE_TYPES.ai.has(api.apiType)),
    [enabledApis]
  );

  // 添加一个新的自定义 API
  const addApi = useCallback(
    (apiType) => {
      // 找到内置的该 API 类型的默认配置模版
      const defaultApiOpt =
        DEFAULT_API_LIST.find((da) => da.apiType === apiType) || {};
      const uuid = crypto.randomUUID();
      // 使用类型名拼合 UUID 保证 apiSlug 唯一，代表具体 API 实例
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

  // 复制一份现有的 API 配置，并赋予新的 UUID 作为 Slug
  const copyApi = useCallback(
    (sourceApi) => {
      const uuid = crypto.randomUUID();
      const apiSlug = `${sourceApi.apiType}_${uuid}`;
      const apiName = `${sourceApi.apiName} - copy`;
      const newApi = {
        ...sourceApi,
        apiSlug,
        apiName,
      };
      updateSetting((prev) => ({
        ...prev,
        transApis: [...(prev?.transApis || []), newApi],
      }));
    },
    [updateSetting]
  );

  // 批量删除翻译 API。
  const deleteApis = useCallback(
    (apiSlugs) => {
      if (!Array.isArray(apiSlugs) || apiSlugs.length === 0) {
        return;
      }

      updateSetting((prev) => {
        const apiSlugSet = new Set(apiSlugs);

        return {
          ...prev,
          transApis: (prev?.transApis || []).filter(
            (api) => !apiSlugSet.has(api.apiSlug)
          ),
        };
      });
    },
    [updateSetting]
  );

  // 删除一个翻译 API 配置项
  const deleteApi = useCallback(
    (apiSlug) => {
      deleteApis([apiSlug]);
    },
    [deleteApis]
  );

  // 批量置顶已启用的 API；禁用项保持禁用状态，不隐式启用。
  const pinApis = useCallback(
    (apiSlugs) => {
      if (!Array.isArray(apiSlugs) || apiSlugs.length === 0) {
        return;
      }

      updateSetting((prev) => {
        const apiSlugSet = new Set(apiSlugs);
        const nextApis = getDisplayOrderedApis(prev?.transApis || []).map(
          (api) =>
            apiSlugSet.has(api.apiSlug) && !api.isDisabled
              ? { ...api, sortOrder: -1 }
              : api
        );

        return {
          ...prev,
          transApis: normalizeApiOrder(nextApis),
        };
      });
    },
    [updateSetting]
  );

  // 批量禁用 API，并统一放到列表底部。
  const disableApis = useCallback(
    (apiSlugs) => {
      if (!Array.isArray(apiSlugs) || apiSlugs.length === 0) {
        return;
      }

      updateSetting((prev) => {
        const apiSlugSet = new Set(apiSlugs);
        const nextApis = getDisplayOrderedApis(prev?.transApis || []).map(
          (api) =>
            apiSlugSet.has(api.apiSlug)
              ? { ...api, isDisabled: true, sortOrder: 999 }
              : api
        );

        return {
          ...prev,
          transApis: normalizeApiOrder(nextApis),
        };
      });
    },
    [updateSetting]
  );

  // 批量启用 API；已启用项保持原状态，刚启用的项回到常规排序区。
  const enableApis = useCallback(
    (apiSlugs) => {
      if (!Array.isArray(apiSlugs) || apiSlugs.length === 0) {
        return;
      }

      updateSetting((prev) => {
        const apiSlugSet = new Set(apiSlugs);
        const nextApis = getDisplayOrderedApis(prev?.transApis || []).map(
          (api) => {
            if (!apiSlugSet.has(api.apiSlug) || !api.isDisabled) {
              return api;
            }

            return { ...api, isDisabled: false, sortOrder: 0 };
          }
        );

        return {
          ...prev,
          transApis: normalizeApiOrder(nextApis),
        };
      });
    },
    [updateSetting]
  );

  // 对非置顶且未禁用的 API 按名称字母顺序进行排序
  const alphaSortApis = useCallback(
    (direction = "asc") => {
      updateSetting((prev) => {
        const apis = prev?.transApis || [];
        // 置顶的 API 保持原样 (sortOrder 为 -1)
        const pinnedApis = apis.filter(
          (a) => a.sortOrder === -1 && !a.isDisabled
        );
        // 已禁用的 API 提取出来（不参与首字母排序，依然放倒数）
        const disabledApis = apis.filter((a) => a.isDisabled);
        // 常规正常启用的 API 参与排序
        const normalApis = apis.filter(
          (a) => a.sortOrder !== -1 && !a.isDisabled
        );

        // 字母排序
        const sorted = [...normalApis].sort((a, b) => {
          const nameA = (a.apiName || "").toLowerCase();
          const nameB = (b.apiName || "").toLowerCase();
          return direction === "asc"
            ? nameA.localeCompare(nameB)
            : nameB.localeCompare(nameA);
        });

        // 重新拼合数组，顺序为：置顶的 API -> 重新排序后的常规 API -> 已禁用的 API
        return {
          ...prev,
          transApis: normalizeApiOrder([
            ...pinnedApis,
            ...sorted,
            ...disabledApis,
          ]),
        };
      });
    },
    [updateSetting]
  );

  const reorderApis = useCallback(
    (activeSlug, overSlug) => {
      if (!activeSlug || !overSlug || activeSlug === overSlug) return;

      updateSetting((prev) => {
        const apis = [...(prev?.transApis || [])].sort(
          (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
        );
        const fromIndex = apis.findIndex((api) => api.apiSlug === activeSlug);
        const toIndex = apis.findIndex((api) => api.apiSlug === overSlug);

        if (fromIndex < 0 || toIndex < 0) {
          return prev;
        }

        const nextApis = [...apis];
        const [movedApi] = nextApis.splice(fromIndex, 1);
        nextApis.splice(toIndex, 0, movedApi);

        return {
          ...prev,
          transApis: normalizeApiOrder(nextApis),
        };
      });
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
    copyApi,
    deleteApi,
    deleteApis,
    pinApis,
    disableApis,
    enableApis,
    alphaSortApis,
    reorderApis,
  };
}

/**
 * 针对单个具体 API 配置项管理的自定义 Hook
 * @param {string} apiSlug 目标 API 的唯一标识符
 */
export function useApiItem(apiSlug) {
  const { transApis, updateSetting } = useApiState();

  // 获取当前的 API 详情
  const api = useMemo(
    () => transApis.find((a) => a.apiSlug === apiSlug),
    [transApis, apiSlug]
  );

  // 更新当前 API 项的某些属性数据，并防止 Slug 被意外更改
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

  // 将当前 API 配置项重置回默认预设值，但保留 apiSlug, apiName, apiType 和已配置的密钥(key)
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
