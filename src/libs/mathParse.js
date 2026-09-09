/**
 * @file mathParse.js
 * @description Render the inline LaTeX that AI translation engines emit
 * (`\(\frac{d\mathbf r_1}{dt}\)`) as readable plain Unicode text, for the
 * plain-text display surfaces (subtitle overlay, selection popup, input
 * translate, hover bubble) that would otherwise show the raw markup.
 *
 * Zero dependencies. The delimiter scanner is a reimplementation of the logic
 * in KaTeX `contrib/auto-render/splitAtDelimiters.ts` (MIT); the symbol tables
 * in `./mathParseTables` are derived from KaTeX `src/symbols.js` (MIT).
 *
 * Contract: pure, idempotent, never throws. Anything that cannot be converted
 * structurally is returned verbatim, delimiters included — a degraded result
 * is the original text, never half-converted output. The result never
 * contains `<` or `>` unless the input did (it crosses DOMPurify).
 */

import {
  ACCENTS,
  DROP_ARG,
  ESCAPES,
  FONTS,
  FUNCTIONS,
  GREEK,
  IGNORED,
  SPACING,
  SUBSCRIPTS,
  SUPERSCRIPTS,
  SYMBOLS,
  TEXT_COMMANDS,
} from "./mathParseTables";

/** Longest content accepted between bare `$...$` delimiters. */
const MAX_INLINE_DOLLAR_LEN = 80;

/**
 * Supported math delimiters, longest-first so `$$` wins over `$`.
 * `bare` marks the heuristic-guarded single dollar form.
 */
const DELIMITERS = [
  { left: "\\(", right: "\\)", bare: false },
  { left: "\\[", right: "\\]", bare: false },
  { left: "$$", right: "$$", bare: false },
  { left: "$", right: "$", bare: true },
];

/** Characters that make a fraction side or radicand read as compound. */
const COMPOUND_RE = /[\s/+*×÷±∓=<>≤≥≠≈-]/;

/** Superscript characters, used to detect compound fraction sides. */
const SUPERSCRIPT_CHARS = new Set(Object.values(SUPERSCRIPTS));

/** Signals a math segment that cannot be converted structurally. */
class MathParseError extends Error {}

/**
 * Split a math segment into tokens: commands, whitespace runs and characters.
 *
 * @param {string} src Raw LaTeX source of one math segment.
 * @returns {Array<{type: string, value: string}>} Token list.
 */
const tokenize = (src) => {
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const char = src[i];

    if (char === "\\") {
      const word = /^[a-zA-Z]+/.exec(src.slice(i + 1));
      if (word) {
        tokens.push({ type: "cmd", value: word[0] });
        i += 1 + word[0].length;
      } else if (i + 1 < src.length) {
        tokens.push({ type: "cmd", value: src[i + 1] });
        i += 2;
      } else {
        throw new MathParseError("trailing backslash");
      }
      continue;
    }

    if (/\s/.test(char)) {
      let end = i + 1;
      while (end < src.length && /\s/.test(src[end])) {
        end += 1;
      }
      tokens.push({ type: "space", value: " " });
      i = end;
      continue;
    }

    tokens.push({ type: "char", value: char });
    i += 1;
  }

  return tokens;
};

/**
 * Skip over whitespace tokens.
 *
 * @param {Object} state Parser state.
 * @returns {void}
 */
const skipSpaces = (state) => {
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "space"
  ) {
    state.pos += 1;
  }
};

/**
 * Map a string through one of the Math Alphanumeric blocks.
 *
 * @param {string} str Converted argument of a font command.
 * @param {Object} font Font spec from `FONTS`.
 * @returns {string} Styled text; unsupported characters pass through.
 */
const mapAlphabet = (str, font) =>
  Array.from(str)
    .map((char) => {
      const exception = font.exceptions?.[char];
      if (exception) return exception;
      if (char >= "A" && char <= "Z") {
        return String.fromCodePoint(font.upper + char.charCodeAt(0) - 65);
      }
      if (char >= "a" && char <= "z") {
        return String.fromCodePoint(font.lower + char.charCodeAt(0) - 97);
      }
      if (font.digit && char >= "0" && char <= "9") {
        return String.fromCodePoint(font.digit + char.charCodeAt(0) - 48);
      }
      return char;
    })
    .join("");

