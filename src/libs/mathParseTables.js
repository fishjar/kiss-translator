/**
 * @file mathParseTables.js
 * @description Unicode lookup tables used by `mathParse.js` to render inline
 * LaTeX as plain text. Symbol mappings are derived from KaTeX `src/symbols.js`
 * (MIT licensed); only the subset that has a meaningful plain-text Unicode
 * form is kept. Table data only — no logic lives here.
 */

/**
 * Greek letters, keyed by command name without the leading backslash.
 * @type {Record<string, string>}
 */
export const GREEK = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ϵ",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  varkappa: "ϰ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  phi: "ϕ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};

/**
 * Operators, relations, arrows and miscellaneous symbols.
 * Angle-bracket producing commands (`\lt`, `\gt`) are deliberately absent:
 * the converter must never introduce `<` or `>` into its output.
 * @type {Record<string, string>}
 */
export const SYMBOLS = {
  // binary operators
  times: "×",
  cdot: "·",
  cdotp: "·",
  div: "÷",
  pm: "±",
  mp: "∓",
  ast: "∗",
  star: "⋆",
  circ: "∘",
  bullet: "∙",
  oplus: "⊕",
  ominus: "⊖",
  otimes: "⊗",
  oslash: "⊘",
  odot: "⊙",
  wedge: "∧",
  land: "∧",
  vee: "∨",
  lor: "∨",
  neg: "¬",
  lnot: "¬",
  setminus: "∖",
  // relations
  le: "≤",
  leq: "≤",
  leqslant: "≤",
  ge: "≥",
  geq: "≥",
  geqslant: "≥",
  ne: "≠",
  neq: "≠",
  ll: "≪",
  gg: "≫",
  approx: "≈",
  equiv: "≡",
  cong: "≅",
  simeq: "≃",
  sim: "∼",
  propto: "∝",
  doteq: "≐",
  asymp: "≍",
  therefore: "∴",
  because: "∵",
  models: "⊨",
  vdash: "⊢",
  top: "⊤",
  bot: "⊥",
  perp: "⊥",
  parallel: "∥",
  nparallel: "∦",
  angle: "∠",
  // set theory / logic
  in: "∈",
  notin: "∉",
  ni: "∋",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  varnothing: "∅",
  forall: "∀",
  exists: "∃",
  nexists: "∄",
  // large operators
  sum: "∑",
  prod: "∏",
  coprod: "∐",
  int: "∫",
  iint: "∬",
  iiint: "∭",
  oint: "∮",
  bigcup: "⋃",
  bigcap: "⋂",
  // arrows
  to: "→",
  rightarrow: "→",
  Rightarrow: "⇒",
  leftarrow: "←",
  Leftarrow: "⇐",
  leftrightarrow: "↔",
  Leftrightarrow: "⇔",
  longrightarrow: "⟶",
  longleftarrow: "⟵",
  mapsto: "↦",
  uparrow: "↑",
  downarrow: "↓",
  implies: "⟹",
  iff: "⟺",
  // misc
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  hbar: "ℏ",
  ell: "ℓ",
  Re: "ℜ",
  Im: "ℑ",
  aleph: "ℵ",
  prime: "′",
  degree: "°",
  dagger: "†",
  cdots: "⋯",
  ldots: "…",
  dots: "…",
  dotsc: "…",
  vdots: "⋮",
  ddots: "⋱",
  // delimiters usable after \left and \right
  langle: "⟨",
  rangle: "⟩",
  lfloor: "⌊",
  rfloor: "⌋",
  lceil: "⌈",
  rceil: "⌉",
  lbrace: "{",
  rbrace: "}",
  lbrack: "[",
  rbrack: "]",
  vert: "|",
  Vert: "‖",
  lvert: "|",
  rvert: "|",
  lVert: "‖",
  rVert: "‖",
};

/**
 * Log-like function names rendered as their bare name (`\sin` → `sin`).
 * @type {Set<string>}
 */
export const FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "coth",
  "log",
  "ln",
  "lg",
  "exp",
  "lim",
  "limsup",
  "liminf",
  "max",
  "min",
  "sup",
  "inf",
  "det",
  "arg",
  "gcd",
  "deg",
  "dim",
  "ker",
  "hom",
  "Pr",
  "bmod",
]);

/**
 * Accent commands mapped to the Unicode combining mark applied to their
 * argument. NFC normalization afterwards composes them when possible.
 * @type {Record<string, string>}
 */
export const ACCENTS = {
  dot: "̇",
  ddot: "̈",
  hat: "̂",
  widehat: "̂",
  bar: "̄",
  overline: "̄",
  underline: "̲",
  vec: "⃗",
  overrightarrow: "⃗",
  tilde: "̃",
  widetilde: "̃",
  acute: "́",
  grave: "̀",
  breve: "̆",
  check: "̌",
  mathring: "̊",
};

/**
 * Spacing commands mapped to their plain-text replacement. Regular spaces are
 * used instead of exotic Unicode spaces, which many CJK subtitle fonts lack.
 * @type {Record<string, string>}
 */
export const SPACING = {
  ",": " ",
  ";": " ",
  ":": " ",
  "!": "",
  " ": " ",
  "\\": " ",
  quad: " ",
  qquad: "  ",
  thinspace: " ",
  enspace: " ",
  space: " ",
  newline: " ",
};

/**
 * Commands carrying no plain-text meaning; dropped without consuming an
 * argument.
 * @type {Set<string>}
 */
export const IGNORED = new Set([
  "displaystyle",
  "textstyle",
  "scriptstyle",
  "scriptscriptstyle",
  "limits",
  "nolimits",
  "notag",
  "nonumber",
  "bigl",
  "bigr",
  "Bigl",
  "Bigr",
  "biggl",
  "biggr",
  "Biggl",
  "Biggr",
  "big",
  "Big",
  "bigg",
  "Bigg",
  "mathstrut",
]);

