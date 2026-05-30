import { useCallback, useMemo } from "react";
import { useSetting } from "./Setting";
import { DEFAULT_CUSTOM_STYLES, OPT_STYLE_ALL } from "../config/styles";
import { builtinStylesMap } from "../libs/style";
import { useI18n } from "./I18n";

// 内部状态 Hook，解构并提供用户自定义样式列表和更新方法
function useStyleState() {
  const { setting, updateSetting } = useSetting();
  const customStyles = setting?.customStyles || [];

  return { customStyles, updateSetting };
}

/**
 * 用户自定义样式列表管理的自定义 Hook
 */
export function useStyleList() {
  const { customStyles, updateSetting } = useStyleState();

  // 添加新的自定义 CSS 样式项，预设为样式模版中的第一个样式并生成新的 UUID 作为标识
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

  // 删除特定的自定义 CSS 样式项
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

  // 更新特定自定义样式的属性数据（例如 styleName 或 styleCode 等）
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

/**
 * 获取系统内置及用户自定义所有文本样式的自定义 Hook
 */
export function useAllTextStyles() {
  const { customStyles } = useStyleList();
  const i18n = useI18n();

  // 获取本地化的系统内置文本样式列表
  const builtinStyles = useMemo(
    () =>
      OPT_STYLE_ALL.map((styleSlug) => ({
        styleSlug,
        styleName: i18n(styleSlug),
        styleCode: builtinStylesMap[styleSlug] || "",
      })),
    [i18n]
  );

  // 拼接系统内置和用户自定义样式，生成用于界面展示的所有文本样式集合
  const allTextStyles = useMemo(() => {
    return [...builtinStyles, ...customStyles];
  }, [builtinStyles, customStyles]);

  return { builtinStyles, customStyles, allTextStyles };
}
