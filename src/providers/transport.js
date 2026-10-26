import { providerError } from "./capabilities";
import { projectInstanceConfig } from "./instances";
import { createSSEParser } from "./sdk/stream";
import { signHmac } from "./sdk/encoding";
import { createNDJSONParser } from "./sdk/segments";
import { getFetchPool } from "../libs/pool";
import { startHttpDiagnostic } from "../libs/diagnostics/http";

const RESPONSE_LIMIT = 8 * 1024 * 1024;

/** A task-owned store. Asset IDs never grant access outside this invocation. */
export function createAssetStore() {
  const assets = new Map();
  let sequence = 0;
  return {
    put(blob) {
      const ref = {
        assetId: `asset-${++sequence}`,
        mimeType: blob.type || "application/octet-stream",
      };
      if (blob.name) ref.filename = blob.name;
      assets.set(ref.assetId, blob);
      return ref;
    },
    get(ref) {
      const blob = assets.get(ref?.assetId);
      if (!blob)
        throw providerError(
          "ASSET_UNAVAILABLE",
          "Asset is not owned by this task."
        );
      return blob;
    },
    entries() {
      return [...assets.entries()];
    },
    import(ref, blob) {
      if (!/^asset-\d+$/.test(ref?.assetId) || assets.has(ref.assetId))
        throw providerError("INVALID_ASSET", "Invalid or duplicate asset ID.");
      assets.set(ref.assetId, blob);
      sequence = Math.max(sequence, Number(ref.assetId.slice(6)));
    },
    clear() {
      assets.clear();
    },
  };
}

