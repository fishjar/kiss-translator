import {
  encodeSegments,
  parseSegments,
  createXmlSegmentParser,
  createNDJSONParser,
} from "./segments";
const items = [
  { id: "a", text: "<b>&中文</b>" },
  { id: "b", text: "second" },
];

test.each(["json", "xml", "line"])(
  "%s segments preserve stable IDs and reject missing responses",
  (format) => {
    expect(
      parseSegments(encodeSegments(items, format), { items, format })
    ).toEqual({ items });
    expect(() =>
      parseSegments(encodeSegments(items.slice(0, 1), format), {
        items,
        format,
      })
    ).toThrow();
  }
);
test("XML incrementally emits only complete elements and refuses malformed final content", () => {
  const parser = createXmlSegmentParser({ items });
  expect(parser.push('<root><t id="b">sec')).toEqual([]);
  expect(
    parser.push('ond</t><t id="a">&lt;b&gt;&amp;中文&lt;/b&gt;</t></root>')
  ).toEqual([
    { type: "item.complete", id: "b", text: "second" },
    { type: "item.complete", id: "a", text: items[0].text },
  ]);
  expect(parser.finish()).toEqual({ items });
  expect(() =>
    parseSegments("<!DOCTYPE root><root></root>", { items, format: "xml" })
  ).toThrow();
  expect(() =>
    parseSegments('<root><t id="a">x</root>', { items, format: "xml" })
  ).toThrow();
});
test("NDJSON handles split CRLF, empty frames and a final unterminated record", () => {
  const parser = createNDJSONParser();
  expect(parser.push('{"x":')).toEqual([]);
  expect(parser.push('1}\r\n\n{"y":2}')).toEqual([{ x: 1 }]);
  expect(parser.finish()).toEqual([{ y: 2 }]);
});
