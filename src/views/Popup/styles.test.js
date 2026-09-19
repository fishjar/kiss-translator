import { POPUP_STYLES } from "./styles";
import { getCssAtRuleBodies } from "../../styles/testUtils";

describe("Safari popup sizing", () => {
  test("keeps an intrinsic preferred width within the available container", () => {
    const shellRule = POPUP_STYLES.match(/\.kt-popup-shell\s*\{([^}]*)\}/)?.[1];
    const scrollRule = POPUP_STYLES.match(
      /\.kt-popup-scroll\s*\{([^}]*)\}/
    )?.[1];

    expect(shellRule).toContain("width: 396px");
    expect(shellRule).toContain("max-width: 100%");
    expect(shellRule).toContain("min-width: 0");
    expect(POPUP_STYLES).not.toMatch(
      /\.kt-popup-shell:not\(\.kt-popup-shell--window\)\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/
    );
    expect(shellRule).not.toMatch(/max-(?:width|height):\s*100v[wh]/);
    expect(scrollRule).toContain("height: auto");
    expect(scrollRule).toContain("overflow: visible");
    expect(scrollRule).not.toContain("100vh");
    expect(POPUP_STYLES).not.toContain("kt-popup-scroll--expanded");
    expect(POPUP_STYLES).not.toContain("kt-popup-scroll--text");
    expect(POPUP_STYLES).not.toMatch(
      /\.kt-popup-style-chips--open\s*\{[^}]*overflow-y:\s*auto;/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-chrome\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/
    );
    expect(POPUP_STYLES).not.toMatch(/@media\s*\(max-height:/);
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-main-switch\.MuiSwitch-root\s*\{[^}]*width:\s*46px;[^}]*height:\s*28px;/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-main-switch \.MuiSwitch-switchBase\.Mui-checked\s*\{[^}]*transform:\s*translateX\(18px\);/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-main-switch \.MuiSwitch-switchBase\.Mui-checked \+ \.MuiSwitch-track\s*\{[^}]*background:\s*var\(--kt-pri\);/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-main-switch \.MuiSwitch-input\s*\{[^}]*left:\s*0;[^}]*width:\s*46px;[^}]*height:\s*28px;/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-main-switch \.MuiSwitch-switchBase\.Mui-checked \.MuiSwitch-input\s*\{[^}]*left:\s*-18px;/
    );
    expect(POPUP_STYLES).not.toMatch(
      /\.kt-popup-advanced-row \.MuiSwitch-input/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-main-switch \.MuiSwitch-switchBase\.Mui-disabled \+ \.MuiSwitch-track\s*\{[^}]*background:\s*var\(--kt-onv\);[^}]*opacity:\s*\.12;/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-main-switch \.MuiSwitch-switchBase\.Mui-checked\.Mui-disabled \+ \.MuiSwitch-track\s*\{[^}]*background:\s*var\(--kt-onv\);[^}]*opacity:\s*\.12;/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-advanced-row \.MuiSwitch-root\s*\{[^}]*margin:\s*-2px -4px;[^}]*\}/
    );
    expect(POPUP_STYLES).not.toMatch(
      /\.kt-popup-advanced-row \.MuiSwitch-root\s*\{[^}]*transform:/
    );
    expect(POPUP_STYLES).not.toMatch(
      /@media\s*\(max-width:\s*395px\)[\s\S]*?\.kt-popup-shell\s*\{\s*width:\s*100vw;/
    );
  });
});

describe("popup keyboard focus", () => {
  test("uses a rounded keyboard-only ring for compact language selectors", () => {
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-language-select \.MuiSelect-select\s*\{[^}]*border-radius:\s*inherit;/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-language-select \.MuiSelect-select\.MuiInputBase-input:focus\s*\{[^}]*outline:\s*3px solid var\(--kt-pri\);[^}]*background:\s*transparent;/
    );
    const focusVisibleBodies = getCssAtRuleBodies(
      POPUP_STYLES,
      "@supports selector(:focus-visible)"
    );
    expect(
      focusVisibleBodies.some(
        (body) =>
          /\.MuiSelect-select\.MuiInputBase-input:focus\s*\{[^}]*outline:\s*none;/.test(
            body
          ) &&
          /\.MuiSelect-select\.MuiInputBase-input:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--kt-pri\);/.test(
            body
          )
      )
    ).toBe(true);
  });

  test("does not clip service focus rings in the collapsed row", () => {
    const servicesRule = POPUP_STYLES.match(
      /\.kt-popup-services\s*\{([^}]*)\}/
    )?.[1];

    expect(servicesRule).toContain("overflow: visible");
    expect(servicesRule).not.toContain("overflow: hidden");
  });

  test("keeps the disabled language swap arrow visibly dark", () => {
    const swapRule = POPUP_STYLES.match(
      /\.kt-popup-swap\.MuiIconButton-root\.Mui-disabled\s*\{([^}]*)\}/
    )?.[1];

    expect(swapRule).toContain("color: var(--kt-line)");
    expect(swapRule).toContain("opacity: 1");
  });
});

