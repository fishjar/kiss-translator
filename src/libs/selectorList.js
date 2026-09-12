import selectorParser from "postcss-selector-parser";

export const SELECTOR_FIELDS = [
  "selector",
  "ignoreSelector",
  "rootsSelector",
  "keepSelector",
  "blockSelector",
];

// A valid CSS selector that explicitly matches nothing. Empty strings inherit.
export const EMPTY_SELECTOR = ":not(*)";

export function splitSelectorList(value = "") {
  if (!value.trim()) return [];
  return selectorParser()
    .astSync(value)
    .nodes.map((node) => node.toString().trim())
    .filter(Boolean);
}
