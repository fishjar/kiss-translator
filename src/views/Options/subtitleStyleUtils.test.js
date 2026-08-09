import {
  colorToHex,
  getCssLengthSliderRange,
  objectToCss,
  parseCssColor,
  parseCssToObject,
  parseFontSize,
  parseLineHeight,
  parsePadding,
  patchCssProperty,
  resolveEditableBackgroundRgba,
  resolveBackgroundRgba,
  serializeFontSize,
} from "./subtitleStyleUtils";

describe("subtitleStyleUtils", () => {
  test("preserves semicolons and colons inside CSS function values", () => {
    const css =
      'background-image: url("data:image/svg+xml;utf8,<svg></svg>"); color: red;';

    expect(parseCssToObject(css)).toEqual({
      "background-image": 'url("data:image/svg+xml;utf8,<svg></svg>")',
      color: "red",
    });
  });

  test("serializes editable declarations without dropping values", () => {
    expect(
      objectToCss({
        "background-color": "rgba(10, 12, 16, 0.62)",
        "background-image": "linear-gradient(#000, transparent)",
      })
    ).toContain("background-image: linear-gradient(#000, transparent)");
  });

  test("patches only the last matching declaration without rewriting source", () => {
    const source = [
      "/* keep: this comment; exactly */",
      "color: red;",
      "color : blue /* keep the priority note */ !important;",
      "@future syntax(foo: bar) { nested: value; };",
      '--raw-token: {"key":"value;still"};',
    ].join("\n");

    expect(patchCssProperty(source, "color", "#123456")).toBe(
      [
        "/* keep: this comment; exactly */",
        "color: red;",
        "color : #123456 /* keep the priority note */ !important;",
        "@future syntax(foo: bar) { nested: value; };",
        '--raw-token: {"key":"value;still"};',
      ].join("\n")
    );
  });

  test("appends a missing property without normalizing unknown syntax", () => {
    const source = "color: red;\nunknown ???;\n/* untouched */";

    expect(patchCssProperty(source, "font-size", "18px")).toBe(
      `${source}\nfont-size: 18px;`
    );
  });

  test("removes matching declarations while preserving surrounding source", () => {
    const source = [
      "/* first */ text-shadow: 1px 1px black;",
      "color: red;",
      "/* second */ text-shadow: 2px 2px black;",
      "unknown ???;",
    ].join("\n");

    expect(patchCssProperty(source, "text-shadow", "")).toBe(
      ["/* first */ ", "color: red;", "/* second */ ", "unknown ???;"].join(
        "\n"
      )
    );
  });

  test("preserves declaration comments when removing a property", () => {
    const source = [
      'content: "/* not a comment */";',
      "text-shadow: 1px 1px black /* keep this reason */;",
      "color: red;",
    ].join("\n");

    expect(patchCssProperty(source, "text-shadow", "")).toBe(
      [
        'content: "/* not a comment */";',
        "/* keep this reason */",
        "color: red;",
      ].join("\n")
    );
  });

  test("reads both the canonical color and legacy background shorthand", () => {
    expect(
      resolveBackgroundRgba({
        "background-color": "rgba(10, 12, 16, 0.62)",
      })
    ).toEqual({ r: 10, g: 12, b: 16, a: 0.62 });
    expect(resolveBackgroundRgba({ background: "rgba(1, 2, 3, 0.4)" })).toEqual(
      { r: 1, g: 2, b: 3, a: 0.4 }
    );
  });

  test("parses short, long, and alpha hex colors without using a fallback", () => {
    expect(parseCssColor("#1aF")).toEqual({ r: 17, g: 170, b: 255, a: 1 });
    expect(resolveBackgroundRgba({ "background-color": "#123456" })).toEqual({
      r: 18,
      g: 52,
      b: 86,
      a: 1,
    });
    expect(parseCssColor("#11223380")).toEqual({
      r: 17,
      g: 34,
      b: 51,
      a: 128 / 255,
    });
    expect(colorToHex("#abc")).toBe("#aabbcc");
  });

  test("rejects colors that cannot be safely round-tripped by color controls", () => {
    expect(parseCssColor("var(--caption-color)")).toBeNull();
    expect(parseCssColor("rebeccapurple")).toBeNull();
    expect(
      resolveEditableBackgroundRgba({
        "background-color": "var(--caption-background)",
      })
    ).toBeNull();
    expect(
      resolveEditableBackgroundRgba({
        background: "linear-gradient(#000, transparent)",
      })
    ).toBeNull();
  });

  test("edits simple font sizes without converting their unit or syntax", () => {
    const fontSize = parseFontSize("24px");

    expect(fontSize).toMatchObject({
      preferred: 24,
      preferredUnit: "px",
      kind: "simple",
      isEditable: true,
    });
    expect(getCssLengthSliderRange(24, "px")).toEqual({
      min: 0,
      max: 64,
      step: 1,
    });
    expect(serializeFontSize(fontSize, 28)).toBe("28px");
  });

  test("preserves every clamp unit when editing its preferred size", () => {
    const fontSize = parseFontSize("clamp(16px, 2cqw, 20px)");

    expect(serializeFontSize(fontSize, 2.4)).toBe("clamp(16px, 2.4cqw, 20px)");
  });

  test("marks unsupported font sizes and line heights as non-editable", () => {
    expect(parseFontSize("var(--caption-size)").isEditable).toBe(false);
    expect(parseFontSize("large").isEditable).toBe(false);
    expect(parseLineHeight("var(--caption-line-height)").isEditable).toBe(
      false
    );
    expect(parseLineHeight("normal").isEditable).toBe(false);
  });

  test("uses a pixel-aware range for the default two-value padding", () => {
    const padding = parsePadding("12px 20px");

    expect(padding).toEqual({
      vertical: 12,
      horizontal: 20,
      unit: "px",
      isEditable: true,
    });
    expect(getCssLengthSliderRange(padding.vertical, padding.unit).max).toBe(
      64
    );
    expect(getCssLengthSliderRange(padding.horizontal, padding.unit).max).toBe(
      64
    );
  });

  test("marks variable, keyword, mixed-unit, and complex padding as non-editable", () => {
    [
      "var(--caption-padding)",
      "inherit",
      "12px 1rem",
      "1px 2px 3px",
      "calc(1rem + 2px)",
    ].forEach((padding) => {
      expect(parsePadding(padding).isEditable).toBe(false);
    });
  });
});
