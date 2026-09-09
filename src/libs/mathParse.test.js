import { convertLatexToUnicode, parseMathInText } from "./mathParse";

/** Inputs reused by the idempotence and safety sweeps at the bottom. */
const ALL_INPUTS = [
  "\\(\\frac{d\\mathbf r_1}{dt}\\) 是物體一的速度",
  "\\(\\dot{x}_1、\\dot{y}_1\\)",
  "\\(A^{T}\\)",
  "\\(x^\\infty\\)",
  "\\(\\frac{d^2x}{dt^2}\\)",
  "\\(\\sin\\theta\\)",
  "\\(\\sqrt{x}\\)",
  "\\(\\sqrt[3]{8}\\)",
  "\\(\\alpha\\beta\\pi\\)",
  "\\(x_1\\)",
  "\\(x^2\\)",
  "\\(x_{12}\\)",
  "\\(\\mathbb{R}\\)",
  "\\(\\vec{v}\\)",
  "\\(\\left( x \\right)\\)",
  "\\(\\sum_{i=1}^{n} i\\)",
  "\\[a + b\\]",
  "$$E = mc^2$$",
  "$x^2$",
  "costs $5 and $10",
  "$100",
  "The cost is $5 but $x^2$ is math",
  "速度 \\(v\\)，加速度 \\(a\\)",
  "\\(\\frac{a}{\\)",
  "\\(\\)",
  "\\(",
  "$",
  "$$ unclosed",
  "\\(\\foo{x}\\)",
  "\\(a < b\\)",
  "\\(\\$x\\)\\(\\$y\\)",
  "\\(\\$5\\)",
  "\\(\\&#60;b\\&#62;\\)",
  "costs $5\\n$10 total",
  "export $HOME$USER",
  "\\(O(n \\log n)\\)",
  "\\(\\left\\lVert x \\right\\rVert\\)",
  "$\\(x\\)$",
  "&\\(lt\\);",
  "\\(unclosed { text; \\(x_1\\)",
  "\\(\\begin{matrix}{a}&b\\end{matrix}{c}\\)",
  "\\(\\frac{a}{b}^2\\)",
  "\\(x^2_1\\)",
  "\\({x^2}^3\\)",
  "$\\alpha_12$",
  "&\\(lt\\); \\(&amp;\\)",
  "\\(\\constructor{x}\\)",
  "export $MY_VAR$OTHER",
  "export $my_var$OTHER",
  "&amp; &\\(lt\\);",
  "plain text without math",
  "C:\\temp\\file.txt",
  "line1\nline2 {a} 100%",
  "",
];

describe("parseMathInText — screenshot cases", () => {
  test("renders the fraction from the reported subtitle", () => {
    const out = parseMathInText(
      "\\(\\frac{d\\mathbf r_1}{dt}\\) 是物體一的速度"
    );
    expect(out).toBe("d\u{1D42B}\u2081/dt 是物體一的速度");
    expect(out).not.toContain("\\frac");
    expect(out).not.toContain("\\(");
    expect(out).not.toContain("{");
  });

  test("renders dotted variables with subscripts", () => {
    expect(parseMathInText("\\(\\dot{x}_1、\\dot{y}_1\\)")).toBe(
      "\u1e8b\u2081、\u1e8f\u2081"
    );
  });
});

describe("parseMathInText — cases other converters get wrong", () => {
  test.each([
    ["\\(A^{T}\\)", "A\u1d40"],
    ["\\(x^\\infty\\)", "x^(∞)"],
    ["\\(\\frac{d^2x}{dt^2}\\)", "(d²x)/(dt²)"],
    ["\\(\\sin\\theta\\)", "sinθ"],
    ["\\(\\sqrt{x}\\)", "√x"],
    ["\\(\\sqrt[3]{8}\\)", "³√8"],
  ])("converts %s to %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test("never silently drops a superscript it cannot render", () => {
    expect(parseMathInText("\\(x^\\infty\\)")).not.toBe("x");
    expect(parseMathInText("\\(x^\\infty\\)")).toContain("∞");
  });

  test("leaks no braces or backslashes from converted segments", () => {
    const out = parseMathInText("\\(\\sqrt{x} + \\frac{1}{2}\\)");
    expect(out).toBe("√x+1/2");
  });

  test("emits NFC composed accents", () => {
    expect(parseMathInText("\\(\\dot{x}\\)")).toBe("\u1e8b");
    expect(parseMathInText("\\(\\hat{a}\\)")).toBe("\u00e2");
    expect(parseMathInText("\\(\\dot{x}\\)")).toHaveLength(1);
  });
});

