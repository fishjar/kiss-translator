const IMPORTANT = "important";

export function isolateShadowHost(host) {
  if (!host) return host;

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
