import { FLOATING_BUTTON_STYLES } from "./FloatingButton.styles";

test("FloatingButton keeps a visible forced-colors focus fallback", () => {
  expect(FLOATING_BUTTON_STYLES).toMatch(
    /@media \(forced-colors: active\)\s*\{\s*\.kt-content-fab\.MuiFab-root:focus-visible\s*\{[^}]*outline:\s*3px solid;[^}]*outline-offset:\s*-3px;[^}]*box-shadow:\s*none;\s*\}/
  );
  expect(FLOATING_BUTTON_STYLES).toMatch(
    /\.kt-content-fab\.MuiFab-root:focus-visible\s*\{\s*outline:\s*none\b/
  );
  expect(
    FLOATING_BUTTON_STYLES.search(/@media\s*\(\s*forced-colors:\s*active\s*\)/)
  ).toBeGreaterThan(
    FLOATING_BUTTON_STYLES.search(
      /\.kt-content-fab\.MuiFab-root:focus-visible\s*\{\s*outline:\s*none\b/
    )
  );
});