/**
 * Render a sub/superscript argument, falling back to an explicit `^(…)` or
 * `_(…)` form when any character lacks a Unicode script form. Never drops.
 *
 * @param {string} arg Converted script argument.
 * @param {boolean} isSup True for superscript, false for subscript.
 * @returns {string} Script text.
 */
const toScript = (arg, isSup) => {
  if (!arg) return "";

  const table = isSup ? SUPERSCRIPTS : SUBSCRIPTS;
  const mapped = [];
  for (const char of Array.from(arg)) {
    if (!table[char]) return `${isSup ? "^" : "_"}(${arg})`;
    mapped.push(table[char]);
  }

  return mapped.join("");
};

/**
 * Apply a combining accent mark to the first character of an argument.
 *
 * @param {string} arg Converted accent argument.
 * @param {string} mark Combining mark.
 * @returns {string} Accented text, NFC composed where a precomposed form
 *   exists.
 */
const applyAccent = (arg, mark) => {
  if (!arg) return mark;
  const chars = Array.from(arg);
  return `${chars[0]}${mark}${chars.slice(1).join("")}`.normalize("NFC");
};

/**
 * Whether a string is already wrapped in one matching pair of parentheses.
 *
 * @param {string} str Converted text.
 * @returns {boolean} True when adding parentheses would only duplicate them.
 */
const isWrapped = (str) => {
  if (str.length < 2 || str[0] !== "(" || str[str.length - 1] !== ")") {
    return false;
  }

  let depth = 0;
  for (let i = 0; i < str.length; i += 1) {
    if (str[i] === "(") depth += 1;
    else if (str[i] === ")") depth -= 1;
    if (depth === 0 && i < str.length - 1) return false;
  }

  return depth === 0;
};

/**
 * Parenthesize a fraction side or radicand unless it reads as a single atom.
 * Superscripts count as compound (`\frac{d^2x}{dt^2}` → `(d²x)/(dt²)`) while
 * subscripts do not (`\frac{d\mathbf r_1}{dt}` → `d𝐫₁/dt`).
 *
 * @param {string} str Converted side.
 * @returns {string} Side, parenthesized when needed.
 */
const wrapCompound = (str) => {
  if (str.length < 2 || isWrapped(str)) return str;

  const compound =
    COMPOUND_RE.test(str) ||
    str.includes("^(") ||
    Array.from(str).some((char) => SUPERSCRIPT_CHARS.has(char));

  return compound ? `(${str})` : str;
};

/**
 * Read one command argument: a braced group, or the next single token.
 *
 * @param {Object} state Parser state.
 * @returns {string} Converted argument.
 */
const readArgument = (state) => {
  skipSpaces(state);
  const token = state.tokens[state.pos];
  if (!token) throw new MathParseError("missing argument");

  if (token.type === "char") {
    if (token.value === "}") throw new MathParseError("unexpected brace");
    if (token.value === "{") {
      state.pos += 1;
      return parseList(state, true).join("");
    }
  }

  return parseAtom(state);
};

/**
 * Read the delimiter that follows `\left` or `\right`; `.` means none.
 *
 * @param {Object} state Parser state.
 * @returns {string} Delimiter character, possibly empty.
 */
const readDelimiter = (state) => {
  skipSpaces(state);
  const token = state.tokens[state.pos];
  if (!token) throw new MathParseError("missing delimiter");
  state.pos += 1;

  if (token.type === "char") {
    return token.value === "." ? "" : token.value;
  }

  return ESCAPES[token.value] ?? SYMBOLS[token.value] ?? "";
};

/**
 * Convert `\sqrt{x}` and `\sqrt[n]{x}`.
 *
 * @param {Object} state Parser state.
 * @returns {string} Converted radical.
 */
