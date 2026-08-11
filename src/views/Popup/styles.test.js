import { POPUP_STYLES } from "./styles";

describe("Safari popup sizing", () => {
  test("uses intrinsic fixed dimensions instead of viewport-relative sizing", () => {
    const shellRule = POPUP_STYLES.match(/\.kt-popup-shell\s*\{([^}]*)\}/)?.[1];
    const scrollRule = POPUP_STYLES.match(
      /\.kt-popup-scroll\s*\{([^}]*)\}/
    )?.[1];

    expect(shellRule).toContain("width: 396px");
    expect(shellRule).toContain("min-width: 396px");
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
    expect(POPUP_STYLES).not.toMatch(
      /@media\s*\(max-width:\s*395px\)[\s\S]*?\.kt-popup-shell\s*\{\s*width:\s*100vw;/
    );
  });
});

describe("popup keyboard focus", () => {
  test("does not suppress the compatible global focus outline", () => {
    expect(POPUP_STYLES).not.toMatch(/:focus\s*\{\s*outline:\s*(?:0|none)/);
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-translation-input textarea\s*\{[^}]*outline:\s*0;/
    );
  });

  test("restores a solid focus ring for the compact language selector", () => {
    expect(POPUP_STYLES).toMatch(
      /\.kt-popup-language-select \.MuiSelect-select\.MuiInputBase-input:focus,[\s\S]*?\.MuiInputBase-input:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--kt-pri\);[^}]*outline-offset:\s*2px;/
    );
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
    const languageSelectRule = POPUP_STYLES.match(
      /\.kt-popup-translation-direction \.kt-popup-language-select \.MuiSelect-select\s*\{([^}]*)\}/
    )?.[1];

    expect(headerRule).toContain("padding: 7px 14px");
    expect(moreServiceRule).toContain("padding-inline: 10px");
    expect(languageSelectRule).toContain("padding: 7px 28px !important");
  });

  test("uses a rounded, theme-aware language menu", () => {
    const menuRule = POPUP_STYLES.match(
      /\.kt-popup-language-menu\.MuiPaper-root\s*\{([^}]*)\}/
    )?.[1];

    expect(menuRule).toContain("border-radius: 16px");
    expect(menuRule).toContain("background: var(--kt-sf1)");
    expect(menuRule).toContain("color: var(--kt-on)");
    expect(menuRule).toContain("overflow-y: auto");
    expect(menuRule).not.toContain("overflow: hidden");
  });

  test("centers the translate action with symmetric vertical padding", () => {
    const footerRule = POPUP_STYLES.match(
      /\.kt-popup-translation-input__footer\s*\{([^}]*)\}/
    )?.[1];

    expect(footerRule).toContain("align-items: center");
    expect(footerRule).toContain("padding: 7px 10px 7px 15px");
  });

  test("wraps scene labels and long translation output", () => {
    const sceneLabelRule = POPUP_STYLES.match(
      /\.kt-popup-scene__label\s*\{([^}]*)\}/
    )?.[1];
    const resultBodyRule = POPUP_STYLES.match(
      /\.kt-popup-translation-result__body\s*\{([^}]*)\}/
    )?.[1];

    expect(sceneLabelRule).toContain("white-space: normal");
    expect(sceneLabelRule).toContain("overflow-wrap: anywhere");
    expect(sceneLabelRule).not.toContain("text-overflow: ellipsis");
    expect(resultBodyRule).toContain("overflow-wrap: anywhere");
    expect(resultBodyRule).toContain("word-break: break-word");
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
});
