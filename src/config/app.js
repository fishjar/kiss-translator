/**
 * @file app.js
 * @description 定义应用的基本信息与全局 UI 常量，例如 DOM 注入元素的 ID、版本解析以及主题名称。
 */

// 统一格式化应用名称，将空格替换为 "-"
export const APP_NAME = process.env.REACT_APP_NAME.trim()
  .split(/\s+/)
  .join("-");
export const APP_LCNAME = APP_NAME.toLowerCase(); // 应用名称小写，用于 ID 命名前缀等
export const APP_UPNAME = APP_NAME.toUpperCase(); // 应用名称大写

// 注入到网页 DOM 中的特定元素 ID，通过小写应用名防冲突
export const APP_CONSTS = {
  fabID: `${APP_LCNAME}-fab`, // 悬浮翻译球元素的 ID
  boxID: `${APP_LCNAME}-box`, // 划词/查词翻译面板元素的 ID
  popupID: `${APP_LCNAME}-popup`, // 弹出页/提示框的 ID
};

// 当前应用的版本，按点号拆分成数组 (例如: "1.0.2" -> ["1", "0", "2"])
export const APP_VERSION = process.env.REACT_APP_VERSION.split(".");

// 主题模式常量
export const THEME_LIGHT = "light"; // 浅色模式
export const THEME_DARK = "dark"; // 深色模式
