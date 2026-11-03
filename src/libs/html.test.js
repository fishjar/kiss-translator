import { decodeHTMLEntities, decodeHTMLTranslationText } from "./html";
import { trustedTypesHelper } from "./trustedTypes";
import {
  htmlTextCases,
  google2Text,
  google2Expected,
} from "./__fixtures__/htmlText";

describe("HTML translation text in a browser", () => {
  test.each(htmlTextCases)("decodes %p to %p", (input, expected) => {
    expect(decodeHTMLEntities(input)).toBe(expected);
  });

  test("restores Google2 line breaks and decodes entities once", () => {
    expect(decodeHTMLTranslationText(google2Text)).toBe(google2Expected);
  });

  test("retaining noscript for text does not change HTML rendering sanitization", () => {
    const html = "Body<noscript><b>Fallback</b></noscript>";
    expect(decodeHTMLEntities(html)).toBe("BodyFallback");
    expect(String(trustedTypesHelper.createHTML(html))).toBe("Body");
  });
});
