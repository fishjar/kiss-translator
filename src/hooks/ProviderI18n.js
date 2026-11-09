import { useCallback } from "react";
import { useI18n } from "./I18n";
import { useSetting } from "./Setting";
import { localizeProviderText } from "../providers/localization";

export function useProviderI18n() {
  const i18n = useI18n();
  const {
    setting: { uiLang },
  } = useSetting();
  return useCallback(
    (text, translations) =>
      localizeProviderText(i18n, text, translations, uiLang),
    [i18n, uiLang]
  );
}
