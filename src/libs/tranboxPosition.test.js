import {
  getMaxTranBoxContentHeight,
  getMaxTranBoxY,
  getTranBoxOuterHeight,
} from "./tranboxPosition";

// These values pin TRANBOX_CHROME_HEIGHT. The redesign increased the header
// from 36px to 56px and added a 1px card border, requiring 22px more outer height.
describe("translation box vertical bounds", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 500,
    });
  });

  test("includes the 56px header, resize grips, and card border", () => {
    expect(getTranBoxOuterHeight(200)).toBe(274);
    expect(getMaxTranBoxContentHeight()).toBe(426);
    expect(getMaxTranBoxY(200)).toBe(226);
  });

  test("never returns negative height or position limits", () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 50,
    });

    expect(getMaxTranBoxContentHeight()).toBe(0);
    expect(getMaxTranBoxY(200)).toBe(0);
  });
});