describe("parseMathInText — delimiters", () => {
  test.each([
    ["\\(a + b\\)", "a+b"],
    ["\\[a + b\\]", "a+b"],
    ["$$E = mc^2$$", "E=mc²"],
    ["$x^2$", "x²"],
  ])("handles the %s form", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test("converts several segments in one string", () => {
    expect(parseMathInText("速度 \\(v\\)，加速度 \\(a\\)")).toBe(
      "速度 v，加速度 a"
    );
  });

  test("keeps surrounding CJK and English intact", () => {
    expect(
      parseMathInText(
        "The energy $$E = mc^2$$ 是質能等價，where \\(c\\) 是光速"
      )
    ).toBe("The energy E=mc² 是質能等價，where c 是光速");
  });
});

describe("parseMathInText — currency must not trigger", () => {
  test.each([
    "costs $5 and $10",
    "$100",
    "It is $5, $10 or $20 per item",
    "Total: $1,234.56",
    "He paid \\$5 and \\$9 today",
  ])("leaves %s untouched", (input) => {
    expect(parseMathInText(input)).toBe(input);
  });

  test("still converts real math next to a dollar amount", () => {
    expect(parseMathInText("The cost is $5 but $x^2$ is math")).toBe(
      "The cost is $5 but x² is math"
    );
  });
});

describe("parseMathInText — coverage set", () => {
  test.each([
    ["\\(\\alpha\\beta\\pi\\)", "αβπ"],
    ["\\(\\Gamma\\Delta\\Omega\\)", "ΓΔΩ"],
    ["\\(\\varepsilon\\varphi\\vartheta\\)", "εφϑ"],
    ["\\(x_1\\)", "x₁"],
    ["\\(x^2\\)", "x²"],
    ["\\(x_{12}\\)", "x₁₂"],
    ["\\(\\mathbf{r}\\)", "\u{1D42B}"],
    ["\\(\\mathbb{R}\\)", "ℝ"],
    ["\\(\\mathcal{L}\\)", "ℒ"],
    ["\\(\\mathfrak{g}\\)", "\u{1D524}"],
    ["\\(\\mathrm{d}x\\)", "dx"],
    ["\\(\\text{if } x\\)", "if x"],
    ["\\(\\vec{v}\\)", "v\u20d7"],
    ["\\(\\bar{y}\\)", "\u0233"],
    ["\\(\\tilde{n}\\)", "\u00f1"],
    ["\\(\\ddot{u}\\)", "\u00fc"],
    ["\\(a \\times b \\cdot c\\)", "a×b·c"],
    ["\\(a \\le b \\ge c \\ne d\\)", "a≤b≥c≠d"],
    ["\\(\\pm\\mp\\approx\\equiv\\propto\\)", "±∓≈≡∝"],
    ["\\(\\infty\\partial\\nabla\\hbar\\)", "∞∂∇ℏ"],
    ["\\(\\sum\\prod\\int\\oint\\)", "∑∏∫∮"],
    ["\\(a \\to b \\Rightarrow c \\mapsto d\\)", "a→b⇒c↦d"],
    ["\\(x \\in A \\cup B\\)", "x∈A∪B"],
    ["\\(\\forall x \\exists y\\)", "∀x∃y"],
    ["\\(\\langle a, b \\rangle\\)", "⟨a,b⟩"],
    ["\\(\\cos x + \\log y - \\ln z\\)", "cos x+log y-ln z"],
    ["\\(\\lim x\\)", "lim x"],
    ["\\(\\sum_{i=1}^{n} i\\)", "∑ᵢ₌₁ⁿi"],
  ])("converts %s to %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test.each([
    ["\\(\\left( x \\right)\\)", "(x)"],
    ["\\(\\left\\{ x \\right\\}\\)", "{x}"],
    ["\\(\\left( x \\right.\\)", "(x"],
  ])("drops \\left/\\right around %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test.each([
    ["\\(a\\,b\\)", "a b"],
    ["\\(a\\;b\\)", "a b"],
    ["\\(a\\!b\\)", "ab"],
    ["\\(a\\quad b\\)", "a b"],
    ["\\(a \\\\ b\\)", "a b"],
    ["\\(a & b\\)", "a b"],
    ["\\(a~b\\)", "a b"],
  ])("renders the spacing in %s as %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test("keeps the name of an unknown command", () => {
    expect(parseMathInText("\\(\\foo{x}\\)")).toBe("foox");
  });

  test("unwraps plain groups", () => {
    expect(parseMathInText("\\({{a}}\\)")).toBe("a");
  });

  test("parenthesizes compound fraction sides only", () => {
    expect(parseMathInText("\\(\\frac{1}{2}\\)")).toBe("1/2");
    expect(parseMathInText("\\(\\frac{a+b}{c}\\)")).toBe("(a+b)/c");
    expect(parseMathInText("\\(\\frac{(a+b)}{c}\\)")).toBe("(a+b)/c");
  });

  test("treats a subscript fallback as compound, like the superscript twin", () => {
    expect(parseMathInText("\\(\\frac{x_{\\infty}}{y}\\)")).toBe("(x_(∞))/y");
    expect(parseMathInText("\\(\\frac{x^{\\infty}}{y}\\)")).toBe("(x^(∞))/y");
  });
});

