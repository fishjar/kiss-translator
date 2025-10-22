export const APP_NAME = process.env.REACT_APP_NAME.trim()
  .split(/\s+/)
  .join("-");
export const APP_LCNAME = APP_NAME.toLowerCase();
export const APP_UPNAME = APP_NAME.toUpperCase();
export const APP_CONSTS = {
  fabID: `${APP_LCNAME}-fab`,
  boxID: `${APP_LCNAME}-box`,
  popupID: `${APP_LCNAME}-popup`,
};

export const APP_VERSION = process.env.REACT_APP_VERSION.split(".");

export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";
