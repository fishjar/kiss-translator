import type { Json } from "./types";

export interface PyJsonOptions {
  /** 对应 Python json.dumps 的 ensure_ascii 参数（默认 true） */
  ensureAscii?: boolean;
}

/**
 * 按 Python `json.dumps(value, separators=(", ", ": "))` 的规则序列化 JSON，
 * 保证与上游 Laya 的 prompt/state 序列化完全一致。
 */
export function pyJson(value: Json, options: PyJsonOptions = {}): string {
  return serialize(value, options.ensureAscii ?? true);
}

function serialize(value: Json, ensureAscii: boolean): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError("Non-finite numbers are not JSON");
    }
    return formatPyNumber(value);
  }
  if (typeof value === "string") return serializeString(value, ensureAscii);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => serialize(v, ensureAscii)).join(", ") + "]";
  }
  return (
    "{" +
    Object.entries(value)
      .map(
        ([k, v]) =>
          serializeString(k, ensureAscii) + ": " + serialize(v, ensureAscii)
      )
      .join(", ") +
    "}"
  );
}

export function formatPyNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const sign = value < 0 ? "-" : "";
  const match = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(
    Math.abs(value).toExponential()
  );
  if (!match) throw new RangeError(`Unexpected exponential form for ${value}`);
  const [, leadDigit, fracDigits, expText] = match;
  const digits = (leadDigit ?? "") + (fracDigits ?? "");
  const exp = Number(expText ?? "0");
  if (exp >= -4 && exp < 16) {
    if (exp >= 0) {
      const intLen = exp + 1;
      return (
        sign +
        (digits.length <= intLen
          ? digits.padEnd(intLen, "0")
          : digits.slice(0, intLen) + "." + digits.slice(intLen))
      );
    }
    return sign + "0." + "0".repeat(-exp - 1) + digits;
  }
  const mantissa =
    digits.length > 1 ? digits.slice(0, 1) + "." + digits.slice(1) : digits;
  const expSign = exp < 0 ? "-" : "+";
  return (
    sign + mantissa + "e" + expSign + String(Math.abs(exp)).padStart(2, "0")
  );
}

function serializeString(value: string, ensureAscii: boolean): string {
  const escaped = JSON.stringify(value);
  if (!ensureAscii) return escaped;
  let out = "";
  for (let i = 0; i < escaped.length; i++) {
    const code = escaped.charCodeAt(i);
    out +=
      code >= 0x7f
        ? "\\u" + code.toString(16).padStart(4, "0")
        : (escaped[i] ?? "");
  }
  return out;
}
