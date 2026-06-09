import { trustedTypesHelper } from "./trustedTypes";

/**
 * Extract plain text from an HTML string, optionally removing nodes first.
 * @param {string} htmlStr
 * @param {string} skipTag
 * @returns {string}
 */
export const getHtmlText = (htmlStr, skipTag = "") => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    trustedTypesHelper.createHTML(htmlStr),
    "text/html"
  );

  if (skipTag) {
    doc.querySelectorAll(skipTag).forEach((el) => el.remove());
  }

  return doc.body.innerText.trim();
};

/**
 * Escape plain text for safe HTML rendering.
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Decode HTML entities back to plain text.
 * @param {string} str
 * @returns {string}
 */
export function decodeHTMLEntities(str) {
  if (!str || typeof str !== "string") return str;

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    trustedTypesHelper.createHTML(str),
    "text/html"
  );

  return doc.documentElement.textContent || "";
}
