function visitTopLevelCharacters(source, start, end, visitor) {
  let quote = "";
  let escaped = false;
  let inComment = false;
  let parenthesesDepth = 0;
  let bracketsDepth = 0;
  let bracesDepth = 0;

  for (let index = start; index < end; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (inComment) {
      if (character === "*" && nextCharacter === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parenthesesDepth += 1;
    if (character === ")") parenthesesDepth = Math.max(0, parenthesesDepth - 1);
    if (character === "[") bracketsDepth += 1;
    if (character === "]") bracketsDepth = Math.max(0, bracketsDepth - 1);
    if (character === "{") bracesDepth += 1;
    if (character === "}") bracesDepth = Math.max(0, bracesDepth - 1);
    if (
      parenthesesDepth === 0 &&
      bracketsDepth === 0 &&
      bracesDepth === 0 &&
      visitor(character, index) === false
    ) {
      return;
    }
  }
}

function scanCssDeclarationRanges(cssString) {
  const source = String(cssString || "");
  const declarations = [];
  let start = 0;

  visitTopLevelCharacters(source, 0, source.length, (character, index) => {
    if (character === ";") {
      declarations.push({ start, end: index, separatorEnd: index + 1 });
      start = index + 1;
    }
    return true;
  });

  declarations.push({ start, end: source.length, separatorEnd: source.length });
  return declarations;
}

function findTopLevelColon(source, start, end) {
  let colonIndex = -1;
  visitTopLevelCharacters(source, start, end, (character, index) => {
    if (character === ":") {
      colonIndex = index;
      return false;
    }
    return true;
  });
  return colonIndex;
}

function removeCssComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractCssComments(source, start, end) {
  const comments = [];
  let quote = "";
  let escaped = false;

  for (let index = start; index < end; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character !== "/" || nextCharacter !== "*") continue;

    const commentEnd = source.indexOf("*/", index + 2);
    const boundedEnd =
      commentEnd < 0 || commentEnd >= end ? end : commentEnd + 2;
    comments.push(source.slice(index, boundedEnd));
    index = boundedEnd - 1;
  }

  return comments;
}

function findPropertyStart(source, start, end) {
  let cursor = start;
  while (cursor < end) {
    while (cursor < end && /\s/.test(source[cursor])) cursor += 1;
    if (source.slice(cursor, cursor + 2) !== "/*") break;
    const commentEnd = source.indexOf("*/", cursor + 2);
    if (commentEnd < 0 || commentEnd >= end) break;
    cursor = commentEnd + 2;
  }
  return cursor;
}

function parseCssDeclaration(source, range) {
  const colonIndex = findTopLevelColon(source, range.start, range.end);
  if (colonIndex < 0) return null;

  const propertySource = source.slice(range.start, colonIndex);
  const property = removeCssComments(propertySource).trim();
  if (!/^--[^\s:;]+$/.test(property) && !/^-?[_a-z][\w-]*$/i.test(property)) {
    return null;
  }

  return {
    ...range,
    colonIndex,
    property,
    propertyStart: findPropertyStart(source, range.start, colonIndex),
  };
}

function normalizeCssProperty(property) {
  return property.startsWith("--") ? property : property.toLowerCase();
}

function findCssDeclarations(cssString, property) {
  const source = String(cssString || "");
  const normalizedProperty = normalizeCssProperty(property);
  return scanCssDeclarationRanges(source)
    .map((range) => parseCssDeclaration(source, range))
    .filter(
      (declaration) =>
        declaration &&
        normalizeCssProperty(declaration.property) === normalizedProperty
    );
}

function findTrailingTriviaStart(source, start, end) {
  let cursor = end;

  while (cursor > start) {
    const previousCursor = cursor;
    while (cursor > start && /\s/.test(source[cursor - 1])) cursor -= 1;
    if (cursor >= start + 2 && source.slice(cursor - 2, cursor) === "*/") {
      const commentStart = source.lastIndexOf("/*", cursor - 2);
      if (commentStart >= start) {
        cursor = commentStart;
        continue;
      }
    }
    if (cursor === previousCursor) break;
  }

  return cursor;
}

function appendCssProperty(source, property, value) {
  if (!source) return `${property}: ${value};`;

  const ranges = scanCssDeclarationRanges(source);
  const trailingRange = ranges[ranges.length - 1];
  const trailingSource = source.slice(trailingRange.start, trailingRange.end);
  const needsSemicolon = Boolean(removeCssComments(trailingSource).trim());
  const lineBreak = source.includes("\r\n") ? "\r\n" : "\n";
  const separator = /[\r\n]$/.test(source) ? "" : lineBreak;
  return `${source}${needsSemicolon ? ";" : ""}${separator}${property}: ${value};`;
}

export function parseCssToObject(cssString) {
  const source = String(cssString || "");
  return Object.fromEntries(
    scanCssDeclarationRanges(source).flatMap((range) => {
      const declaration = parseCssDeclaration(source, range);
      return declaration
        ? [
            [
              declaration.property,
              source.slice(declaration.colonIndex + 1, declaration.end).trim(),
            ],
          ]
        : [];
    })
  );
}

export function patchCssProperty(cssString, property, value) {
  const source = String(cssString || "");
  const normalizedProperty = String(property || "").trim();
  if (!normalizedProperty) return source;

  const declarations = findCssDeclarations(source, normalizedProperty);
  if (value === undefined || value === null || value === "") {
    return declarations.reduceRight((css, declaration) => {
      const preservedComments = extractCssComments(
        css,
        declaration.propertyStart,
        declaration.end
      ).join(" ");
      return (
        css.slice(0, declaration.propertyStart) +
        preservedComments +
        css.slice(declaration.separatorEnd)
      );
    }, source);
  }

  if (!declarations.length) {
    return appendCssProperty(source, normalizedProperty, value);
  }

  const declaration = declarations[declarations.length - 1];
  let valueStart = declaration.colonIndex + 1;
  while (valueStart < declaration.end && /\s/.test(source[valueStart])) {
    valueStart += 1;
  }

  let valueEnd = findTrailingTriviaStart(source, valueStart, declaration.end);
  const priorityMatch = source
    .slice(valueStart, valueEnd)
    .match(/\s*!\s*important\s*$/i);
  if (priorityMatch) {
    valueEnd = findTrailingTriviaStart(
      source,
      valueStart,
      valueStart + priorityMatch.index
    );
  }

  return source.slice(0, valueStart) + value + source.slice(valueEnd);
}

export function cssObjectToReactStyle(cssObject) {
  return Object.fromEntries(
    Object.entries(cssObject).map(([property, value]) => {
      if (property.startsWith("--")) return [property, value];
      const camelProperty = property.replace(/-([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      const reactProperty = camelProperty.startsWith("webkit")
        ? `W${camelProperty.slice(1)}`
        : camelProperty;
      return [reactProperty, value];
    })
  );
}

export function objectToCss(cssObject) {
  const entries = Object.entries(cssObject).filter(
    ([, value]) => value !== undefined && value !== ""
  );
  return entries.length
    ? `${entries.map(([key, value]) => `${key}: ${value}`).join(";\n")};`
    : "";
}

export function parseRgba(value) {
  const match = String(value || "").match(
    /^\s*rgba?\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*((?:\d+(?:\.\d+)?)|(?:\.\d+)))?\s*\)\s*$/i
  );
  if (!match) return null;

  const color = {
    r: Number.parseFloat(match[1]),
    g: Number.parseFloat(match[2]),
    b: Number.parseFloat(match[3]),
    a: match[4] === undefined ? 1 : Number.parseFloat(match[4]),
  };
  return color.r <= 255 && color.g <= 255 && color.b <= 255 && color.a <= 1
    ? color
    : null;
}

export function parseCssColor(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (normalized === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const hexMatch = normalized.match(
    /^#([a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i
  );
  if (hexMatch) {
    const compact = hexMatch[1];
    const expanded =
      compact.length <= 4
        ? compact
            .split("")
            .map((character) => character.repeat(2))
            .join("")
        : compact;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a:
        expanded.length === 8
          ? Number.parseInt(expanded.slice(6, 8), 16) / 255
          : 1,
    };
  }

  return parseRgba(normalized);
}

export function resolveBackgroundRgba(
  cssObject,
  fallback = "rgba(0, 0, 0, 0.5)"
) {
  const explicitColor = cssObject["background-color"];
  const legacyBackground = cssObject.background;
  const legacyColor =
    legacyBackground && !/(?:gradient|url)\s*\(/i.test(legacyBackground)
      ? legacyBackground
      : "";
  return (
    parseCssColor(explicitColor || legacyColor || fallback) ||
    parseCssColor(fallback)
  );
}

export function resolveEditableBackgroundRgba(
  cssObject,
  fallback = "rgba(0, 0, 0, 0.5)"
) {
  if (cssObject["background-color"] !== undefined) {
    return parseCssColor(cssObject["background-color"]);
  }
  if (cssObject.background !== undefined) {
    return parseCssColor(cssObject.background);
  }
  return parseCssColor(fallback);
}

export function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((channel) => {
        const numericChannel = Number(channel);
        const value = Number.isNaN(numericChannel) ? 0 : numericChannel;
        return Math.min(255, Math.max(0, Math.round(value)))
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

export function hexToRgb(hex) {
  const color = parseCssColor(hex);
  return color ? { r: color.r, g: color.g, b: color.b } : { r: 0, g: 0, b: 0 };
}

export function parseFontSize(fontSize) {
  const fallback = {
    min: 1,
    preferred: 2,
    max: 3,
    unit: "rem",
    minUnit: "rem",
    preferredUnit: "rem",
    maxUnit: "rem",
    kind: "simple",
    isEditable: true,
  };
  if (!fontSize) return fallback;

  const lengthPattern = "((?:\\d+(?:\\.\\d+)?)|(?:\\.\\d+))([a-z]+|%)";
  const clampMatch = String(fontSize).match(
    new RegExp(
      `^\\s*clamp\\s*\\(\\s*${lengthPattern}\\s*,\\s*${lengthPattern}\\s*,\\s*${lengthPattern}\\s*\\)\\s*$`,
      "i"
    )
  );
  if (clampMatch) {
    return {
      min: Number.parseFloat(clampMatch[1]),
      preferred: Number.parseFloat(clampMatch[3]),
      max: Number.parseFloat(clampMatch[5]),
      unit: clampMatch[2],
      minUnit: clampMatch[2],
      preferredUnit: clampMatch[4],
      maxUnit: clampMatch[6],
      kind: "clamp",
      isEditable: true,
    };
  }

  const simpleMatch = String(fontSize).match(
    /^\s*((?:\d+(?:\.\d+)?)|(?:\.\d+))([a-z]+|%)\s*$/i
  );
  if (!simpleMatch) return { ...fallback, isEditable: false };
  const value = Number.parseFloat(simpleMatch[1]);
  return {
    min: value * 0.5,
    preferred: value,
    max: value * 1.5,
    unit: simpleMatch[2],
    minUnit: simpleMatch[2],
    preferredUnit: simpleMatch[2],
    maxUnit: simpleMatch[2],
    kind: "simple",
    isEditable: true,
  };
}

export function serializeFontSize(fontSize, preferred) {
  if (!fontSize?.isEditable) return null;
  if (fontSize.kind === "clamp") {
    return `clamp(${fontSize.min}${fontSize.minUnit}, ${preferred}${fontSize.preferredUnit}, ${fontSize.max}${fontSize.maxUnit})`;
  }
  return `${preferred}${fontSize.preferredUnit}`;
}

export function getCssLengthSliderRange(value, unit) {
  const normalizedUnit = String(unit || "").toLowerCase();
  const presets = {
    px: { max: 64, step: 1 },
    em: { max: 5, step: 0.1 },
    rem: { max: 5, step: 0.1 },
    "%": { max: 100, step: 1 },
    cqw: { max: 10, step: 0.1 },
    cqh: { max: 10, step: 0.1 },
    cqi: { max: 10, step: 0.1 },
    cqb: { max: 10, step: 0.1 },
    vw: { max: 10, step: 0.1 },
    vh: { max: 10, step: 0.1 },
    vmin: { max: 10, step: 0.1 },
    vmax: { max: 10, step: 0.1 },
  };
  const preset = presets[normalizedUnit] || { max: 10, step: 0.1 };
  const numericValue = Math.max(0, Number(value) || 0);
  const requiredMax = Math.ceil((numericValue * 2) / preset.step) * preset.step;
  return {
    min: 0,
    max: Math.max(preset.max, requiredMax),
    step: preset.step,
  };
}

export function parseLineHeight(lineHeight) {
  const fallback = { value: 1.3, isEditable: true };
  if (!lineHeight) return fallback;

  const match = String(lineHeight).match(
    /^\s*((?:\d+(?:\.\d+)?)|(?:\.\d+))\s*$/
  );
  return match
    ? { value: Number.parseFloat(match[1]), isEditable: true }
    : { ...fallback, isEditable: false };
}

export function parsePadding(padding) {
  const fallback = {
    vertical: 0.5,
    horizontal: 1,
    unit: "em",
    isEditable: false,
  };
  if (!padding) return { ...fallback, isEditable: true };

  const parts = String(padding).trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 2) return fallback;

  const lengths = parts.map((part) => {
    const match = part.match(/^((?:\d+(?:\.\d+)?)|(?:\.\d+))([a-z]+|%)?$/i);
    if (!match) return null;
    const value = Number.parseFloat(match[1]);
    const unit = match[2] || "";
    return !unit && value !== 0 ? null : { value, unit };
  });
  if (lengths.some((length) => !length)) return fallback;

  const units = new Set(
    lengths.filter((length) => length.value !== 0).map((length) => length.unit)
  );
  if (units.size > 1) return fallback;
  const unit =
    units.values().next().value ||
    lengths.find(({ unit }) => unit)?.unit ||
    "px";
  if (lengths.some((length) => length.unit && length.unit !== unit)) {
    return fallback;
  }

  return {
    vertical: lengths[0].value,
    horizontal: (lengths[1] || lengths[0]).value,
    unit,
    isEditable: true,
  };
}

export function colorToHex(color) {
  const parsed = parseCssColor(color);
  return parsed ? rgbToHex(parsed.r, parsed.g, parsed.b) : "#ffffff";
}
