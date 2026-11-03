import { downloadProviderPackage } from "./package";
import { providerError } from "./capabilities";
import { SDK_VERSION } from "./sdk/version";

import {
  assertPluginCompatibility,
  validatePluginCompatibilityFields,
} from "./compatibility";

export const OFFICIAL_REPOSITORY =
  "https://github.com/fishjar/kiss-translator-plugins";
export const OFFICIAL_BASE =
  "https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist/";
const PREFIX = "kiss-plugin-directory-v1:";
const inflight = new Map();

export function readDirectoryCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(PREFIX + key));
    return cached && Number.isFinite(cached.time) ? cached : null;
  } catch {
    return null;
  }
}

// Bound both metadata headers and body; never retain credentials or HTML responses.
export async function fetchDirectoryJson(url, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  let reader;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        providerError("REQUEST_TIMEOUT", "Plugin directory request timed out.")
      );
    }, 15000);
  });
  try {
    const response = await Promise.race([
      fetchImpl(url, {
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
      timeout,
    ]);
    if (!response.ok) {
      const error = providerError(
        "HTTP_ERROR",
        `Plugin directory request failed: ${response.status}`
      );
      if ([403, 429].includes(response.status)) {
        const retry = response.headers?.get("retry-after");
        const reset = Number(response.headers?.get("x-ratelimit-reset")) * 1000;
        error.retryAt = Math.max(
          Date.now() + 60000,
          retry
            ? (Number.isFinite(Number(retry))
                ? Date.now() + Number(retry) * 1000
                : Date.parse(retry)) || 0
            : 0,
          Number.isFinite(reset) ? reset : 0
        );
      }
      throw error;
    }
    reader = response.body?.getReader();
    if (!reader)
      throw providerError("INVALID_RESPONSE", "Directory stream unavailable.");
    let size = 0;
    const chunks = [];
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024)
        throw providerError(
          "RESOURCE_BUDGET_EXCEEDED",
          "Plugin directory exceeds 1 MiB."
        );
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    clearTimeout(timer);
    controller.abort();
    void reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}

export function validateOfficialDirectory(data) {
  if (
    data?.schemaVersion !== 1 ||
    !Array.isArray(data.plugins) ||
    data.plugins.length > 500
  )
    throw providerError(
      "INVALID_PACKAGE",
      "Unsupported official plugin directory."
    );
  const ids = new Set();
  for (const entry of data.plugins) {
    if (
      !entry ||
      !/^[a-z][a-z0-9-]{1,100}$/.test(entry.id) ||
      ids.has(entry.id) ||
      !/^\d+\.\d+\.\d+$/.test(entry.version) ||
      !Number.isSafeInteger(entry.apiVersion) ||
      entry.apiVersion < 1 ||
      typeof entry.name !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      entry.downloadUrl !==
        `${OFFICIAL_BASE}${entry.id}/${entry.version}.zip` ||
      !Array.isArray(entry.capabilities) ||
      !entry.capabilities.every((value) => typeof value === "string")
    )
      throw providerError(
        "INVALID_PACKAGE",
        "Invalid official plugin directory entry."
      );
    if (entry.kind !== undefined && typeof entry.kind !== "string")
      throw providerError("INVALID_PACKAGE", "Invalid plugin kind.");
    validatePluginCompatibilityFields({
      apiVersion: SDK_VERSION,
      minHostVersion: entry.minHostVersion,
    });
    ids.add(entry.id);
  }
  return data;
}

export function validateCommunityDirectory(data) {
  if (!Array.isArray(data?.items) || !Number.isFinite(data.total_count))
    throw providerError(
      "INVALID_RESPONSE",
      "Invalid GitHub repository search response."
    );
  const seen = new Set();
  const items = data.items
    .filter((repo) => {
      if (
        !/^[A-Za-z0-9][A-Za-z0-9-]*\/[\w.-]+$/.test(repo?.full_name) ||
        [".", ".."].includes(repo.full_name?.split("/")[1]) ||
        repo.html_url !== `https://github.com/${repo.full_name}` ||
        repo.html_url.toLowerCase() === OFFICIAL_REPOSITORY.toLowerCase() ||
        repo.fork ||
        repo.archived ||
        seen.has(repo.full_name.toLowerCase())
      )
        return false;
      seen.add(repo.full_name.toLowerCase());
      return true;
    })
    .map((repo) => ({
      full_name: repo.full_name,
      html_url: repo.html_url,
      description: typeof repo.description === "string" ? repo.description : "",
    }));
  return {
    items,
    total_count: Math.min(data.total_count, 1000),
    incomplete_results: !!data.incomplete_results,
  };
}

export async function loadPluginDirectory(
  kind,
  { page = 1, force = false, fetchImpl } = {}
) {
  if (
    !["official", "community"].includes(kind) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 50
  )
    throw new Error("Invalid directory request");
  const key = kind === "official" ? kind : `${kind}:${page}`;
  const cached = readDirectoryCache(key);
  const ttl = kind === "official" ? 60000 : 3600000;
  if (cached?.data && Date.now() - cached.time < (force ? 60000 : ttl)) {
    try {
      return kind === "official"
        ? validateOfficialDirectory(cached.data)
        : validateCommunityDirectory(cached.data);
    } catch {
      /* Ignore an invalid local cache and fetch a fresh directory. */
    }
  }
  const cooldown = readDirectoryCache(kind + ":cooldown");
  if (cooldown?.until > Date.now())
    throw providerError(
      "HTTP_ERROR",
      "GitHub requests are rate limited. Retry later."
    );
  if (
    force &&
    Date.now() - (readDirectoryCache(kind + ":refresh")?.time || 0) < 60000
  )
    throw providerError("HTTP_ERROR", "Please wait before refreshing again.");
  if (inflight.has(key)) return inflight.get(key);
  const write = (cacheKey, value) => {
    try {
      localStorage.setItem(PREFIX + cacheKey, JSON.stringify(value));
    } catch {
      /* Storage is optional. */
    }
  };
  const request = (async () => {
    const refreshTime = Date.now();
    if (force) write(kind + ":refresh", { time: refreshTime });
    try {
      const url =
        kind === "official"
          ? `${OFFICIAL_BASE}catalog.json`
          : `https://api.github.com/search/repositories?q=${encodeURIComponent("topic:kiss-translator-plugin archived:false fork:false")}&sort=updated&order=desc&per_page=20&page=${page}`;
      const data = await fetchDirectoryJson(url, fetchImpl);
      const validated =
        kind === "official"
          ? validateOfficialDirectory(data)
          : validateCommunityDirectory(data);
      write(key, { data: validated, time: Date.now() });
      return validated;
    } catch (error) {
      if (Number.isFinite(error.retryAt) && error.retryAt > Date.now()) {
        write(kind + ":cooldown", {
          time: Date.now(),
          until: error.retryAt,
        });
      } else if (
        force &&
        readDirectoryCache(kind + ":refresh")?.time === refreshTime
      ) {
        try {
          localStorage.removeItem(PREFIX + kind + ":refresh");
        } catch {
          /* Storage is optional. */
        }
      }
      throw error;
    }
  })();
  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

export async function downloadOfficialPlugin(entry, signal, fetchImpl) {
  validateOfficialDirectory({ schemaVersion: 1, plugins: [entry] });
  assertPluginCompatibility(entry);
  const pack = await downloadProviderPackage(entry.downloadUrl, fetchImpl, {
    signal,
    archiveSha256: entry.sha256,
  });
  if (pack.manifest.id !== entry.id || pack.manifest.version !== entry.version)
    throw providerError(
      "INVALID_PACKAGE",
      "Official plugin ID or version mismatch."
    );
  return pack;
}

export function newerPluginVersion(candidate, current) {
  if (
    ![candidate, current].every(
      (value) => typeof value === "string" && /^\d+(\.\d+)*$/.test(value)
    )
  )
    return false;
  const a = candidate.split(".").map(Number),
    b = current.split(".").map(Number);
  if (![...a, ...b].every(Number.isSafeInteger)) return false;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
