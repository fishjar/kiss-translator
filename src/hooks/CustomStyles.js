import { useCallback, useMemo } from "react";
import { useSetting } from "./Setting";
import { DEFAULT_CUSTOM_STYLES, OPT_STYLE_ALL } from "../config/styles";
import { builtinStylesMap } from "../libs/style";
import { useI18n } from "./I18n";

export const STYLE_SOURCE_BUILTIN = "builtin";
export const STYLE_SOURCE_CUSTOM = "custom";

export function toPersistedCustomStyle(style = {}) {
  return {
    styleSlug: style.styleSlug,
    styleName: style.styleName,
    styleCode: style.styleCode,
  };
}

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

  // 添加新的自定义 CSS 样式项：接受初始 styleCode（空白样式传 ""、模板
  // 传所选内置 compact 代码），新卡片 unshift 置顶（新卡在最上）；返回
  // { styleSlug, promise }——slug 供互斥单开的自动展开定位（同步计算，
  // 不依赖 updateSetting 回调时序），promise 透传存储写结果供调用方在
  // 落库确认后再收口创建流程（失败保留创建入口重试）。styleName 保持
  // Style_xxxxxxxx 自动生成逻辑不动。DEFAULT_CUSTOM_STYLES 仅作结构形状
  // 来源，不再预填其默认代码（预填职责移交模板选择模态）。
  const addStyle = useCallback(
    (initialCode = "") => {
      const defaultStyle = DEFAULT_CUSTOM_STYLES[0];
      const uuid = crypto.randomUUID();
      const styleSlug = `custom_${crypto.randomUUID()}`;
      const styleName = `Style_${uuid.slice(0, 8)}`;
      const newStyle = {
        ...defaultStyle,
        styleSlug,
        styleName,
        styleCode: initialCode,
      };
      const promise = updateSetting((prev) => ({
        ...prev,
        customStyles: [newStyle, ...(prev?.customStyles || [])],
      }));
      return { styleSlug, promise };
    },
    [updateSetting]
  );

  // 删除特定的自定义 CSS 样式项：透传 updateSetting 的 Promise，调用方
  // 据写结果收口本地草稿清理（失败回滚后卡片复现、草稿保留）
  const deleteStyle = useCallback(
    (styleSlug) => {
      return updateSetting((prev) => ({
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
      // 透传 updateSetting 的 Promise：调用方可感知存储写失败（如释放
      // 保存提交标记）；既有忽略返回值的调用方零行为变化
      return updateSetting((prev) => ({
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
        source: STYLE_SOURCE_BUILTIN,
        isBuiltin: true,
      })),
    [i18n]
  );

  const normalizedCustomStyles = useMemo(
    () =>
      customStyles.map((style) => ({
        ...style,
        source: STYLE_SOURCE_CUSTOM,
        isBuiltin: false,
      })),
    [customStyles]
  );

  // 拼接系统内置和用户自定义样式，生成用于界面展示的所有文本样式集合
  const allTextStyles = useMemo(() => {
    return [...builtinStyles, ...normalizedCustomStyles];
  }, [builtinStyles, normalizedCustomStyles]);

  return {
    builtinStyles,
    customStyles: normalizedCustomStyles,
    allTextStyles,
  };
}
