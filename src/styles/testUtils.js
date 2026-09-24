export function getCssAtRuleBodies(css, prelude) {
  const source = String(css || "");
  const bodies = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(prelude, cursor);
    if (start < 0) break;
    const openingBrace = source.indexOf("{", start + prelude.length);
    if (openingBrace < 0) break;

    let depth = 1;
    let index = openingBrace + 1;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}") depth -= 1;
      index += 1;
    }

    if (depth !== 0) break;
    bodies.push(source.slice(openingBrace + 1, index - 1));
    cursor = index;
  }

  return bodies;
}
