const IMPORTANT = "important";
export const SHADOW_HOST_ATTRIBUTE = "data-kiss-translator-shadow-host";

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

export function removeStaleShadowHosts(
  { boxID, fabID, popupID },
  root = document
) {
  const matchesKnownID = (id) => {
    if (id === boxID || id === fabID || id === popupID) return true;
    if (!id.startsWith(`${popupID}-`)) return false;
    return /^\d+$/.test(id.slice(popupID.length + 1));
  };

  let removedCount = 0;
  root.querySelectorAll("[id]").forEach((host) => {
    if (host.localName !== "div" || !matchesKnownID(host.id)) return;

    const isMarkedHost = host.hasAttribute(SHADOW_HOST_ATTRIBUTE);
    const legacyWrapperClass = `${host.id}_wrapper`;
    const isLegacyHost =
      host.classList.contains("notranslate") &&
      [...(host.shadowRoot?.children || [])].some(
        (child) =>
          child.localName === "div" &&
          child.classList.contains(legacyWrapperClass) &&
          child.classList.contains("notranslate")
      );
    if (!isMarkedHost && !isLegacyHost) return;

    host.remove();
    removedCount += 1;
  });
  return removedCount;
}
