import { PADDLEOCR_ORIGIN } from "../config/apiConstants";
import { normalizeOriginRewriteList } from "./originRules";

test("always appends the PaddleOCR origin for old and new settings", () => {
  expect(normalizeOriginRewriteList(undefined)).toEqual([PADDLEOCR_ORIGIN]);
  expect(normalizeOriginRewriteList("")).toEqual([PADDLEOCR_ORIGIN]);
  expect(
    normalizeOriginRewriteList("https://dict.youdao.com,\nhttps://example.com")
  ).toEqual([
    "https://dict.youdao.com",
    "https://example.com",
    PADDLEOCR_ORIGIN,
  ]);
});

test("deduplicates user entries and trims whitespace", () => {
  expect(
    normalizeOriginRewriteList([
      " https://dict.youdao.com ",
      "https://dict.youdao.com",
      PADDLEOCR_ORIGIN,
    ])
  ).toEqual(["https://dict.youdao.com", PADDLEOCR_ORIGIN]);
});
