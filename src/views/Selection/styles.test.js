import { SELECTION_STYLES } from "./styles";
import { getCssAtRuleBodies } from "../../styles/testUtils";

describe("selection Material 3 shapes", () => {
  test("uses restrained surface and menu radii", () => {
    expect(SELECTION_STYLES).toMatch(
      /\.KT-draggable-body\s*\{[^}]*border-radius:\s*16px !important;/
    );
    expect(SELECTION_STYLES).toMatch(
      /\.kt-tranbox-header__menu\s*\{[^}]*border-radius:\s*4px;/
    );
    expect(SELECTION_STYLES).toMatch(
      /\.kt-tranbox-header__menu button\s*\{[^}]*border-radius:\s*8px;/
    );
    expect(SELECTION_STYLES).toMatch(
      /\.kt-tranbox-header \.MuiIconButton-root\[aria-pressed="true"\]:hover\s*\{[^}]*var\(--kt-onpric\) 8%/
    );
    expect(SELECTION_STYLES).toMatch(
      /\.kt-tranbox-header \.MuiIconButton-root\[aria-pressed="true"\]\.Mui-focusVisible,[\s\S]*?\[aria-pressed="true"\]:active\s*\{[^}]*var\(--kt-onpric\) 10%/
    );
    expect(SELECTION_STYLES).not.toContain(
      ".KT-draggable-container .MuiStack-root { gap: 12px; }"
    );
    const hoverBodies = getCssAtRuleBodies(
      SELECTION_STYLES,
      "@media (hover: hover)"
    );
    expect(
      hoverBodies.some((body) =>
        /\.kt-tranbox-header__menu button:hover/.test(body)
      )
    ).toBe(true);
  });

  test("keeps the small translation FAB shape stable on hover", () => {
    const baseRule = SELECTION_STYLES.match(/\.KT-tranbtn\s*\{([^}]*)\}/)?.[1];
    const hoverRule = SELECTION_STYLES.match(
      /\.KT-tranbtn:hover\s*\{([^}]*)\}/
    )?.[1];
    const activeRule = SELECTION_STYLES.match(
      /\.KT-tranbtn:active\s*\{([^}]*)\}/
    )?.[1];

    expect(baseRule).toContain("border-radius: 12px");
    expect(baseRule).toContain("width: 40px");
    expect(baseRule).toContain("height: 40px");
    expect(baseRule).toContain("border: 0");
    expect(baseRule).toContain("color: var(--kt-onpric)");
    expect(baseRule).not.toContain("animation:");
    expect(baseRule).not.toMatch(/transition:[^;]*border-radius/);
    expect(SELECTION_STYLES).toMatch(
      /@media\s*\(hover:\s*hover\)\s*\{\s*\.KT-tranbtn:hover/
    );
    expect(hoverRule).toContain("var(--kt-onpric) 8%");
    expect(hoverRule).not.toContain("border-radius");
    expect(activeRule).toContain("transform: scale(.94)");
    expect(SELECTION_STYLES).toMatch(
      /\.KT-tranbtn svg\s*\{[^}]*fill:\s*currentColor;[^}]*\}/
    );
    expect(SELECTION_STYLES).not.toMatch(
      /\.KT-tranbtn svg\s*\{[^}]*border-radius:/
    );
  });

  test("keeps a complete keyboard focus fallback", () => {
    const fallbackRule = SELECTION_STYLES.match(
      /\.KT-tranbtn:focus\s*\{([^}]*)\}/
    )?.[1];
    const visibleRule = SELECTION_STYLES.match(
      /\.KT-tranbtn:focus-visible\s*\{([^}]*)\}/
    )?.[1];

    expect(fallbackRule).toContain("outline: none");
    expect(fallbackRule).toContain("inset 0 0 0 3px var(--kt-pri)");
    expect(SELECTION_STYLES).toContain("@supports selector(:focus-visible)");
    expect(SELECTION_STYLES).toMatch(
      /@supports selector\(:focus-visible\)\s*\{[\s\S]*?\.KT-tranbtn:focus\s*\{[^}]*box-shadow:\s*var\(--kt-shadow-2\);/
    );
    expect(visibleRule).toContain("outline: none");
    expect(visibleRule).toContain("inset 0 0 0 3px var(--kt-pri)");
  });
});