/**
 * Commands that swallow one argument and render nothing. `\color{red}{x}` is
 * covered here: the color is dropped and `{x}` flows on as a normal group.
 * @type {Set<string>}
 */
export const DROP_ARG = new Set([
  "phantom",
  "hphantom",
  "vphantom",
  "label",
  "tag",
  "color",
  "textcolor",
]);

/**
 * Commands that swallow one argument and render a single space.
 * @type {Set<string>}
 */
export const SPACE_ARG = new Set(["hspace", "vspace"]);

/**
 * Commands whose argument is plain prose: rendered verbatim, spaces kept.
 * @type {Set<string>}
 */
export const TEXT_COMMANDS = new Set([
  "text",
  "textrm",
  "textnormal",
  "textit",
  "textbf",
  "textsf",
  "texttt",
  "mathrm",
  "mathnormal",
  "operatorname",
  "mbox",
]);

/**
 * Escaped literals (`\{` → `{`), keyed by the escaped character.
 * @type {Record<string, string>}
 */
export const ESCAPES = {
  "{": "{",
  "}": "}",
  $: "$",
  "%": "%",
  "&": "&",
  "#": "#",
  _: "_",
  "|": "‖",
  "-": "-",
};

/**
 * Superscript forms. A superscript is rendered with these only when every
 * character of the argument has a form; otherwise an explicit `^(…)` fallback
 * is emitted so nothing is silently dropped.
 * @type {Record<string, string>}
 */
export const SUPERSCRIPTS = {
  0: "⁰",
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  a: "ᵃ",
  b: "ᵇ",
  c: "ᶜ",
  d: "ᵈ",
  e: "ᵉ",
  f: "ᶠ",
  g: "ᵍ",
  h: "ʰ",
  i: "ⁱ",
  j: "ʲ",
  k: "ᵏ",
  l: "ˡ",
  m: "ᵐ",
  n: "ⁿ",
  o: "ᵒ",
  p: "ᵖ",
  r: "ʳ",
  s: "ˢ",
  t: "ᵗ",
  u: "ᵘ",
  v: "ᵛ",
  w: "ʷ",
  x: "ˣ",
  y: "ʸ",
  z: "ᶻ",
  A: "ᴬ",
  B: "ᴮ",
  D: "ᴰ",
  E: "ᴱ",
  G: "ᴳ",
  H: "ᴴ",
  I: "ᴵ",
  J: "ᴶ",
  K: "ᴷ",
  L: "ᴸ",
  M: "ᴹ",
  N: "ᴺ",
  O: "ᴼ",
  P: "ᴾ",
  R: "ᴿ",
  T: "ᵀ",
  U: "ᵁ",
  V: "ⱽ",
  W: "ᵂ",
  β: "ᵝ",
  γ: "ᵞ",
  δ: "ᵟ",
  θ: "ᶿ",
  φ: "ᵠ",
  ϕ: "ᵠ",
  χ: "ᵡ",
  "′": "′",
};

/**
 * Subscript forms, used under the same all-or-nothing rule as superscripts.
 * @type {Record<string, string>}
 */
export const SUBSCRIPTS = {
  0: "₀",
  1: "₁",
  2: "₂",
  3: "₃",
  4: "₄",
  5: "₅",
  6: "₆",
  7: "₇",
  8: "₈",
  9: "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
  β: "ᵦ",
  γ: "ᵧ",
  ρ: "ᵨ",
  φ: "ᵩ",
  ϕ: "ᵩ",
  χ: "ᵪ",
};

/**
 * Math Alphanumeric alphabets, keyed by font command. `upper`/`lower`/`digit`
 * are the code points of `A`/`a`/`0` in the target block; `exceptions` covers
 * the letters Unicode placed in the Letterlike Symbols block instead.
 * Bare letters are intentionally NOT mapped anywhere: math italic is missing
 * from most CJK subtitle fonts.
 * @type {Record<string, {upper: number, lower: number, digit?: number,
 *   exceptions?: Record<string, string>}>}
 */
export const FONTS = {
  mathbf: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  boldsymbol: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  mathit: {
    upper: 0x1d434,
    lower: 0x1d44e,
    exceptions: { h: "ℎ" },
  },
  mathbb: {
    upper: 0x1d538,
    lower: 0x1d552,
    digit: 0x1d7d8,
    exceptions: {
      C: "ℂ",
      H: "ℍ",
      N: "ℕ",
      P: "ℙ",
      Q: "ℚ",
      R: "ℝ",
      Z: "ℤ",
    },
  },
  mathcal: {
    upper: 0x1d49c,
    lower: 0x1d4b6,
    exceptions: {
      B: "ℬ",
      E: "ℰ",
      F: "ℱ",
      H: "ℋ",
      I: "ℐ",
      L: "ℒ",
      M: "ℳ",
      R: "ℛ",
      e: "ℯ",
      g: "ℊ",
      o: "ℴ",
    },
  },
  mathscr: {
    upper: 0x1d49c,
    lower: 0x1d4b6,
    exceptions: {
      B: "ℬ",
      E: "ℰ",
      F: "ℱ",
      H: "ℋ",
      I: "ℐ",
      L: "ℒ",
      M: "ℳ",
      R: "ℛ",
      e: "ℯ",
      g: "ℊ",
      o: "ℴ",
    },
  },
  mathfrak: {
    upper: 0x1d504,
    lower: 0x1d51e,
    exceptions: {
      C: "ℭ",
      H: "ℌ",
      I: "ℑ",
      R: "ℜ",
      Z: "ℨ",
    },
  },
  mathsf: { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 },
  mathtt: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
};
