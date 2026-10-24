export const PREVIEW_BYTES = 4096;
const dataUri = /^data:(?:[\w.+-]+\/[\w.+-]+)?(?:;[\w=.+-]+)*,/i;
const sensitive =
  /authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|signature/i;
export const isSensitiveField = (key) => sensitive.test(key);
export function clip(text, limit = PREVIEW_BYTES) {
  const bytes = new TextEncoder().encode(String(text));
  let end = Math.min(bytes.length, limit),
    decoded;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  while (decoded === undefined && end >= 0) {
    try {
      decoded = decoder.decode(bytes.slice(0, end));
    } catch {
      end--;
    }
  }
  return { text: decoded || "", truncated: bytes.length > limit };
}
export function scrub(text, secrets = []) {
  let value = String(text);
  for (const secret of secrets.filter(
    (s) => typeof s === "string" && s.length
  )) {
    for (const representation of new Set([
      secret,
      JSON.stringify(secret).slice(1, -1),
      encodeURIComponent(secret),
    ]))
      value = value.split(representation).join("[redacted]");
  }
  return value
    .replace(/Bearer\s+[^\s"',;]+/gi, "Bearer [redacted]")
    .replace(
      /((?:["']?)(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|signature)[\w-]*["']?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[^\s,;&}]+)/gi,
      '$1"[redacted]"'
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
}
export function endpoint(value, secrets = [], detailed = false) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "[non-http]";
    url.username = "";
    url.password = "";
    url.hash = "";
    url.pathname = scrub(url.pathname, secrets);
    for (const [key, value] of [...url.searchParams])
      url.searchParams.set(
        key,
        detailed && !sensitive.test(key) ? scrub(value, secrets) : "[redacted]"
      );
    return clip(url.href, 2048).text;
  } catch {
    return "[invalid-url]";
  }
}
const isOpaqueBody = (value) =>
  (typeof Blob !== "undefined" && value instanceof Blob) ||
  (typeof FormData !== "undefined" && value instanceof FormData) ||
  (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) ||
  ArrayBuffer.isView(value) ||
  value instanceof ArrayBuffer;

export function preview(value, secrets = []) {
  try {
    if (typeof value === "string") {
      if (dataUri.test(value)) return undefined;
      try {
        value = JSON.parse(value);
      } catch {
        return clip(scrub(value, secrets));
      }
    }
    if (!value || typeof value !== "object")
      return clip(scrub(String(value ?? ""), secrets));
    if (isOpaqueBody(value)) return undefined;
    const seen = new WeakSet();
    let omitted = false;
    const clean = (item, depth = 0) => {
      if (typeof item === "string")
        return dataUri.test(item) ? "[binary omitted]" : scrub(item, secrets);
      if (!item || typeof item !== "object") return item;
      if (isOpaqueBody(item)) return "[binary omitted]";
      if (seen.has(item) || depth >= 8) {
        omitted = true;
        return "[omitted]";
      }
      seen.add(item);
      if (Array.isArray(item)) {
        omitted ||= item.length > 50;
        return item.slice(0, 50).map((v) => clean(v, depth + 1));
      }
      omitted ||= Object.keys(item).length > 50;
      return Object.fromEntries(
        Object.entries(item)
          .slice(0, 50)
          .map(([k, v]) => [
            scrub(k, secrets),
            sensitive.test(k) ? "[redacted]" : clean(v, depth + 1),
          ])
      );
    };
    const result = clip(JSON.stringify(clean(value), null, 2));
    return { ...result, truncated: result.truncated || omitted };
  } catch {
    return undefined;
  }
}
export function summary(value, secrets = []) {
  if (value === null || value === undefined) return { type: "empty" };
  if (typeof Blob !== "undefined" && value instanceof Blob)
    return { type: "binary", bytes: value.size, mimeType: value.type };
  if (typeof value === "string") {
    try {
      return summary(JSON.parse(value), secrets);
    } catch {
      return { type: "text", length: value.length };
    }
  }
  if (Array.isArray(value)) return { type: "array", count: value.length };
  if (typeof value === "object")
    return {
      type: "object",
      fields: Object.keys(value)
        .slice(0, 30)
        .map((k) => scrub(k, secrets)),
    };
  return { type: typeof value };
}
// Normalize independently at every persistence boundary; never accept arbitrary fields.
export function networkFields(input = {}) {
  const result = {};
  for (const key of ["request", "response"]) {
    const value = input[key];
    if (!value || typeof value !== "object") continue;
    const item = {};
    if (key === "request") {
      if (value.kind === "rpc") {
        item.kind = "rpc";
        item.method = scrub(value.method || "").slice(0, 100);
      } else {
        item.url = endpoint(value.url);
        item.method = String(value.method || "GET")
          .replace(/[^A-Z]/g, "")
          .slice(0, 12);
      }
      if (value.parameters)
        item.parameters = endpoint(value.parameters, [], true);
    }
    for (const field of ["status", "bytes"])
      if (Number.isFinite(value[field])) item[field] = value[field];
    if (value.mimeType)
      item.mimeType = scrub(String(value.mimeType)).slice(0, 100);
    if (value.preview && typeof value.preview.text === "string") {
      const body = preview(value.preview.text);
      if (body)
        item.preview = {
          ...body,
          truncated: body.truncated || !!value.preview.truncated,
        };
    }
    result[key] = item;
  }
  if (input.resultSummary) {
    const s = input.resultSummary;
    result.resultSummary = {
      type: String(s.type || "unknown")
        .replace(/[^a-z-]/g, "")
        .slice(0, 30),
      ...Object.fromEntries(
        ["count", "length", "bytes", "chunks"]
          .filter((k) => Number.isFinite(s[k]))
          .map((k) => [k, s[k]])
      ),
      ...(Array.isArray(s.fields) && {
        fields: s.fields.slice(0, 30).map((k) => scrub(String(k)).slice(0, 80)),
      }),
    };
  }
  return result;
}
export function withoutBodies(record) {
  const result = { ...record };
  for (const key of ["request", "response"])
    if (result[key]) {
      const { preview, parameters, ...rest } = result[key];
      result[key] = rest;
    }
  return result;
}
