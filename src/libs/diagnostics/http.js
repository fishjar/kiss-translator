import { captureDiagnostic, diagnosticDetail } from "./transport";
import { endpoint, isSensitiveField, preview, scrub, summary } from "./privacy";

// Observes the existing body reader. No tee/clone, extra fetch or per-token log.
export async function startHttpDiagnostic(url, init = {}, options = {}) {
  const policy = await diagnosticDetail?.();
  const started = Date.now();
  const secrets = [...(options.secrets || [])];
  try {
    const u = new URL(url);
    for (const [key, value] of u.searchParams)
      if (isSensitiveField(key)) secrets.push(value);
    const headers = new Headers(init.headers);
    for (const [key, value] of headers)
      if (isSensitiveField(key)) {
        secrets.push(value);
        if (/^Bearer /i.test(value)) secrets.push(value.slice(7));
      }
  } catch {
    /* Invalid input is reported by the request itself. */
  }
  let res,
    body,
    bytes = 0,
    chunks = 0,
    done = false;
  let text = "",
    clipped = false;
  let decoder;
  const decode = (value) => {
    decoder ||= new TextDecoder();
    return decoder.decode(value, { stream: true });
  };
  const request = {
    url: endpoint(url, secrets),
    method: (init.method || "GET").toUpperCase(),
  };
  if (policy?.enabled) {
    request.parameters = endpoint(url, secrets, true);
    request.preview = preview(init.body, secrets);
  }
  return {
    response(value) {
      res = value;
    },
    body(value) {
      body = value;
    },
    async errorBody(response) {
      if (!policy?.enabled || !response.body?.getReader) return;
      const reader = response.body.getReader();
      try {
        while (text.length < 8192) {
          const { value, done } = await reader.read();
          if (done) break;
          text += decode(value.subarray(0, 8192 - text.length));
          if (text.length >= 8192) clipped = true;
        }
      } catch {
        /* Failed bodies still have status and type. */
      } finally {
        body = text;
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
    chunk(value) {
      bytes += value.byteLength;
      chunks++;
      // Retain a bounded prefix, with space to redact credentials crossing 4KiB.
      if (policy?.enabled && text.length < 8192) {
        const remaining = 8192 - text.length;
        text += decode(value.subarray(0, remaining));
        if (value.byteLength > remaining) clipped = true;
      } else if (policy?.enabled) clipped = true;
    },
    async finish(error, completed = true) {
      if (done) return;
      done = true;
      try {
        const enabled = policy?.enabled && (await diagnosticDetail?.()).enabled;
        const cancelled =
          (!completed && !error) ||
          error?.name === "AbortError" ||
          error?.code === "REQUEST_CANCELLED";
        const failed = error || (res && !res.ok);
        const outcome = cancelled
          ? "cancelled"
          : error?.name === "TimeoutError" || /TIMEOUT/.test(error?.code || "")
            ? "timeout"
            : failed
              ? "failed"
              : "success";
        const response = res && {
          status: res.status,
          mimeType: res.headers?.get("content-type") || "",
          ...(bytes && { bytes }),
        };
        const binary = /^(image|audio|video)\/|octet-stream|pdf|zip/i.test(
          response?.mimeType || ""
        );
        if (enabled && response && !binary) {
          response.preview = preview(
            body === undefined ? scrub(text, secrets) : body,
            secrets
          );
          if (response.preview && clipped) response.preview.truncated = true;
        }
        if (!enabled) {
          delete request.preview;
          delete request.parameters;
        }
        captureDiagnostic({
          level: cancelled ? "info" : failed ? "warn" : "info",
          module: "http",
          event: `http.${outcome}`,
          context: {
            ...options.context,
            attempt: options.context?.attempt ?? 1,
            networkId:
              globalThis.crypto?.randomUUID?.() ||
              `http-${started}-${Math.random().toString(36).slice(2)}`,
            elapsedMs: Date.now() - started,
            outcome,
            code:
              error?.code ||
              (res && !res.ok
                ? `HTTP_${res.status}`
                : error
                  ? outcome === "timeout"
                    ? "REQUEST_TIMEOUT"
                    : cancelled
                      ? "REQUEST_CANCELLED"
                      : error.name === "SyntaxError"
                        ? "RESPONSE_PARSE_FAILED"
                        : "NETWORK_ERROR"
                  : undefined),
          },
          request,
          response,
          resultSummary: binary
            ? {
                type: "binary",
                bytes:
                  bytes ||
                  body?.size ||
                  Number(res?.headers?.get("content-length")) ||
                  0,
              }
            : body !== undefined
              ? summary(body, secrets)
              : { type: failed && !chunks ? "error" : "stream", bytes, chunks },
          error,
        });
      } catch {
        /* Diagnostic failure must not alter a request result. */
      }
    },
  };
}
