import { isHtmlDocument } from "./htmlDocument";

const parse = (source, type) => new DOMParser().parseFromString(source, type);

describe("isHtmlDocument", () => {
  test("returns true for HTML documents", () => {
    expect(isHtmlDocument(document)).toBe(true);
    expect(isHtmlDocument(parse("<p>hi</p>", "text/html"))).toBe(true);
  });

  test("returns true for XHTML documents", () => {
    const doc = parse(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>',
      "application/xhtml+xml"
    );
    expect(isHtmlDocument(doc)).toBe(true);
  });

  test("returns false for XML documents", () => {
    const doc = parse(
      '<?xml version="1.0"?><root><item/></root>',
      "application/xml"
    );
    expect(isHtmlDocument(doc)).toBe(false);
  });

  test("returns false for SVG documents", () => {
    const doc = parse(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
      "image/svg+xml"
    );
    expect(isHtmlDocument(doc)).toBe(false);
  });

  test("returns false for missing documents", () => {
    expect(isHtmlDocument(undefined)).toBe(false);
    expect(isHtmlDocument({})).toBe(false);
  });
});
