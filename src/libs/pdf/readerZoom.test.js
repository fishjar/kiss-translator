import {
  MAX_SCALE,
  MIN_SCALE,
  clampScaleFactor,
  createWheelZoom,
  isZoomWheel,
  wheelZoomFactor,
} from "./readerZoom";

describe("isZoomWheel", () => {
  test.each([
    [{ ctrlKey: true, metaKey: false }, true],
    [{ ctrlKey: false, metaKey: true }, true],
    [{ ctrlKey: false, metaKey: false }, false],
  ])("%j -> %s", (event, expected) => {
    expect(isZoomWheel(event)).toBe(expected);
  });
});

describe("wheelZoomFactor", () => {
  test("scrolling up zooms in and scrolling down zooms out", () => {
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0 })).toBeGreaterThan(1);
    expect(wheelZoomFactor({ deltaY: 100, deltaMode: 0 })).toBeLessThan(1);
  });

  test("opposite notches cancel out", () => {
    const zoomIn = wheelZoomFactor({ deltaY: -100, deltaMode: 0 });
    const zoomOut = wheelZoomFactor({ deltaY: 100, deltaMode: 0 });
    expect(zoomIn * zoomOut).toBeCloseTo(1);
  });

  test("a mouse notch moves in a noticeable but controlled step", () => {
    const factor = wheelZoomFactor({ deltaY: -100, deltaMode: 0 });
    expect(factor).toBeGreaterThan(1.1);
    expect(factor).toBeLessThan(1.35);
  });

  test("small trackpad pinch deltas stay smooth", () => {
    const factor = wheelZoomFactor({ deltaY: -2, deltaMode: 0 });
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThan(1.02);
  });

  test("line-based deltas are converted to pixels", () => {
    expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1 })).toBeCloseTo(
      wheelZoomFactor({ deltaY: -48, deltaMode: 0 })
    );
  });

  test("very fast wheel spins are capped", () => {
    expect(wheelZoomFactor({ deltaY: -5000, deltaMode: 0 })).toBeCloseTo(
      wheelZoomFactor({ deltaY: -200, deltaMode: 0 })
    );
  });
});

describe("clampScaleFactor", () => {
  test("keeps factors that stay inside the range", () => {
    expect(clampScaleFactor(1, 1.2)).toBeCloseTo(1.2);
  });

  test("limits zooming beyond the bounds", () => {
    expect(
      clampScaleFactor(MAX_SCALE - 0.5, 2) * (MAX_SCALE - 0.5)
    ).toBeCloseTo(MAX_SCALE);
    expect(
      clampScaleFactor(MIN_SCALE + 0.05, 0.1) * (MIN_SCALE + 0.05)
    ).toBeCloseTo(MIN_SCALE);
  });

  test("does nothing at the limit", () => {
    expect(clampScaleFactor(MAX_SCALE, 1.5)).toBe(1);
    expect(clampScaleFactor(MIN_SCALE, 0.5)).toBe(1);
  });
});

describe("createWheelZoom", () => {
  const notch = (deltaY) => ({ deltaY, deltaMode: 0 });

  test("applies a full mouse notch immediately", () => {
    const zoom = createWheelZoom();
    expect(zoom(1, notch(-100))).toBeGreaterThan(1.1);
  });

  test("accumulates pinch deltas too small for two-decimal scales", () => {
    const zoom = createWheelZoom();
    expect(zoom(1, notch(-1))).toBeNull();
    expect(zoom(1, notch(-1))).toBeNull();
    const factor = zoom(1, notch(-2));
    expect(factor).toBeGreaterThan(1);
    expect(Math.round(factor * 100) / 100).toBe(1.01);
  });

  test("starts fresh after applying a change", () => {
    const zoom = createWheelZoom();
    zoom(1, notch(-100));
    expect(zoom(1.22, notch(-1))).toBeNull();
  });

  test("does not build up pending zoom at the limit", () => {
    const zoom = createWheelZoom();
    for (let i = 0; i < 20; i += 1) {
      expect(zoom(MAX_SCALE, notch(-100))).toBeNull();
    }
    expect(zoom(MAX_SCALE, notch(100))).toBeLessThan(1);
  });
});
