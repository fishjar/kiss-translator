import { parse } from "parse5";
import { HTML_TEXT_IGNORED_TAGS } from "./htmlTextTags";

const getText = (node) => {
  if (!node) return "";
  if (node.nodeName === "#text") return node.value || "";
  if (HTML_TEXT_IGNORED_TAGS.includes(node.nodeName)) return "";
  return (node.childNodes || []).map(getText).join("");
};

export function decodeHTMLText(str) {
  // Match inert DOMParser documents, including noscript fallback content.
  return getText(parse(str, { scriptingEnabled: false }));
}
