import fs from "fs";
import path from "path";
import { SEPARATE_WINDOW_CONTENT_WIDTH } from "../../config/app";
import { POPUP_STYLES } from "./styles";

/**
 * Read the default separate window bounds from source.
 *
 * Importing background.js would register extension listeners, so read its
 * constant directly without initializing an extension environment.
 *
 * @returns {{widthExpr: string, height: number}} Width expression and initial height.
 */
function readDefaultWindowBounds() {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../background.js"),
    "utf-8"
  );
  const block = source.match(
    /const DEFAULT_SEPARATE_WINDOW_BOUNDS = \{([^}]*)\}/
  )?.[1];

  return {
    widthExpr: block.match(/width:\s*([^,\n]+)/)?.[1].trim(),
    height: Number(block.match(/height:\s*(\d+)/)?.[1]),
  };
}

// Start with room for the form until MSG_FIT_SEPARATE_WINDOW fits the content.
describe("separate translation window default size", () => {
  const bounds = readDefaultWindowBounds();

  test("derives its width from the shared content cap", () => {
    // Share the width cap with CSS to keep both surfaces consistent.
    expect(bounds.widthExpr).toContain("SEPARATE_WINDOW_CONTENT_WIDTH");
  });

  test("opens tall enough for the whole form before it is measured", () => {
    // Avoid showing a scrollbar before the first content measurement.
    expect(bounds.height).toBeGreaterThanOrEqual(640);
  });
});

describe("separate window content cap", () => {
  test("is the single source for the CSS panel width", () => {
    expect(POPUP_STYLES).toContain(
      `width: min(${SEPARATE_WINDOW_CONTENT_WIDTH}px, 100%)`
    );
  });

  test("stays wide enough to be worth capping", () => {
    expect(SEPARATE_WINDOW_CONTENT_WIDTH).toBeGreaterThanOrEqual(560);
  });
});
