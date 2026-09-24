import {
  getMaxTranBoxContentWidth,
  getMaxTranBoxContentHeight,
  getMaxTranBoxX,
  getMaxTranBoxY,
  getTranBoxOuterWidth,
  getTranBoxOuterHeight,
  getTranBoxViewportHeight,
} from "./tranboxPosition";

// These values pin TRANBOX_CHROME_HEIGHT. The redesign increased the header
// from 36px to 56px and added a 1px card border, requiring 22px more outer height.
describe("translation box viewport bounds", () => {
  let originalInnerWidth;
  let originalInnerHeight;
  let clientWidth;
  let clientHeight;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    window.innerWidth = 800;
    window.innerHeight = 500;
    clientWidth = jest
      .spyOn(document.documentElement, "clientWidth", "get")
      .mockReturnValue(0);
    clientHeight = jest
      .spyOn(document.documentElement, "clientHeight", "get")
      .mockReturnValue(0);
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    window.innerHeight = originalInnerHeight;
    jest.restoreAllMocks();
  });

  test("keeps every outer edge within the document client area", () => {
    window.innerWidth = 1266;
    window.innerHeight = 806;
    clientWidth.mockReturnValue(1251);
    clientHeight.mockReturnValue(791);

    expect(getMaxTranBoxContentWidth() + getTranBoxOuterWidth(0)).toBe(1251);
    expect(getMaxTranBoxContentHeight() + getTranBoxOuterHeight(0)).toBe(791);
    expect(getMaxTranBoxX(400) + getTranBoxOuterWidth(400)).toBe(1251);
    expect(getMaxTranBoxY(200) + getTranBoxOuterHeight(200)).toBe(791);
    expect(getTranBoxViewportHeight()).toBe(791);
  });

  test("uses the full viewport when scrollbars take no space", () => {
    clientWidth.mockReturnValue(800);
    clientHeight.mockReturnValue(500);

    expect(getMaxTranBoxContentWidth()).toBe(784);
    expect(getMaxTranBoxContentHeight()).toBe(426);
    expect(getMaxTranBoxX(400)).toBe(384);
    expect(getMaxTranBoxY(200)).toBe(226);
  });

  test.each([0, undefined])(
    "falls back per axis when the client measurement is %s",
    (measurement) => {
      clientWidth.mockReturnValue(measurement);
      clientHeight.mockReturnValue(485);
      expect(getMaxTranBoxContentWidth()).toBe(784);
      expect(getMaxTranBoxY(200)).toBe(211);

      clientWidth.mockReturnValue(785);
      clientHeight.mockReturnValue(measurement);
      expect(getMaxTranBoxX(400)).toBe(369);
      expect(getMaxTranBoxContentHeight()).toBe(426);
      expect(getTranBoxViewportHeight()).toBe(500);
    }
  );

  test("falls back when no document root is available", () => {
    jest.spyOn(document, "documentElement", "get").mockReturnValue(null);

    expect(getMaxTranBoxContentWidth()).toBe(784);
    expect(getMaxTranBoxContentHeight()).toBe(426);
  });

  test("uses the body client area for a quirks-mode document", () => {
    jest.spyOn(document, "compatMode", "get").mockReturnValue("BackCompat");
    jest.spyOn(document.body, "clientWidth", "get").mockReturnValue(785);
    jest.spyOn(document.body, "clientHeight", "get").mockReturnValue(485);
    clientWidth.mockReturnValue(785);
    clientHeight.mockReturnValue(2200);

    expect(getMaxTranBoxX(400)).toBe(369);
    expect(getMaxTranBoxY(200)).toBe(211);
  });

  test("reads current client bounds after a viewport change", () => {
    clientWidth.mockReturnValue(785);
    clientHeight.mockReturnValue(485);
    expect(getMaxTranBoxX(400)).toBe(369);
    expect(getMaxTranBoxY(200)).toBe(211);

    clientWidth.mockReturnValue(1000);
    clientHeight.mockReturnValue(700);
    expect(getMaxTranBoxX(400)).toBe(584);
    expect(getMaxTranBoxY(200)).toBe(426);
  });

  test("never returns negative limits for a narrow client area", () => {
    clientWidth.mockReturnValue(10);
    clientHeight.mockReturnValue(50);

    expect(getMaxTranBoxContentWidth()).toBe(0);
    expect(getMaxTranBoxContentHeight()).toBe(0);
    expect(getMaxTranBoxX(400)).toBe(0);
    expect(getMaxTranBoxY(200)).toBe(0);
  });

  test("includes the 56px header, resize grips, and card border", () => {
    expect(getTranBoxOuterHeight(200)).toBe(274);
    expect(getMaxTranBoxContentHeight()).toBe(426);
    expect(getMaxTranBoxY(200)).toBe(226);
  });

  test("never returns negative height or position limits", () => {
    window.innerHeight = 50;

    expect(getMaxTranBoxContentHeight()).toBe(0);
    expect(getMaxTranBoxY(200)).toBe(0);
  });
});
