import {
  CLIENT_EXTS,
  CLIENT_USERSCRIPT,
  CLIENT_WEB,
  CLIENT_FIREFOX,
} from "../config";

export const client = process.env.REACT_APP_CLIENT;
export const isExt = CLIENT_EXTS.includes(client);
export const isGm = client === CLIENT_USERSCRIPT;
export const isWeb = client === CLIENT_WEB;
export const isFirefox = client === CLIENT_FIREFOX;
