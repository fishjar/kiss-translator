import { APP_LCNAME } from "../config/app";

const IMPORTANT = "important";
export const SHADOW_HOST_ATTRIBUTE = `data-${APP_LCNAME}-shadow-host`;

export function isolateShadowHost(host) {
  if (!host) return host;

  host.setAttribute(SHADOW_HOST_ATTRIBUTE, "");
  host.style.setProperty("all", "initial", IMPORTANT);
  host.style.setProperty("display", "block", IMPORTANT);
  host.style.setProperty("direction", "ltr", IMPORTANT);
  host.style.setProperty("unicode-bidi", "normal", IMPORTANT);
  return host;
}

export function setShadowHostVisible(host, visible) {
  if (!host) return;
  host.style.setProperty("display", visible ? "block" : "none", IMPORTANT);
}
