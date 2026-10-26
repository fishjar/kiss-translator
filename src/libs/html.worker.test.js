/** @jest-environment node */

import { decodeHTMLEntities, decodeHTMLTranslationText } from "./html";
import {
  htmlTextCases,
  google2Text,
  google2Expected,
} from "./__fixtures__/htmlText";

jest.mock("./htmlTextDecoder", () =>
  jest.requireActual("./htmlTextDecoder.worker")
);

describe("HTML translation text in a worker without DOM APIs", () => {
  test("runs without DOMParser or document", () => {
    expect(typeof DOMParser).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(decodeHTMLEntities("React")).toBe("React");
  });

  test.each(htmlTextCases)("decodes %p to %p", (input, expected) => {
    expect(decodeHTMLEntities(input)).toBe(expected);
  });

  test("restores Google2 line breaks and decodes entities once", () => {
    expect(decodeHTMLTranslationText(google2Text)).toBe(google2Expected);
  });
});