const parseSqrt = (state) => {
  skipSpaces(state);
  let index = "";

  const token = state.tokens[state.pos];
  if (token && token.type === "char" && token.value === "[") {
    state.pos += 1;
    const parts = [];
    let closed = false;
    while (state.pos < state.tokens.length) {
      const next = state.tokens[state.pos];
      if (next.type === "char" && next.value === "]") {
        state.pos += 1;
        closed = true;
        break;
      }
      parts.push(parseAtom(state));
    }
    if (!closed) throw new MathParseError("unclosed radical index");
    const raw = parts.join("");
    const scripted = toScript(raw, true);
    // Keep the index readable even without a superscript form: `3√x`.
    index = scripted.startsWith("^") ? raw : scripted;
  }

  return `${index}√${wrapCompound(readArgument(state))}`;
};

/**
 * Convert one command token together with the arguments it consumes.
 *
 * @param {Object} state Parser state.
 * @returns {string} Converted text.
 */
const parseCommand = (state) => {
  const name = state.tokens[state.pos].value;
  state.pos += 1;

  if (name === "frac" || name === "dfrac" || name === "tfrac") {
    const numerator = readArgument(state);
    const denominator = readArgument(state);
    return `${wrapCompound(numerator)}/${wrapCompound(denominator)}`;
  }

  if (name === "sqrt") return parseSqrt(state);
  if (ACCENTS[name]) return applyAccent(readArgument(state), ACCENTS[name]);
  if (FONTS[name]) return mapAlphabet(readArgument(state), FONTS[name]);

  if (TEXT_COMMANDS.has(name)) {
    const outer = state.text;
    state.text = true;
    const value = readArgument(state);
    state.text = outer;
    return value;
  }

  if (name === "left" || name === "right") return readDelimiter(state);

  if (DROP_ARG.has(name)) {
    readArgument(state);
    return "";
  }

  if (SPACING[name] !== undefined) return SPACING[name];
  if (IGNORED.has(name)) return "";
  if (GREEK[name]) return GREEK[name];
  if (SYMBOLS[name]) return SYMBOLS[name];
  if (FUNCTIONS.has(name)) return name;
  if (ESCAPES[name] !== undefined) return ESCAPES[name];

  // Unknown command: keep the name, drop the backslash — never drop content.
  return name;
};

/**
 * Convert one atom: a group, a command, or a single character.
 *
 * @param {Object} state Parser state.
 * @returns {string} Converted text, empty for dropped whitespace.
 */
function parseAtom(state) {
  const token = state.tokens[state.pos];

  if (token.type === "space") {
    state.pos += 1;
    return state.text ? " " : "";
  }

  if (token.type === "cmd") return parseCommand(state);

  state.pos += 1;
  if (token.value === "{") return parseList(state, true).join("");
  if (token.value === "&" || token.value === "~") return " ";
  return token.value;
}

/**
 * Convert a token list into atoms, binding sub/superscripts to the atom on
 * their left.
 *
 * @param {Object} state Parser state.
 * @param {boolean} insideGroup True while inside a `{...}` group.
 * @returns {string[]} Converted atoms.
 */
function parseList(state, insideGroup) {
  const atoms = [];

  while (state.pos < state.tokens.length) {
    const token = state.tokens[state.pos];

    if (token.type === "char" && token.value === "}") {
      if (!insideGroup) throw new MathParseError("unbalanced brace");
      state.pos += 1;
      return atoms;
    }

    if (token.type === "char" && (token.value === "^" || token.value === "_")) {
      state.pos += 1;
      const script = toScript(readArgument(state), token.value === "^");
      if (atoms.length) atoms[atoms.length - 1] += script;
      else atoms.push(script);
      continue;
    }

    const atom = parseAtom(state);
    if (atom !== "") atoms.push(atom);
  }

  if (insideGroup) throw new MathParseError("missing closing brace");
  return atoms;
}

/**
 * Convert the body of a single math segment to plain Unicode text.
 *
 * @param {string} latex Segment source without its delimiters.
 * @returns {string|null} Converted text, or null when the segment must be
 *   kept verbatim.
 */
export const convertLatexToUnicode = (latex) => {
  if (typeof latex !== "string" || !latex.trim()) return null;

  try {
    const state = { tokens: tokenize(latex), pos: 0, text: false };
    const result = parseList(state, false).join("").normalize("NFC");
    if (!result.trim()) return null;
    // The result crosses DOMPurify: never introduce angle brackets.
    if (/[<>]/.test(result) && !/[<>]/.test(latex)) return null;
    return result;
  } catch (err) {
    return null;
  }
};

