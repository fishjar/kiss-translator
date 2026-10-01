import fileTranslationSites from "../config/fileTranslationSites.json";

export const FILE_CHANNEL = "kiss-file-translation-v1";
export const FILE_PROTOCOL = 1;
export const IMAGE_CHUNK_BYTES = 256 * 1024;
export const FILE_WEB_URL =
  process.env.REACT_APP_FILE_TRANSLATE_URL || fileTranslationSites[0];
export const FILE_WEB_PAGES = process.env.REACT_APP_FILE_TRANSLATE_URL
  ? [FILE_WEB_URL]
  : fileTranslationSites;

export function isFileBridgePage(url) {
  try {
    const page = new URL(url);
    if (
      FILE_WEB_PAGES.some((url) => {
        const production = new URL(url);
        return (
          page.origin === production.origin &&
          page.pathname === production.pathname
        );
      })
    )
      return true;
    return (
      ["http://localhost:3000", "http://127.0.0.1:3000"].includes(
        page.origin
      ) &&
      page.pathname === "/file-translate.html"
    );
  } catch {
    return false;
  }
}

export function fileError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function serializeFileError(error) {
  return {
    code:
      error?.code ||
      (error?.name === "AbortError" ? "CANCELLED" : "SERVICE_ERROR"),
    message: error?.message || "文件翻译服务失败",
  };
}
