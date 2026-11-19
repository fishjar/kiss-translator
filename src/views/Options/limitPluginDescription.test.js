import limitPluginDescription from "./limitPluginDescription";

const text = (value) => ({ type: "text", value });
const link = (label) => ({
  type: "element",
  tagName: "a",
  properties: { href: "https://example.com/setup" },
  children: [text(label)],
});

test("keeps an intact link when truncation falls inside its label", () => {
  const prefix = "中".repeat(996);
  const tree = {
    type: "root",
    children: [text(prefix), link("使用😀指引"), text("later")],
  };

  limitPluginDescription()(tree);

  expect(tree.children).toEqual([text(prefix), link("使用😀…")]);
});

test("only replaces the last code point when content exceeds the exact limit", () => {
  const value = "中".repeat(999) + "😀";
  const tree = { type: "root", children: [link(value)] };

  limitPluginDescription()(tree);
  expect(tree.children).toEqual([link(value)]);

  tree.children.push(text("extra"));
  limitPluginDescription()(tree);
  expect(tree.children).toEqual([link("中".repeat(999) + "…")]);
});
