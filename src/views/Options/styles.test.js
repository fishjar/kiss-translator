import { OPTIONS_STYLES } from "./styles";

describe("settings segmented controls", () => {
  test("keeps selected and focused states inside the segmented track", () => {
    const trackRule = OPTIONS_STYLES.match(
      /(?:^|\n)\.kt-settings-segmented\s*\{([^}]*)\}/
    )?.[1];
    const buttonRule = OPTIONS_STYLES.match(
      /\.kt-settings-segmented > button\s*\{([^}]*)\}/
    )?.[1];
    const fallbackFocusRule = OPTIONS_STYLES.match(
      /\.kt-settings-segmented > button:focus\s*\{([^}]*)\}/
    )?.[1];
    const enhancedFocusRule = OPTIONS_STYLES.match(
      /\.kt-settings-segmented > button:focus-visible\s*\{([^}]*)\}/
    )?.[1];
    const labelRule = OPTIONS_STYLES.match(
      /\.kt-settings-segmented__label\s*\{([^}]*)\}/
    )?.[1];

    expect(trackRule).toContain("overflow: hidden");
    expect(trackRule).toContain("padding: 3px");
    expect(trackRule).toContain("min-width: 260px");
    expect(trackRule).toContain("max-width: 100%");
    expect(buttonRule).toContain("min-height: 34px");
    expect(buttonRule).toContain("overflow: hidden");
    expect(labelRule).toContain("text-overflow: ellipsis");
    expect(labelRule).toContain("white-space: nowrap");
    expect(fallbackFocusRule).toContain("outline: none");
    expect(fallbackFocusRule).toContain(
      "box-shadow: inset 0 0 0 2px var(--kt-pri)"
    );
    expect(fallbackFocusRule).not.toContain("color-mix");
    expect(enhancedFocusRule).toContain("outline: none");
    expect(enhancedFocusRule).toContain("box-shadow: inset");
    expect(OPTIONS_STYLES).toContain("@supports selector(:focus-visible)");
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-page \.MuiSwitch-root\.MuiSwitch-sizeSmall \.MuiSwitch-switchBase\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/
    );
  });
});

describe("settings layout boundaries", () => {
  test("keeps layout grids flat and scopes prose list spacing", () => {
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-options-page \.MuiGrid-container\s*\{[^}]*border/
    );
    expect(OPTIONS_STYLES).not.toMatch(/\.kt-options-page ul/);
    expect(OPTIONS_STYLES).toMatch(/\.kt-about-markdown ul/);
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-card\s*\{[^}]*list-style:\s*none;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-overview-settings > \.MuiGrid-container\s*\{[^}]*border:\s*1px solid var\(--kt-linev\);[^}]*border-radius:\s*20px;/
    );

    const overviewGridRule = OPTIONS_STYLES.match(
      /\.kt-overview-settings > \.MuiGrid-container\s*\{([^}]*)\}/
    )?.[1];
    expect(overviewGridRule).toContain("width: 100%");
    expect(overviewGridRule).toContain("margin: 0");
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-options-page > \.MuiBox-root > \.MuiStack-root\s*\{[^}]*gap:/
    );

    const formControlLabelRule = OPTIONS_STYLES.match(
      /\.kt-options-page \.MuiFormControlLabel-root\s*\{([^}]*)\}/
    )?.[1];
    expect(formControlLabelRule).toContain("margin-inline: 0");
    expect(formControlLabelRule).not.toMatch(/(?:^|;)\s*margin:\s*0/);
    expect(formControlLabelRule).not.toContain("background");
    expect(formControlLabelRule).not.toContain("padding");
    expect(formControlLabelRule).not.toContain("border-radius");
  });

  test("owns advanced spacing outside the MUI accordion", () => {
    const shellRule = OPTIONS_STYLES.match(
      /\.kt-settings-advanced-shell\s*\{([^}]*)\}/
    )?.[1];
    const accordionRule = OPTIONS_STYLES.match(
      /\.kt-settings-advanced\.MuiAccordion-root,\s*\.kt-settings-advanced\.MuiAccordion-root\.Mui-expanded\s*\{([^}]*)\}/
    )?.[1];
    const contentRule = OPTIONS_STYLES.match(
      /\.kt-settings-advanced \.kt-settings-advanced__content\s*\{([^}]*)\}/
    )?.[1];

    expect(shellRule).toContain("margin-top: 18px");
    expect(accordionRule).toContain("margin: 0");
    expect(contentRule).not.toContain("!important");
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-about-details \.kt-settings-advanced \.kt-settings-advanced__content\s*\{[^}]*padding:\s*0;/
    );
  });

  test("uses the wider drawer breakpoint and container-driven narrow layout", () => {
    expect(OPTIONS_STYLES).toContain("@media (max-width: 1179px)");
    expect(OPTIONS_STYLES).toContain(
      "@container options-main (max-width: 620px)"
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-row--trigger \.kt-settings-segmented\s*\{[^}]*width:\s*100%;/
    );
  });

  test("lays out the Playground by its own available width", () => {
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground\s*\{[^}]*container:\s*playground \/ inline-size;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-config__grid\.MuiGrid-container\s*\{[^}]*repeat\(auto-fit, minmax\(230px, 1fr\)\)/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-translator\.MuiStack-root\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-translator__results\s*\{[^}]*grid-column:\s*2;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-translator__auxiliary\s*\{[^}]*grid-column:\s*1 \/ -1;/
    );
    expect(OPTIONS_STYLES).toContain(
      "@container playground (max-width: 760px)"
    );
  });
});
