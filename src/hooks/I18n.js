import { useSetting } from "./Setting";
import { I18N, URL_RAW_PREFIX } from "../config";
import { useEffect, useState } from "react";

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
  const [md, setMd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fileName = i18n(key);

  useEffect(() => {
    if (!fileName) {
      return;
    }

    const url = `${URL_RAW_PREFIX}/${fileName}`;
    setLoading(true);
    fetch(url)
      .then((res) => {
        if (res.ok) {
          return res.text().then(setMd);
        }
        setError(`[${res.status}] ${res.statusText}`);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [fileName]);

  return [md, loading, error];
};
