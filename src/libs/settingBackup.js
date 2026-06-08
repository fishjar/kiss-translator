import { DEFAULT_API_LIST } from "../config/api";

const API_PROMPT_FIELDS = [
  "systemPrompt",
  "subtitlePrompt",
  "nobatchPrompt",
  "nobatchUserPrompt",
];

const DEFAULT_API_BY_TYPE = new Map(
  DEFAULT_API_LIST.map((api) => [api.apiType, api])
);

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const getDefaultApi = (api) =>
  isPlainObject(api) ? DEFAULT_API_BY_TYPE.get(api.apiType) : null;

/**
 * 导出或同步设置前，删除与内置默认值完全一致的 Prompt 字段。
 * 缺失字段即表示继续使用对应 apiType 的内置默认 Prompt。
 *
 * @param {Object} setting 完整运行时设置对象
 * @returns {Object} 适合备份/同步的精简设置对象
 */
export function packSettingForBackup(setting) {
  if (!isPlainObject(setting) || !Array.isArray(setting.transApis)) {
    return setting;
  }

  return {
    ...setting,
    transApis: setting.transApis.map((api) => {
      if (!isPlainObject(api)) return api;

      const defaultApi = getDefaultApi(api);
      const packedApi = { ...api };
      if (!defaultApi) return packedApi;

      API_PROMPT_FIELDS.forEach((field) => {
        if (packedApi[field] === defaultApi[field]) {
          delete packedApi[field];
        }
      });

      return packedApi;
    }),
  };
}

/**
 * 导入或读取同步设置后，把精简备份中缺失的默认 Prompt 字段补回。
 * 已存在的字段保持原值，用于保留用户自定义 Prompt。
 *
 * @param {Object} setting 从备份/同步读取到的设置对象
 * @returns {Object} 可直接写入本地存储和运行时使用的完整设置对象
 */
export function unpackSettingFromBackup(setting) {
  if (!isPlainObject(setting) || !Array.isArray(setting.transApis)) {
    return setting;
  }

  return {
    ...setting,
    transApis: setting.transApis.map((api) => {
      if (!isPlainObject(api)) return api;

      const defaultApi = getDefaultApi(api);
      const unpackedApi = { ...api };
      if (!defaultApi) return unpackedApi;

      API_PROMPT_FIELDS.forEach((field) => {
        if (!(field in unpackedApi)) {
          unpackedApi[field] = defaultApi[field];
        }
      });

      return unpackedApi;
    }),
  };
}
