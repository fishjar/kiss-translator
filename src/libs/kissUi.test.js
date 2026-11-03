import { act } from "react";
import { KISS_UI_SELECTOR } from "./kissUi";
import { ImageHoverDetector } from "./imageTranslate/imageHoverDetector";
import { ImageSourceHighlight } from "./imageTranslate/imageSourceHighlight";
import {
  RuleHighlights,
  isEditorElement,
  isPageElement,
} from "./ruleEditorDom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("./msg", () => ({ sendBgMsg: jest.fn() }));

test("real image UI roots and rule highlights are excluded independently of notranslate", () => {
  const originalObserver = global.IntersectionObserver;
  const originalResizeObserver = global.ResizeObserver;
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.ResizeObserver = global.IntersectionObserver;
  const image = document.createElement("img");
  image.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 200,
    height: 100,
  });
  document.body.append(image);
  let hover;
  let highlights;
  const source = new ImageSourceHighlight();
  try {
    act(() => {
      hover = new ImageHoverDetector({ setting: {}, rule: {} });
    });
    source.highlight(image);
    highlights = new RuleHighlights();
    const roots = [
      document.querySelector(".kt-image-hover-root"),
      document.querySelector(".kt-image-source-highlight"),
      highlights.host,
    ];
    for (const root of roots) {
      root.classList.remove("notranslate");
      expect(root.matches(KISS_UI_SELECTOR)).toBe(true);
      const child = document.createElement("span");
      root.append(child);
      expect(isEditorElement(child)).toBe(true);
      expect(isPageElement(child)).toBe(false);
    }
    const page = document.createElement("span");
    page.className =
      "notranslate kiss-translator-original kiss-translator-highlight";
    document.body.append(page);
    expect(page.matches(KISS_UI_SELECTOR)).toBe(false);
    expect(isEditorElement(page)).toBe(false);
    page.remove();
  } finally {
    act(() => hover?.destroy());
    source.clear();
    highlights?.destroy();
    image.remove();
    global.IntersectionObserver = originalObserver;
    global.ResizeObserver = originalResizeObserver;
  }
});
