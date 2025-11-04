import { useCallback, useMemo } from "react";
import { useSetting } from "./Setting";
import { DEFAULT_CUSTOM_STYLES, OPT_STYLE_ALL } from "../config/styles";
import { builtinStylesMap } from "../libs/style";
import { useI18n } from "./I18n";

function useStyleState() {
  const { setting, updateSetting } = useSetting();
  const customStyles = setting?.customStyles || [];

  return { customStyles, updateSetting };
}

export function useStyleList() {
  const { customStyles, updateSetting } = useStyleState();

  const addStyle = useCallback(() => {
    const defaultStyle = DEFAULT_CUSTOM_STYLES[0];
    const uuid = crypto.randomUUID();
    const styleSlug = `custom_${crypto.randomUUID()}`;
    const styleName = `Style_${uuid.slice(0, 8)}`;
    const newStyle = {
      ...defaultStyle,
      styleSlug,
      styleName,
    };
    updateSetting((prev) => ({
      ...prev,
      customStyles: [...(prev?.customStyles || []), newStyle],
    }));
  }, [updateSetting]);

  const deleteStyle = useCallback(
    (styleSlug) => {
      updateSetting((prev) => ({
        ...prev,
        customStyles: (prev?.customStyles || []).filter(
          (item) => item.styleSlug !== styleSlug
        ),
      }));
    },
    [updateSetting]
  );

  const updateStyle = useCallback(
    (styleSlug, updateData) => {
      updateSetting((prev) => ({
        ...prev,
        customStyles: (prev?.customStyles || []).map((item) =>
          item.styleSlug === styleSlug ? { ...item, ...updateData } : item
        ),
      }));
    },
    [updateSetting]
  );

  return {
    customStyles,
    addStyle,
    deleteStyle,
    updateStyle,
  };
}

export function useAllTextStyles() {
  const { customStyles } = useStyleList();
  const i18n = useI18n();

  const builtinStyles = useMemo(
    () =>
      OPT_STYLE_ALL.map((styleSlug) => ({
        styleSlug,
        styleName: i18n(styleSlug),
        styleCode: builtinStylesMap[styleSlug] || "",
      })),
    [i18n]
  );

  const allTextStyles = useMemo(() => {
    return [...builtinStyles, ...customStyles];
  }, [builtinStyles, customStyles]);

  return { builtinStyles, customStyles, allTextStyles };
}
