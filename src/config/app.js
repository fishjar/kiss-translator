export const APP_NAME = process.env.REACT_APP_NAME.trim()
  .split(/\s+/)
  .join("-");
export const APP_LCNAME = APP_NAME.toLowerCase();

export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";