describe("popup translation controls", () => {
  test("centers the header and compact controls with symmetric padding", () => {
    const headerRule = POPUP_STYLES.match(
      /\.kt-popup-header\s*\{([^}]*)\}/
    )?.[1];
    const moreServiceRule = POPUP_STYLES.match(
      /\.kt-popup-more-service\s*\{([^}]*)\}/
    )?.[1];

    expect(headerRule).toContain("padding: 7px 14px");
    expect(moreServiceRule).toContain("padding-inline: 10px");
  });

  test("uses a rounded, theme-aware language menu", () => {
    const menuRule = POPUP_STYLES.match(
      /\.kt-popup-language-menu\.MuiPaper-root\s*\{([^}]*)\}/
    )?.[1];

    expect(menuRule).toContain("border-radius: 4px");
    expect(menuRule).toContain("background: var(--kt-sf1)");
    expect(menuRule).toContain("color: var(--kt-on)");
    expect(menuRule).toContain("max-height: min(280px, calc(100% - 32px))");
    expect(menuRule).toContain("overflow-y: auto");
    expect(menuRule).not.toContain("overflow: hidden");
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-language-select \.MuiSelect-icon\s*\{[^}]*transition:\s*transform/
    );
    const hoverBodies = getCssAtRuleBodies(
      POPUP_STYLES,
      "@media (hover: hover)"
    );
    expect(
      hoverBodies.some(
        (body) =>
          /\.kt-popup-language-menu \.MuiMenuItem-root:hover/.test(body) &&
          /\.kt-popup-language-menu \.MuiMenuItem-root\.Mui-selected:hover/.test(
            body
          )
      )
    ).toBe(true);
  });

  test("wraps long scene labels", () => {
    const sceneLabelRule = POPUP_STYLES.match(
      /\.kt-popup-scene__label\s*\{([^}]*)\}/
    )?.[1];

    expect(sceneLabelRule).toContain("white-space: normal");
    expect(sceneLabelRule).toContain("overflow-wrap: anywhere");
    expect(sceneLabelRule).not.toContain("text-overflow: ellipsis");
  });

  test("rotates the more-services icon when expanded", () => {
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-more-service\[aria-expanded="true"\] svg\s*\{[^}]*transform:\s*rotate\(180deg\);/
    );
  });

  test("keeps the all-styles disclosure inside the chip flow", () => {
    const moreStyleRule = POPUP_STYLES.match(
      /\.kt-popup-style-more\s*\{([^}]*)\}/
    )?.[1];

    expect(moreStyleRule).toContain("min-height: 44px");
    expect(moreStyleRule).toContain("flex-direction: row");
    expect(moreStyleRule).toContain("background: var(--kt-sf2)");
    expect(moreStyleRule).not.toContain("margin:");
  });

  test("uses restrained shapes for page translation controls", () => {
    const heroRule = POPUP_STYLES.match(/\.kt-popup-hero\s*\{([^}]*)\}/)?.[1];
    const serviceRule = POPUP_STYLES.match(
      /\.kt-popup-service\s*\{([^}]*)\}/
    )?.[1];

    expect(heroRule).toContain("border-radius: 16px");
    expect(serviceRule).toContain("border-radius: 8px");
    expect(serviceRule).toContain("font-weight: 650");
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-site__select\s*\{[^}]*border-radius:\s*8px;/
    );
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-style-chip\s*\{[^}]*font-weight:\s*650;/
    );
  });
});

// Keep the background full-width and the content centered with readable lines.
describe("separate translation window layout", () => {
  const windowShellRule = POPUP_STYLES.match(
    /\.kt-popup-shell--window\s*\{([^}]*)\}/
  )?.[1];
  const centeredRule = POPUP_STYLES.match(
    /\.kt-popup-shell--window \.kt-popup-text-panel,[^{]*\{([^}]*)\}/
  )?.[1];

  test("lets the shell span the whole window", () => {
    expect(windowShellRule).toContain("width: 100%");
    // A fixed shell width would expose a different background at either side.
    expect(windowShellRule).not.toMatch(/width:\s*min\(/);
  });

  test("centers the content and caps how wide a line gets", () => {
    expect(centeredRule).toContain("width: min(720px, 100%)");
    expect(centeredRule).toContain("margin-inline: auto");
  });

  test("does not animate geometry while fitting the standalone window", () => {
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-shell--window \.kt-popup-text-panel\s*\{[^}]*animation:\s*none;/
    );
    expect(POPUP_STYLES).not.toMatch(
      /@media\s*\(max-width:\s*395px\)[\s\S]*?\.kt-popup-shell--window\s*\{[^}]*width:\s*100vw;/
    );
  });

  test("measures full height against the dynamic viewport", () => {
    // Dynamic units account for the mobile browser toolbar.
    expect(windowShellRule).toContain("min-height: 100dvh");
    expect(windowShellRule).not.toContain("min-height: 100vh");
  });
});
