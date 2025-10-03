import { useSetting } from "./Setting";
import { I18N, URL_RAW_PREFIX } from "../config";
import { useGet } from "./Fetch";

export const getI18n = (uiLang, key, defaultText = "") => {
  return I18N?.[key]?.[uiLang] ?? defaultText;
};

export const useLangMap = (uiLang) => {
  return (key, defaultText = "") => getI18n(uiLang, key, defaultText);
};

/**
 * 多语言 hook
 * @returns
 */
export const useI18n = () => {
  const {
    setting: { uiLang },
  } = useSetting();
  return useLangMap(uiLang);
};

export const useI18nMd = (key) => {
  const i18n = useI18n();
  const fileName = i18n(key);
  const url = fileName ? `${URL_RAW_PREFIX}/${fileName}` : "";
  return useGet(url);
};
