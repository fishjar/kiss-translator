import { useState } from "react";
import { ICON_COLOR_STORAGE_KEY } from "./content";
import { resolveIconColorHex } from "../styles/m3";

// homepage 是 Web 页面（REACT_APP_WEB_APP=homepage），无 browser.storage
// 访问权；iconColor 走 window.localStorage 与 useHomepageSettings 同规。
// resolveIconColorHex 归一任意合法 6 位 Hex、非法回落默认（m3.js 契约）。
const readIconColor = () => {
  try {
    const stored = window.localStorage.getItem(ICON_COLOR_STORAGE_KEY);
    return resolveIconColorHex(stored);
  } catch {
    // localStorage 不可用（隐私模式 / 配额耗尽）→ 回落默认档。
    return resolveIconColorHex(undefined);
  }
};

// 同步读取，无异步等待；形似 { iconColor, isLoading: false } 保持
// 原 useStorage 调用签名同形，最小化 State.js 侧改动。
export const useHomepageIconColor = () => {
  const [iconColor] = useState(readIconColor);
  return { iconColor, isLoading: false };
};
