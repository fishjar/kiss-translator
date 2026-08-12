import { browser } from "./browser";

export const CLIPBOARD_READ_PERMISSION = "clipboardRead";
const CLIPBOARD_READ_PERMISSIONS = {
  permissions: [CLIPBOARD_READ_PERMISSION],
};

export async function hasClipboardReadPermission() {
  try {
    return Boolean(
      await browser?.permissions?.contains?.(CLIPBOARD_READ_PERMISSIONS)
    );
  } catch {
    return false;
  }
}

export async function requestClipboardReadPermission() {
  try {
    return Boolean(
      await browser?.permissions?.request?.(CLIPBOARD_READ_PERMISSIONS)
    );
  } catch {
    return false;
  }
}

export async function readClipboardTextIfAllowed() {
  if (!(await hasClipboardReadPermission())) return null;

  try {
    if (!navigator.clipboard?.readText) return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
