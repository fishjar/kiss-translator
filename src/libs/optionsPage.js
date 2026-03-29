import { normalizeCEFRSetting } from "../config";
import { browser } from "./browser";

export const CEFR_OPTIONS_HASH = "#/cefr";

function normalizeHash(hash) {
  if (!hash) return "";
  return hash.startsWith("#") ? hash : `#${hash}`;
}

export function buildOptionsHashUrl(hash = CEFR_OPTIONS_HASH) {
  const baseUrl = browser?.runtime?.getURL
    ? browser.runtime.getURL("options.html")
    : "options.html";
  return `${baseUrl}${normalizeHash(hash)}`;
}

export function shouldOpenCEFROnInstall(details, setting) {
  if (details?.reason !== "install") return false;
  const cefrSetting = normalizeCEFRSetting(setting?.cefrSetting);
  return !cefrSetting.assessmentCompleted;
}

export async function openOptionsHash(hash = CEFR_OPTIONS_HASH) {
  const url = buildOptionsHashUrl(hash);

  if (browser?.tabs?.create) {
    return browser.tabs.create({ url });
  }

  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(url, "_blank");
    return undefined;
  }

  if (browser?.runtime?.openOptionsPage) {
    return browser.runtime.openOptionsPage();
  }

  return undefined;
}

export const openOptionsHashUrl = openOptionsHash;