export function createTransportBroker(
  instance,
  { signal, assets, fetchImpl = globalThis.fetch, diagnostic: context }
) {
  const { secrets } = projectInstanceConfig(instance);
  const fields = new Set(
    (instance.provider.settings || [])
      .filter((field) => field.isSecret || field.type === "password")
      .map((field) => field.key)
  );
  const allowed = new Set(instance.provider.permissions?.network || []);
  for (const key of instance.provider.permissions?.endpointFields || []) {
    const value = instance.pluginConfig?.[key];
    if (value) allowed.add(new URL(value).origin);
  }
  const secretRef = (key) => {
    if (!fields.has(key))
      throw providerError("SECRET_UNAVAILABLE", "Unknown secret field.");
    return { scope: instance.apiSlug, key };
  };
  const readSecret = (ref) => {
    if (
      ref?.scope !== instance.apiSlug ||
      !fields.has(ref.key) ||
      typeof secrets[ref.key] !== "string" ||
      !secrets[ref.key]
    )
      throw providerError(
        "SECRET_UNAVAILABLE",
        "Invalid credential reference."
      );
    return secrets[ref.key];
  };
  const check = () => {
    if (signal?.aborted)
      throw (
        signal.reason ||
        Object.assign(new Error("Cancelled"), { name: "AbortError" })
      );
  };
  const prepare = (request) => {
    check();
    const url = new URL(request.url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password
    ) {
      throw providerError(
        "NETWORK_DENIED",
        "Only HTTPS or HTTP loopback endpoints are supported."
      );
    }
    if (!allowed.has(url.origin))
      throw providerError(
        "NETWORK_DENIED",
        `Origin outside declared network scope: ${url.origin}`
      );
    if (
      !["GET", "POST", "PUT", "DELETE", "PATCH"].includes(
        request.method || "GET"
      )
    )
      throw providerError("INVALID_REQUEST", "Unsupported HTTP method.");
    const headers = { ...request.headers };
    for (const name of Object.keys(headers))
      if (/^(cookie|cookie2)$/i.test(name))
        throw providerError(
          "INVALID_REQUEST",
          "Cookie headers are not allowed."
        );
    let requestBody = request.body;
    // Bindings are resolved inside the declared origin boundary, never in the interpreter.
    for (const binding of request.secretBindings || []) {
      const value = (binding.prefix || "") + readSecret(binding.secret);
      const name = binding.name;
      if (
        typeof name !== "string" ||
        !/^[\w.-]+$/.test(name) ||
        ["__proto__", "constructor", "prototype"].includes(name)
      )
        throw providerError("INVALID_REQUEST", "Invalid secret binding name.");
      if (binding.target === "header") headers[name] = value;
      else if (binding.target === "query") url.searchParams.set(name, value);
      else if (binding.target === "json" && request.bodyType === "json")
        requestBody = { ...requestBody, [name]: value };
      else
        throw providerError(
          "INVALID_REQUEST",
          "Unsupported secret binding target."
        );
    }
    // Bindings must not reintroduce a header forbidden in the raw request.
    for (const name of Object.keys(headers))
      if (/^(cookie|cookie2)$/i.test(name))
        throw providerError(
          "INVALID_REQUEST",
          "Cookie headers are not allowed."
        );
    if (request.auth) {
      const ref = request.auth.secret;
      if (request.auth.type !== "bearer" || !ref) {
        throw providerError(
          "SECRET_UNAVAILABLE",
          "Invalid credential reference."
        );
      }
      for (const key of Object.keys(headers))
        if (key.toLowerCase() === "authorization") delete headers[key];
      headers.Authorization = `Bearer ${readSecret(ref)}`;
    }
    let body;
    if (request.bodyType === "json") body = JSON.stringify(requestBody);
    else if (request.bodyType === "multipart") {
      body = new FormData();
      for (const [key, value] of Object.entries(request.body || {})) {
        if (value?.assetId)
          body.append(key, assets.get(value), value.filename || "input");
        else if (value !== undefined) body.append(key, String(value));
      }
      for (const key of Object.keys(headers))
        if (key.toLowerCase() === "content-type") delete headers[key];
    } else if (request.bodyType === "asset") body = assets.get(request.body);
    else if (request.body !== undefined) body = request.body;
    const bodySize =
      body instanceof FormData
        ? [...body.values()].reduce(
            (n, value) =>
              n +
              (typeof value === "string" ? new Blob([value]).size : value.size),
            0
          )
        : typeof body === "string"
          ? new Blob([body]).size
          : body?.size || 0;
    if (bodySize > RESPONSE_LIMIT)
      throw providerError(
        "RESOURCE_BUDGET_EXCEEDED",
        "Request body exceeds 8 MiB."
      );
    if (
      request.bodyType === "json" &&
      !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
    )
      headers["Content-Type"] = "application/json";
    return [
      url.href,
      {
        method: request.method || "GET",
        headers,
        body,
        signal,
        credentials: "omit",
        redirect: "error",
      },
    ];
  };
  const diagnostics = new WeakMap();
  const response = async (request) => {
    const [url, init] = prepare(request);
    const diagnostic = await startHttpDiagnostic(url, init, {
      context,
      secrets: Object.values(secrets),
    });
    try {
      const res = await fetchImpl(url, init);
      diagnostic.response(res);
      diagnostics.set(res, diagnostic);
      check();
      if (!res.ok) {
        await diagnostic.errorBody(res);
        // Do not include headers, URL query or response body that may echo secrets.
        throw providerError(
          "HTTP_ERROR",
          `Provider returned HTTP ${res.status}`
        );
      }
      return res;
    } catch (error) {
      await diagnostic.finish(error);
      throw error;
    }
  };
  const readBody = async (res) => {
    const reader = res.body?.getReader();
    if (!reader) {
      const bytes = new TextEncoder().encode(await res.text());
      if (bytes.length > RESPONSE_LIMIT)
        throw providerError(
          "RESOURCE_BUDGET_EXCEEDED",
          "Response exceeds 8 MiB."
        );
      return bytes;
    }
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        check();
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > RESPONSE_LIMIT)
          throw providerError(
            "RESOURCE_BUDGET_EXCEEDED",
            "Response exceeds 8 MiB."
          );
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
  const schedule = (execute) =>
    getFetchPool(instance.fetchInterval ?? 0, instance.fetchLimit ?? 8).push(
      execute,
      undefined,
      { signal, maxRetries: 0 }
    );
  return {
    secrets: {
      ref: secretRef,
      sign: async (ref, options) => {
        check();
        return signHmac(readSecret(ref), options);
      },
    },
    http: {
      async request(request) {
        return schedule(async () => {
          const res = await response(request);
          const diagnostic = diagnostics.get(res);
          try {
            const headers = Object.fromEntries(res.headers.entries());
            const bytes = await readBody(res);
            if (
              request.responseType === "asset" &&
              (assets.entries().length >= 8 ||
                assets.entries().reduce((n, [, blob]) => n + blob.size, 0) +
                  bytes.byteLength >
                  RESPONSE_LIMIT)
            )
              throw providerError(
                "RESOURCE_BUDGET_EXCEEDED",
                "Task assets exceed 8 files or 8 MiB."
              );
            const body =
              request.responseType === "asset"
                ? assets.put(
                    new Blob([bytes], {
                      type:
                        res.headers.get("content-type") ||
                        "application/octet-stream",
                    })
                  )
                : new TextDecoder().decode(bytes);
            check();
            diagnostic.body(
              request.responseType === "asset" ? new Blob([bytes]) : body
            );
            await diagnostic.finish();
            return { status: res.status, headers, body };
          } catch (error) {
            await diagnostic.finish(error);
            throw error;
          }
        });
      },
      async *stream(request) {
        let release;
        let resolveResponse;
        let rejectResponse;
        const ready = new Promise((resolve, reject) => {
          resolveResponse = resolve;
          rejectResponse = reject;
        });
        const lease = new Promise((resolve) => {
          release = resolve;
        });
        // Keep the pool slot through body consumption, not merely until headers arrive.
        const scheduled = schedule(async () => {
          resolveResponse(await response(request));
          await lease;
        });
        scheduled.catch(rejectResponse);
        const res = await ready;
        const diagnostic = diagnostics.get(res);
        const reader = res.body?.getReader();
        if (!reader) {
          release();
          const error = providerError(
            "STREAM_UNSUPPORTED",
            "Response is not readable."
          );
          await diagnostic.finish(error);
          throw error;
        }
        if (
          request.streamFormat !== undefined &&
          !["sse", "ndjson"].includes(request.streamFormat)
        ) {
          await reader.cancel();
          reader.releaseLock();
          release();
          const error = providerError(
            "INVALID_REQUEST",
            "Unsupported stream format."
          );
          await diagnostic.finish(error);
          throw error;
        }
        const ndjson = request.streamFormat === "ndjson";
        const parser = ndjson ? createNDJSONParser() : createSSEParser();
        const frames = (chunk) =>
          parser
            .push(chunk)
            .map((frame) =>
              ndjson
                ? { type: "json", value: frame }
                : { type: "sse", ...frame }
            );
        const decoder = new TextDecoder();
        let size = 0;
        let failure,
          completed = false;
        try {
          yield {
            type: "headers",
            status: res.status,
            headers: Object.fromEntries(res.headers.entries()),
          };
          while (true) {
            check();
            const { value, done } = await reader.read();
            if (done) break;
            diagnostic.chunk(value);
            size += value.byteLength;
            if (size > RESPONSE_LIMIT)
              throw providerError(
                "RESOURCE_BUDGET_EXCEEDED",
                "Stream exceeds 8 MiB."
              );
            for (const frame of frames(decoder.decode(value, { stream: true })))
              yield frame;
          }
          for (const frame of frames(decoder.decode())) yield frame;
          const tail = parser.finish();
          if (ndjson) for (const value of tail) yield { type: "json", value };
          completed = true;
        } catch (error) {
          failure = error;
          throw error;
        } finally {
          // Release synchronously: iterator.return() must not strand the pool slot
          // while reader cancellation is pending (including transpiled async generators).
          release();
          await diagnostic.finish(failure, completed);
          const cancelling = reader.cancel();
          reader.releaseLock();
          await cancelling.catch(() => {});
          await scheduled;
        }
      },
    },
  };
}
