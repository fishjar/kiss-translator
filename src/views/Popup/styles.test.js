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
});