describe("parseMathInText — fail safe", () => {
  test.each([
    "\\(\\frac{a}{\\)",
    "\\(\\)",
    "\\(   \\)",
    "\\(",
    "\\)",
    "$",
    "$$ unclosed",
    "\\(\\frac{a}{b\\)",
    "\\(}{\\)",
    "\\(\\frac\\)",
    "\\(x_\\)",
  ])("returns %p verbatim", (input) => {
    expect(parseMathInText(input)).toBe(input);
  });

  test("survives deep nesting", () => {
    const input = `\\(${"{".repeat(60)}x${"}".repeat(60)}\\)`;
    expect(parseMathInText(input)).toBe("x");
  });

  test.each([
    null,
    undefined,
    "",
    123,
    {},
    [],
    "\\(\\\\\\)",
    "$$$$",
    "\\(\\(\\)\\)",
    "\\({\\)}",
    "\\(\\sqrt[\\)",
  ])("never throws on %p", (input) => {
    expect(() => parseMathInText(input)).not.toThrow();
  });

  test("returns non-strings unchanged", () => {
    expect(parseMathInText(null)).toBe(null);
    expect(parseMathInText(undefined)).toBe(undefined);
    expect(parseMathInText("")).toBe("");
  });

  test("reports an unconvertible segment as null", () => {
    expect(convertLatexToUnicode("\\frac{a}")).toBe(null);
    expect(convertLatexToUnicode("")).toBe(null);
    expect(convertLatexToUnicode("x^2")).toBe("x²");
  });
});

