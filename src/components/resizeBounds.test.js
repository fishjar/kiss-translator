import {
  MIN_RESIZE_HEIGHT,
  MIN_RESIZE_HEIGHT_MEDIUM,
  KEYBOARD_RESIZE_STEP,
  VIEWPORT_SAFE_GUTTER,
  toFiniteNumber,
  resolveResizeMaxHeight,
  normalizeResizeHeight,
} from "./resizeBounds";

describe("resizeBounds pure functions", () => {
  test("constants are defined as expected", () => {
    expect(MIN_RESIZE_HEIGHT).toBe(40);
    expect(KEYBOARD_RESIZE_STEP).toBe(12);
    expect(typeof VIEWPORT_SAFE_GUTTER).toBe("number");
    expect(VIEWPORT_SAFE_GUTTER).toBeGreaterThan(0);
  });

  test("min heights are derived from one text line plus root padding", () => {
    expect(MIN_RESIZE_HEIGHT).toBe(23 + 17);
    expect(MIN_RESIZE_HEIGHT_MEDIUM).toBe(23 + 33);
    expect(MIN_RESIZE_HEIGHT_MEDIUM).toBe(56);
  });

  describe("toFiniteNumber", () => {
    test("returns finite numbers", () => {
      expect(toFiniteNumber(100, 40)).toBe(100);
      expect(toFiniteNumber(0, 40)).toBe(0);
      expect(toFiniteNumber(-50, 40)).toBe(-50);
      expect(toFiniteNumber(3.14, 40)).toBe(3.14);
    });

    test("falls back on non-finite values", () => {
      expect(toFiniteNumber(undefined, 40)).toBe(40);
      expect(toFiniteNumber(null, 40)).toBe(40);
      expect(toFiniteNumber(NaN, 40)).toBe(40);
      expect(toFiniteNumber(Infinity, 40)).toBe(40);
      expect(toFiniteNumber(-Infinity, 40)).toBe(40);
      expect(toFiniteNumber("100", 40)).toBe(40);
    });
  });

  describe("resolveResizeMaxHeight", () => {
    test("returns finite values clamped to MIN_RESIZE_HEIGHT", () => {
      expect(resolveResizeMaxHeight(500, 100)).toBe(500);
      expect(resolveResizeMaxHeight(20, 100)).toBe(40);
      expect(resolveResizeMaxHeight(-20, 100)).toBe(40);
      expect(resolveResizeMaxHeight(0, 100)).toBe(40);
    });

    test("falls back on non-finite maxHeight", () => {
      expect(resolveResizeMaxHeight(undefined, 100)).toBe(100);
      expect(resolveResizeMaxHeight(NaN, 100)).toBe(100);
      expect(resolveResizeMaxHeight(Infinity, 100)).toBe(100);
      expect(resolveResizeMaxHeight(-Infinity, 100)).toBe(100);
      expect(resolveResizeMaxHeight(null, 100)).toBe(100);
    });

    test("clamps fallback if fallback is below MIN_RESIZE_HEIGHT", () => {
      expect(resolveResizeMaxHeight(undefined, 20)).toBe(40);
      expect(resolveResizeMaxHeight(undefined, -10)).toBe(40);
      expect(resolveResizeMaxHeight(undefined, undefined)).toBe(40);
      expect(resolveResizeMaxHeight(NaN, NaN)).toBe(40);
    });

    test("honors an explicit min floor without changing the default behavior", () => {
      expect(resolveResizeMaxHeight(20, 100, 56)).toBe(56);
      expect(resolveResizeMaxHeight(undefined, 30, 56)).toBe(56);
      expect(resolveResizeMaxHeight(undefined, undefined, 56)).toBe(56);
      expect(resolveResizeMaxHeight(20, 100)).toBe(40);
    });
  });

  describe("normalizeResizeHeight", () => {
    test("clamps finite values within [MIN_RESIZE_HEIGHT, resolvedMax]", () => {
      expect(normalizeResizeHeight(200, 500, 100)).toBe(200);
      expect(normalizeResizeHeight(20, 500, 100)).toBe(40);
      expect(normalizeResizeHeight(600, 500, 100)).toBe(500);
      expect(normalizeResizeHeight(-100, 500, 100)).toBe(40);
    });

    test("handles non-finite value by falling back to the measured height", () => {
      expect(normalizeResizeHeight(undefined, 500, 150)).toBe(150);
      expect(normalizeResizeHeight(NaN, 500, 150)).toBe(150);
      expect(normalizeResizeHeight(Infinity, 500, 150)).toBe(150);
      expect(normalizeResizeHeight(-Infinity, 500, 150)).toBe(150);
      expect(normalizeResizeHeight(null, 500, 20)).toBe(40);
    });

    test("handles extreme small max height where max <= min", () => {
      expect(normalizeResizeHeight(300, 20, 100)).toBe(40);
      expect(normalizeResizeHeight(20, 20, 100)).toBe(40);
    });

    test("returns MIN_RESIZE_HEIGHT when all parameters are invalid/undefined", () => {
      expect(normalizeResizeHeight(undefined, undefined, undefined)).toBe(40);
      expect(normalizeResizeHeight(NaN, NaN, NaN)).toBe(40);
    });

    test("normalizeResizeHeight honors an explicit min floor (medium variant)", () => {
      expect(normalizeResizeHeight(20, 500, 100, 56)).toBe(56);
      expect(normalizeResizeHeight(40, 500, 100, 56)).toBe(56);
      expect(normalizeResizeHeight(80, 500, 100, 56)).toBe(80);
      // upper < floor 反转防线：normalize 内部 resolve 必须同步穿参
      expect(normalizeResizeHeight(80, 20, 100, 56)).toBe(56);
      // 不传 min 时回退默认下界 40
      expect(normalizeResizeHeight(20, 500, 100)).toBe(40);
      expect(normalizeResizeHeight(undefined, undefined, undefined)).toBe(40);
    });
  });
});
