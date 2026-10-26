import { trustedTypesHelper } from "./trustedTypes";
import { HTML_TEXT_IGNORED_TAGS } from "./htmlTextTags";

export function decodeHTMLText(str) {
  const doc = new DOMParser().parseFromString(
    trustedTypesHelper.createHTMLForText(str),
    "text/html"
  );
  doc.querySelectorAll(HTML_TEXT_IGNORED_TAGS.join(",")).forEach((node) => {
    node.remove();
  });
  return doc.documentElement.textContent || "";
}
