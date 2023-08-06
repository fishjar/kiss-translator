import { useSetting } from "./Setting";
import { I18N, URL_RAW_PREFIX } from "../config";
import { useFetch } from "./Fetch";

/**
 * 多语言 hook
 * @returns
 */
export const useI18n = () => {
  const { uiLang } = useSetting() ?? {};
  return (key, defaultText = "") => I18N?.[key]?.[uiLang] ?? defaultText;
};

export const useI18nMd = (key) => {
  const i18n = useI18n();
  const fileName = i18n(key);
  const url = `${URL_RAW_PREFIX}/${fileName}`;
  return useFetch(url);
};
