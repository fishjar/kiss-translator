import { browser } from "./browser";

/**
 * @file pdfReaderLink.js
 * @description 在线 PDF 的接管规则。Chrome 原生查看器的文字在独立插件进程中，
 * 页面脚本读不到选区，所以需要改由插件内置的 PDF.js 阅读器打开。
 */

export const PDF_READER_PAGE = "pdf-reader.html";
// 从阅读器回到原生查看器时带上的标记，避免被再次接管。
export const NATIVE_PDF_MARK = "kiss-native";

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isHttpUrl = (url) =>
  url.protocol === "http:" || url.protocol === "https:";

/** 阅读器页面只随 Chrome 构建产出，Edge 直接复用该构建。 */
export const shouldOpenPdfReader = (href) => {
  if (process.env.REACT_APP_CLIENT !== "chrome") return false;
  const url = parseUrl(href);
  return Boolean(url && isHttpUrl(url) && url.hash !== `#${NATIVE_PDF_MARK}`);
};

export const buildPdfReaderUrl = (readerPageUrl, href) => {
  const source = new URL(href);
  const reader = new URL(readerPageUrl);
  reader.hash = source.hash;
  source.hash = "";
  reader.searchParams.set("file", source.href);
  return reader.href;
};

export const parsePdfReaderFile = (search) => {
  const url = parseUrl(new URLSearchParams(search).get("file"));
  return url && isHttpUrl(url) ? url.href : null;
};

export const buildNativePdfUrl = (file) => {
  const url = new URL(file);
  url.hash = NATIVE_PDF_MARK;
  return url.href;
};

/** 用 replace 打开阅读器，返回键不会再落到会被接管的原生 PDF 页。 */
export const openPdfReader = (href) => {
  window.location.replace(
    buildPdfReaderUrl(browser.runtime.getURL(PDF_READER_PAGE), href)
  );
};