/**
 * Heuristic guard for bare `$...$`, which collides with currency amounts.
 *
 * @param {string} content Text between the dollar signs.
 * @returns {boolean} True when the content is worth converting as math.
 */
const looksLikeInlineMath = (content) => {
  if (!content || content.length > MAX_INLINE_DOLLAR_LEN) return false;
  if (/^\s|\s$/.test(content)) return false;
  if (/^[\d.,:%\s]+$/.test(content)) return false;
  if (/\\[a-zA-Z]/.test(content)) return true;
  if (/[\^_=×÷≤≥]/.test(content)) return true;
  return /^[A-Za-z][A-Za-z0-9]*$/.test(content);
};

/**
 * Find the closing delimiter of a math segment, ignoring escaped characters
 * and delimiters nested inside braces. Ported from KaTeX
 * `contrib/auto-render/splitAtDelimiters.ts` (MIT).
 *
 * @param {string} right Closing delimiter.
 * @param {string} text Full text.
 * @param {number} startIndex Index just after the opening delimiter.
 * @returns {number} Index of the closing delimiter, or -1.
 */
const findEndOfMath = (right, text, startIndex) => {
  let index = startIndex;
  let braceLevel = 0;

  while (index < text.length) {
    const char = text[index];
    if (braceLevel <= 0 && text.startsWith(right, index)) return index;
    if (char === "\\") index += 1;
    else if (char === "{") braceLevel += 1;
    else if (char === "}") braceLevel -= 1;
    index += 1;
  }

  return -1;
};

/**
 * Find the next opening delimiter at or after `from`.
 *
 * @param {string} text Full text.
 * @param {number} from Search start index.
 * @returns {{index: number, delim: Object}|null} Match, or null.
 */
const findNextDelimiter = (text, from) => {
  for (let i = from; i < text.length; i += 1) {
    for (const delim of DELIMITERS) {
      if (!text.startsWith(delim.left, i)) continue;
      // `\$` is an escaped dollar, not a delimiter.
      if (delim.left[0] === "$" && i > 0 && text[i - 1] === "\\") continue;
      return { index: i, delim };
    }
  }

  return null;
};

/**
 * Replace the inline LaTeX inside a translated string with plain Unicode.
 *
 * Supports `\(…\)`, `\[…\]`, `$$…$$` and heuristic-guarded `$…$`. Segments
 * that cannot be converted are kept verbatim, delimiters included, so the
 * worst case is the untouched input. Never throws.
 *
 * @param {string} text Translated text, possibly containing LaTeX.
 * @returns {string} Text with math segments rendered as plain Unicode.
 */
export const parseMathInText = (text) => {
  if (typeof text !== "string" || !text) return text;
  if (!text.includes("\\(") && !text.includes("\\[") && !text.includes("$")) {
    return text;
  }

  try {
    let out = "";
    let pos = 0;
    let converted = false;

    while (pos < text.length) {
      const found = findNextDelimiter(text, pos);
      if (!found) break;

      const { index, delim } = found;
      const contentStart = index + delim.left.length;
      const end = findEndOfMath(delim.right, text, contentStart);

      // Unclosed, or a dollar amount: emit the opening run and keep scanning.
      if (end < 0) {
        out += text.slice(pos, contentStart);
        pos = contentStart;
        continue;
      }

      const content = text.slice(contentStart, end);
      if (delim.bare && !looksLikeInlineMath(content)) {
        out += text.slice(pos, contentStart);
        pos = contentStart;
        continue;
      }

      const rendered = convertLatexToUnicode(content);
      const segmentEnd = end + delim.right.length;
      out += text.slice(pos, index);
      if (rendered === null) {
        out += text.slice(index, segmentEnd);
      } else {
        out += rendered;
        converted = true;
      }
      pos = segmentEnd;
    }

    if (!converted) return text;
    return out + text.slice(pos);
  } catch (err) {
    return text;
  }
};