describe("parseMathInText — bare dollar heuristic", () => {
  test.each([
    "costs $5\\n$10 total",
    "use $\\d+$ pattern",
    "open $C:\\temp$ now",
    "export $HOME$USER",
    "$true$ or $false$",
    "$Q4$ revenue",
    "run $make$ first",
    "$PATH$ and $HOME$",
    "export $MY_VAR$OTHER",
    "export $my_var$OTHER",
    "$5元=$35元",
    "总价 $12=$15 元",
    "$5USD=$35USD",
    "price $12EUR$ today",
  ])("rejects %p as math", (input) => {
    expect(parseMathInText(input)).toBe(input);
  });

  test.each([
    ["$x$", "x"],
    ["$x^2$", "x²"],
    ["$\\alpha$", "α"],
    ["$a=b$", "a=b"],
    ["$x_1$", "x₁"],
    ["$x_12$", "x₁2"],
    ["$x_{12}$", "x₁₂"],
    ["$2x=4$", "2x=4"],
    ["$\\alpha_12$", "α₁2"],
    ["$\\alpha_1$", "α₁"],
    ["$a\\times b$", "a×b"],
  ])("still converts %p to %p", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });
});

describe("parseMathInText — input size and scan cost", () => {
  test("returns an over-long input untouched", () => {
    const input = "see \\(x_1 and ".repeat(1000);
    expect(input.length).toBeGreaterThan(10000);
    expect(parseMathInText(input)).toBe(input);
  });

  test("stays fast on many unclosed openers", () => {
    const input = "see \\(x_1 and ".repeat(600);
    expect(input.length).toBeLessThan(10000);
    const started = Date.now();
    expect(parseMathInText(input)).toBe(input);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("parseMathInText — segment guards", () => {
  test.each([
    "\\(\\$x\\)",
    "\\(\\$x\\)\\(\\$y\\)",
    "\\(\\$5\\)",
    "\\(\\&#60;b\\&#62;\\)",
    "\\(\\&amp;\\)",
    "&\\(lt\\);",
    "&\\(#60\\);",
    "&amp; &\\(lt\\);",
    "&lt; and &\\(gt\\);",
    "&\\(lt\\); \\(&\\)",
    "&\\(lt\\); \\(&amp;\\)",
  ])("keeps %p verbatim rather than re-forming a delimiter or entity", (i) => {
    expect(parseMathInText(i)).toBe(i);
  });

  test("still converts a plain escaped ampersand", () => {
    expect(parseMathInText("\\(a\\&b\\)")).toBe("a&b");
  });

  test("converts next to an entity the input already spelled out", () => {
    expect(parseMathInText("&amp; \\(x_1\\)")).toBe("&amp; x₁");
  });
});

describe("parseMathInText — structural commands", () => {
  test.each([
    ["\\[\\begin{array}{cc} a & b \\end{array}\\]", "a b"],
    ["\\(\\begin{bmatrix} a \\end{bmatrix}\\)", "a"],
    ["\\(\\color{red}{x}\\)", "x"],
    ["\\(\\textcolor{red}{x}\\)", "x"],
    ["\\(\\overbrace{a+b}^{n}\\)", "(a+b)ⁿ"],
    ["\\(\\underbrace{a+b}\\)", "a+b"],
    ["\\(\\overset{a}{b}\\)", "bᵃ"],
    ["\\(\\underset{a}{b}\\)", "bₐ"],
    ["\\(\\substack{a\\\\b}\\)", "a b"],
    ["\\(a \\hspace{2em} b\\)", "a b"],
    ["\\(\\left\\lVert x \\right\\rVert\\)", "‖x‖"],
    ["\\(\\left\\lvert x \\right\\rvert\\)", "|x|"],
    ["\\(\\left\\lceil x \\right\\rceil\\)", "⌈x⌉"],
  ])("converts %s to %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test("never deletes an unknown \\left delimiter", () => {
    expect(parseMathInText("\\(\\left\\weird x \\right\\weird\\)")).toBe(
      "weirdxweird"
    );
  });
});

describe("parseMathInText — spacing around function names", () => {
  test.each([
    ["\\(\\sin\\theta\\)", "sinθ"],
    ["\\(\\sin x\\)", "sin x"],
    ["\\(O(n \\log n)\\)", "O(n log n)"],
    ["\\(\\log(x)\\)", "log(x)"],
    ["\\(\\sin^2 x\\)", "sin²x"],
  ])("converts %s to %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });
});

describe("parseMathInText — environments and precedence", () => {
  test.each([
    ["\\(\\begin{matrix}{a}&b\\end{matrix}{c}\\)", "a b c"],
    ["\\[\\begin{array}{cc} a & b \\end{array}\\]", "a b"],
    ["\\(\\begin{aligned} x \\end{aligned}{y}\\)", "x y"],
  ])("keeps environment content in %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test.each([
    ["\\(\\frac{a}{b}^2\\)", "(a/b)²"],
    ["\\(\\frac{a}{b}_1\\)", "(a/b)₁"],
    ["\\(x^2\\)", "x²"],
    ["\\(x^2_1\\)", "x²₁"],
    ["\\(x_1^2\\)", "x₁²"],
    ["\\({x^2}^3\\)", "(x²)³"],
    ["\\({x_1}_2\\)", "(x₁)₂"],
    ["\\({x}^2\\)", "x²"],
    ["\\(x^\\infty_1\\)", "x^(∞)₁"],
    ["\\(\\dot{x}_1\\)", "ẋ₁"],
    ["\\(\\sum_{i=1}^{n}\\)", "∑ᵢ₌₁ⁿ"],
  ])("binds the script in %s as %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test.each([
    ["\\(\\frac{1}{a\\cdot b}\\)", "1/(a·b)"],
    ["\\(\\frac{1}{a\\circ b}\\)", "1/(a∘b)"],
    ["\\(\\frac{1}{a\\oplus b}\\)", "1/(a⊕b)"],
  ])("treats the Unicode operator in %s as compound", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });
});

describe("parseMathInText — prototype pollution", () => {
  test.each([
    ["\\(\\constructor{x}\\)", "constructorx"],
    ["\\(\\hasOwnProperty{x}\\)", "hasOwnPropertyx"],
    ["\\(\\toString\\)", "toString"],
    ["\\(\\valueOf{x}\\)", "valueOfx"],
  ])("falls back to the bare name for %s", (input, expected) => {
    expect(parseMathInText(input)).toBe(expected);
  });

  test.each(["$\\constructor$", "$\\hasOwnProperty$", "$\\toString$"])(
    "rejects %p as bare-dollar math",
    (input) => {
      expect(parseMathInText(input)).toBe(input);
    }
  );
});

describe("parseMathInText — scan resilience", () => {
  test("converts a later segment when an earlier closer is brace-hidden", () => {
    expect(parseMathInText("\\(unclosed { text; \\(x_1\\)")).toBe(
      "\\(unclosed { text; x₁"
    );
  });

  test("keeps skipping a delimiter kind whose closer is truly absent", () => {
    const input = "see \\(x_1 and \\(y_2 too";
    expect(parseMathInText(input)).toBe(input);
  });
});

describe("parseMathInText — idempotence backstop", () => {
  test.each(["$\\(x\\)$", "$\\(a\\)$ and $\\(b\\)$"])(
    "returns %p verbatim rather than a result a second pass would change",
    (input) => {
      expect(parseMathInText(input)).toBe(input);
    }
  );

  test("still converts when the result is already a fixed point", () => {
    expect(parseMathInText("\\(x_1\\)")).toBe("x₁");
  });
});

describe("parseMathInText — invariants", () => {
  test.each(ALL_INPUTS)("is idempotent for %p", (input) => {
    const once = parseMathInText(input);
    expect(parseMathInText(once)).toBe(once);
  });

  test.each(ALL_INPUTS)("introduces no angle brackets for %p", (input) => {
    const out = parseMathInText(input);
    if (!/[<>]/.test(input)) {
      expect(/[<>]/.test(out)).toBe(false);
    }
  });

  test("keeps angle brackets that came from the input", () => {
    expect(parseMathInText("\\(a < b\\)")).toBe("a<b");
  });

  test.each([
    "plain text without math",
    "没有任何数学公式的普通译文。",
    "C:\\temp\\file.txt",
    "line1\nline2 {a} 100%",
    "a backslash \\ and a brace } alone",
  ])("passes %p through unchanged", (input) => {
    expect(parseMathInText(input)).toBe(input);
  });
});
