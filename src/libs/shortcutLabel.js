export function formatShortcutKey(key) {
  const aliases = {
    ControlLeft: "Ctrl",
    ControlRight: "Ctrl",
    AltLeft: "Alt",
    AltRight: "Alt",
    ShiftLeft: "Shift",
    ShiftRight: "Shift",
    MetaLeft: "Meta",
    MetaRight: "Meta",
    " ": "Space",
  };

  if (aliases[key]) return aliases[key];
  if (/^Key[A-Z]$/.test(key)) return key.slice(3);
  if (/^Digit[0-9]$/.test(key)) return key.slice(5);
  return key;
}

export function normalizeShortcutKeys(shortcut) {
  if (Array.isArray(shortcut)) return shortcut.map(formatShortcutKey);
  if (typeof shortcut !== "string" || !shortcut.trim()) return [];
  return shortcut
    .split("+")
    .map((key) => key.trim())
    .filter(Boolean)
    .map(formatShortcutKey);
}
