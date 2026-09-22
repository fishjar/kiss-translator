export function formatShortcutKey(key) {
  const aliases = {
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    MetaLeft: "Left Meta",
    MetaRight: "Right Meta",
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
