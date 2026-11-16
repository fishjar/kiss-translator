import { getViewportSize } from "./viewport";

describe("getViewportSize", () => {
  let originals;

  beforeEach(() => {
    originals = [
      [document, "scrollingElement"],
      [window, "innerWidth"],
      [window, "innerHeight"],
    ].map(([target, property]) => [
      target,
      property,
      Object.getOwnPropertyDescriptor(target, property),
    ]);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1446,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 779,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [target, property, descriptor] of originals) {
      if (descriptor) {
        Object.defineProperty(target, property, descriptor);
      } else {
        delete target[property];
      }
    }
  });

  function setScrollingElement(element) {
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: element,
    });
  }

  test.each(["CSS1Compat", "BackCompat"])(
    "reads the browser-provided viewport root in %s, excluding scrollbars",
    (mode) => {
      const viewport =
        mode === "BackCompat" ? document.body : document.documentElement;
      const page =
        mode === "BackCompat" ? document.documentElement : document.body;
      setScrollingElement(viewport);
      jest.spyOn(viewport, "clientWidth", "get").mockReturnValue(1431);
      jest.spyOn(viewport, "clientHeight", "get").mockReturnValue(779);
      jest.spyOn(page, "clientHeight", "get").mockReturnValue(9441);

      expect(getViewportSize()).toEqual({ w: 1431, h: 779 });
    }
  );

  test("falls back to window dimensions when there is no scrolling root", () => {
    setScrollingElement(null);
    expect(getViewportSize()).toEqual({ w: 1446, h: 779 });
  });

  test.each([
    [0, 0, { w: 1446, h: 779 }],
    [1431, 0, { w: 1431, h: 779 }],
    [0, 700, { w: 1446, h: 700 }],
  ])("falls back independently for zero dimensions (%s, %s)", (w, h, size) => {
    setScrollingElement({ clientWidth: w, clientHeight: h });
    expect(getViewportSize()).toEqual(size);
  });

  test("returns zero when neither source has a measured size", () => {
    setScrollingElement({ clientWidth: 0, clientHeight: 0 });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: undefined,
    });
    expect(getViewportSize()).toEqual({ w: 0, h: 0 });
  });
});
