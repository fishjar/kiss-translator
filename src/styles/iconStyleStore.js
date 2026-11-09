export const DEFAULT_ICON_STYLE = "lucide";

export function resolveIconStyle(value) {
  return value === "mui" ? "mui" : DEFAULT_ICON_STYLE;
}

let iconStyleSnapshot = DEFAULT_ICON_STYLE;
const iconStyleListeners = new Set();

export function setIconStyleSnapshot(value) {
  const next = resolveIconStyle(value);
  if (next === iconStyleSnapshot) return;
  iconStyleSnapshot = next;
  iconStyleListeners.forEach((listener) => listener(next));
}

export function subscribeIconStyle(listener) {
  iconStyleListeners.add(listener);
  return () => iconStyleListeners.delete(listener);
}

export function getIconStyleSnapshot() {
  return iconStyleSnapshot;
}
