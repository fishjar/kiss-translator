export function normalizeOptionsPath(value = "") {
  const rawPath = String(value).replace(/^#/, "") || "/";
  const queryIndex = rawPath.indexOf("?");
  const path =
    (queryIndex >= 0 ? rawPath.slice(0, queryIndex) : rawPath) || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}
