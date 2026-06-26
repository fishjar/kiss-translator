import { useCallback, useEffect, useMemo } from "react";
import {
  DEFAULT_API_LIST,
  API_SPE_TYPES,
  normalizeApiModelListUrls,
} from "../config";
import { useSetting } from "./Setting";

// 内部辅助 Hook，获取翻译 API 的排序状态和更新配置的方法
function useApiState() {
  const { setting, updateSetting } = useSetting();
  // 统一排序，所有使用transApis的地方都是按照 sortOrder 从小到大排序好的
  const transApis = useMemo(
    () =>
      [...normalizeApiModelListUrls(setting?.transApis || [])].sort(
        (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
      ),
    [setting?.transApis]
  );

  return { setting, transApis, updateSetting };
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
 * 翻译 API 列表管理的自定义 Hook，支持列表的补全、筛选、新增、复制、删除和字母排序
 */
export function useApiList() {
  const { setting, transApis, updateSetting } = useApiState();

  // 当发现持久化的翻译 API 列表里缺失某些内置 API 时（例如由于新版本升级增加了新翻译源），自动将它们合并补全。
  // REVIEW: React 状态无限递归（Infinite Loop）风险。
  // 在 useEffect 中，当 transApis 改变时会触发该 Effect。
  // 如果 Effect 内部的 `updateSetting` 调用修改了底层 Setting 并在 transApis 里产生了某些无法被 Set(apiSlug) 正确识别的 api（例如 Slug 重复或为空），
  // 导致下一次循环中 `missApis.length > 0` 依然成立，这将会导致该 React 组件陷入无限重渲染和更新设置的死循环。
  // 推荐将该内置 API 自动对齐的校验与合并工作放在应用层初始化（如 Background 启动）时一次性完成，而不是放在 React 交互 Hook 的副作用中高频执行。
  useEffect(() => {
    const deletedSlugs = new Set(setting?.deletedTransApiSlugs || []);
    const curSlugs = new Set(transApis.map((api) => api.apiSlug));
    const missApis = DEFAULT_API_LIST.filter(
      (api) => !curSlugs.has(api.apiSlug) && !deletedSlugs.has(api.apiSlug)
    );
    if (missApis.length > 0) {
      updateSetting((prev) => ({
        ...prev,
        transApis: [...(prev?.transApis || []), ...missApis],
      }));
    }
  }, [setting?.deletedTransApiSlugs, transApis, updateSetting]);

  useEffect(() => {
    if (!Array.isArray(setting?.transApis)) {
      return;
    }

    const normalizedTransApis = normalizeApiModelListUrls(setting.transApis);
    if (normalizedTransApis === setting.transApis) {
      return;
    }

    updateSetting((prev) => {
      const prevTransApis = Array.isArray(prev?.transApis)
        ? prev.transApis
        : [];
      const nextTransApis = normalizeApiModelListUrls(prevTransApis);
      if (nextTransApis === prevTransApis) {
        return prev;
      }
      return {
        ...prev,
        transApis: nextTransApis,
      };
    });
  }, [setting?.transApis, updateSetting]);

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

  // 批量删除翻译 API；内置 API 需要记录删除标识，避免自动补全逻辑再次恢复。
  const deleteApis = useCallback(
    (apiSlugs) => {
      if (!Array.isArray(apiSlugs) || apiSlugs.length === 0) {
        return;
      }

      updateSetting((prev) => {
        const apiSlugSet = new Set(apiSlugs);
        const defaultApiSlugs = DEFAULT_API_LIST.filter((api) =>
          apiSlugSet.has(api.apiSlug)
        ).map((api) => api.apiSlug);
        const deletedTransApiSlugs =
          defaultApiSlugs.length > 0
            ? Array.from(
                new Set([
                  ...(prev?.deletedTransApiSlugs || []),
                  ...defaultApiSlugs,
                ])
              )
            : prev?.deletedTransApiSlugs || [];

        return {
          ...prev,
          deletedTransApiSlugs,
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
