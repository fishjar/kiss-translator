import { webcrypto, createHash } from "crypto";
import { zipSync, strToU8 } from "fflate";
import {
  OFFICIAL_BASE,
  validateOfficialDirectory,
  validateCommunityDirectory,
  loadPluginDirectory,
  downloadOfficialPlugin,
  fetchDirectoryJson,
  newerPluginVersion,
} from "./pluginDirectory";
import { readProviderPackage } from "./package";
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder ||= TextEncoder;
global.TextDecoder ||= TextDecoder;
Object.defineProperty(global, "crypto", {
  configurable: true,
  value: webcrypto,
});
const manifest = {
  manifestVersion: 1,
  apiVersion: "1",
  id: "test-plugin",
  name: "Test plugin",
  version: "1.0.0",
  services: [
    {
      id: "chat",
      implementation: { kind: "script", entry: "chat.js" },
      capabilities: { chat: { handler: "chat" } },
    },
  ],
};
const bytes = zipSync({
  "manifest.json": strToU8(JSON.stringify(manifest)),
  "chat.js": strToU8("exports.chat = () => ({text:'ok'})"),
});
const catalog = {
  schemaVersion: 1,
  plugins: [
    {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      capabilities: ["chat"],
      downloadUrl: `${OFFICIAL_BASE}${manifest.id}/${manifest.version}.zip`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  ],
};

test("catalog preserves unsupported declarations for explanation, while installation refuses before download", async () => {
  const entry = {
    ...catalog.plugins[0],
    kind: "page",
    minHostVersion: "999999.0.0",
  };
  expect(
    validateOfficialDirectory({ schemaVersion: 1, plugins: [entry] }).plugins[0]
  ).toEqual(entry);
  const fetchImpl = jest.fn();
  await expect(
    downloadOfficialPlugin(entry, undefined, fetchImpl)
  ).rejects.toMatchObject({ code: "UNSUPPORTED_PLUGIN_KIND" });
  expect(fetchImpl).not.toHaveBeenCalled();
});
const stream = (bytes) => ({
  ok: true,
  body: {
    getReader: () => {
      let sent = false;
      return {
        read: async () =>
          sent
            ? { done: true }
            : ((sent = true), { value: new Uint8Array(bytes), done: false }),
        cancel: async () => {},
        releaseLock() {},
      };
    },
  },
});
const json = (data) => stream(new TextEncoder().encode(JSON.stringify(data)));
beforeEach(() => localStorage.clear());

test("official directory accepts only the configured origin, exact paths and unique IDs", () => {
  expect(validateOfficialDirectory(catalog)).toEqual(catalog);
  for (const change of [
    { downloadUrl: "https://evil.invalid/package.zip" },
    { downloadUrl: `${OFFICIAL_BASE}../package.zip` },
    { sha256: "bad" },
    { apiVersion: "99" },
  ]) {
    expect(() =>
      validateOfficialDirectory({
        schemaVersion: 1,
        plugins: [{ ...catalog.plugins[0], ...change }],
      })
    ).toThrow();
  }
  expect(() =>
    validateOfficialDirectory({
      schemaVersion: 1,
      plugins: [catalog.plugins[0], catalog.plugins[0]],
    })
  ).toThrow();
});

test.each(catalog.plugins)(
  "$id archive passes the production parser and verified official download",
  async (entry) => {
    const pack = readProviderPackage(new Uint8Array(bytes));
    expect(pack.manifest.id).toBe(entry.id);
    const fetchImpl = jest.fn(async () => stream(bytes));
    const downloaded = await downloadOfficialPlugin(
      entry,
      undefined,
      fetchImpl
    );
    expect(downloaded.manifest.id).toBe(entry.id);
    expect(downloaded.source.archiveSha256).toBe(entry.sha256);
    expect(fetchImpl).toHaveBeenCalledWith(
      entry.downloadUrl,
      expect.objectContaining({ credentials: "omit", redirect: "error" })
    );
    await expect(
      downloadOfficialPlugin(
        { ...entry, sha256: "0".repeat(64) },
        undefined,
        fetchImpl
      )
    ).rejects.toMatchObject({ code: "INVALID_PACKAGE" });
    await expect(
      downloadOfficialPlugin(
        {
          ...entry,
          id: "different",
          downloadUrl: `${OFFICIAL_BASE}different/${entry.version}.zip`,
        },
        undefined,
        fetchImpl
      )
    ).rejects.toMatchObject({ code: "INVALID_PACKAGE" });
    await expect(
      downloadOfficialPlugin(
        {
          ...entry,
          version: "2.0.0",
          downloadUrl: `${OFFICIAL_BASE}${entry.id}/2.0.0.zip`,
        },
        undefined,
        fetchImpl
      )
    ).rejects.toMatchObject({ code: "INVALID_PACKAGE" });
  }
);

test("community discovery filters official, archived, forked, invalid and duplicate repositories", () => {
  const repo = (full_name, extra = {}) => ({
    full_name,
    html_url: `https://github.com/${full_name}`,
    ...extra,
  });
  const result = validateCommunityDirectory({
    total_count: 9,
    items: [
      repo("author/plugin"),
      repo("AUTHOR/PLUGIN"),
      repo("fishjar/kiss-translator-plugins"),
      repo("a/fork", { fork: true }),
      repo("a/old", { archived: true }),
      repo("../evil"),
      repo("a/evil", { html_url: "https://evil.invalid" }),
    ],
  });
  expect(result.items.map((item) => item.full_name)).toEqual(["author/plugin"]);
});

test("discovery caches each page, uses topic search and deduplicates concurrent requests", async () => {
  const fetchImpl = jest.fn(async () => json({ total_count: 21, items: [] }));
  await Promise.all([
    loadPluginDirectory("community", { fetchImpl }),
    loadPluginDirectory("community", { fetchImpl }),
  ]);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(decodeURIComponent(fetchImpl.mock.calls[0][0])).toContain(
    "topic:kiss-translator-plugin archived:false fork:false"
  );
  await loadPluginDirectory("community", { fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await loadPluginDirectory("community", { page: 2, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls[1][0]).toContain("page=2");
});

test("failed refresh preserves cached data and respects GitHub Retry-After", async () => {
  localStorage.setItem(
    "kiss-plugin-directory-v1:official",
    JSON.stringify({ data: catalog, time: 1 })
  );
  const fetchImpl = jest.fn(async () => ({
    ok: false,
    status: 429,
    headers: { get: (name) => (name === "retry-after" ? "120" : null) },
  }));
  await expect(
    loadPluginDirectory("official", { force: true, fetchImpl })
  ).rejects.toMatchObject({ retryAt: expect.any(Number) });
  expect(
    JSON.parse(localStorage.getItem("kiss-plugin-directory-v1:official")).data
  ).toEqual(catalog);
  await expect(
    loadPluginDirectory("official", { force: true, fetchImpl })
  ).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("metadata size is bounded", async () => {
  await expect(
    fetchDirectoryJson("https://example.invalid", async () =>
      stream(new Uint8Array(1024 * 1024 + 1))
    )
  ).rejects.toMatchObject({ code: "RESOURCE_BUDGET_EXCEEDED" });
});

test("metadata timeout also settles transports that ignore cancellation", async () => {
  jest.useFakeTimers();
  try {
    const request = fetchDirectoryJson(
      "https://example.invalid",
      () => new Promise(() => {})
    );
    jest.advanceTimersByTime(15000);
    await expect(request).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("versions compare numerically", () => {
  expect(newerPluginVersion("1.10.0", "1.9.9")).toBe(true);
  expect(newerPluginVersion("1.2.0", "2.0.0")).toBe(false);
  expect(newerPluginVersion("1.2.0", "1.2.0")).toBe(false);
});

test.each([
  ["1.0.1", "1.0", true],
  ["1.0", "1.0.1", false],
  ["1", "1.0.0", false],
  ["1.0.0", "1", false],
  ["1.0.0.1", "1.0.0", true],
  ["1.10", "1.9.9", true],
  ["2", "1.99.99", true],
])(
  "compares numeric versions %s > %s as %s",
  (candidate, current, expected) => {
    expect(newerPluginVersion(candidate, current)).toBe(expected);
  }
);

test.each([
  undefined,
  null,
  1,
  {},
  "",
  "v1.0.0",
  "1.0.0-beta",
  "1..0",
  "1.0.",
  "-1.0",
  " 1.0",
  "9007199254740992.0.0",
])("invalid version %j cannot claim an update", (version) => {
  expect(newerPluginVersion(version, "1.0.0")).toBe(false);
  expect(newerPluginVersion("2.0.0", version)).toBe(false);
});

test.each(["network", "timeout", "http", "invalid", "invalid-retry"])(
  "a failed %s refresh preserves cache and permits immediate retry",
  async (failure) => {
    const cacheKey = "kiss-plugin-directory-v1:official";
    const cached = JSON.stringify({ data: catalog, time: 1 });
    localStorage.setItem(cacheKey, cached);
    const error = Object.assign(new Error("Failed to fetch"), {
      ...(failure === "invalid-retry" && { retryAt: Infinity }),
    });
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(() => {
        if (failure === "http") return { ok: false, status: 500 };
        if (failure === "invalid") return json({ schemaVersion: 999 });
        if (failure === "timeout") return new Promise(() => {});
        throw error;
      })
      .mockImplementation(async () => json(catalog));
    if (failure === "timeout") jest.useFakeTimers();
    try {
      const request = loadPluginDirectory("official", {
        force: true,
        fetchImpl,
      });
      const rejected = request.catch((error) => error);
      if (failure === "timeout") jest.advanceTimersByTime(15000);
      const failureError = await rejected;
      expect(failureError).toBeInstanceOf(Error);
      expect(failureError).toMatchObject(
        failure === "timeout"
          ? { code: "REQUEST_TIMEOUT" }
          : failure === "http"
            ? { code: "HTTP_ERROR" }
            : failure === "invalid"
              ? { code: "INVALID_PACKAGE" }
              : { message: "Failed to fetch" }
      );
      expect(localStorage.getItem(cacheKey)).toBe(cached);
      expect(
        localStorage.getItem("kiss-plugin-directory-v1:official:cooldown")
      ).toBeNull();
      await expect(
        loadPluginDirectory("official", { force: true, fetchImpl })
      ).resolves.toEqual(catalog);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  }
);

test.each([403, 429])(
  "HTTP %s honors the rate limit reset across pages",
  async (status) => {
    jest.useFakeTimers();
    try {
      const now = Date.now();
      const reset = Math.ceil((now + 180000) / 1000) * 1000;
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status,
          headers: {
            get: (name) =>
              ({
                "retry-after": "120",
                "x-ratelimit-reset": String(reset / 1000),
              })[name] || null,
          },
        })
        .mockImplementation(async () => json({ items: [], total_count: 0 }));
      await expect(
        loadPluginDirectory("community", { force: true, fetchImpl })
      ).rejects.toMatchObject({ retryAt: reset });
      jest.advanceTimersByTime(120000);
      await expect(
        loadPluginDirectory("community", { page: 2, fetchImpl })
      ).rejects.toThrow("rate limited");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(reset - Date.now());
      await expect(
        loadPluginDirectory("community", { page: 2, fetchImpl })
      ).resolves.toMatchObject({ items: [] });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  }
);

test("successful manual refresh still throttles other pages for 60 seconds", async () => {
  const fetchImpl = jest.fn(async () => json({ items: [], total_count: 0 }));
  await loadPluginDirectory("community", { force: true, fetchImpl });
  await expect(
    loadPluginDirectory("community", { page: 2, force: true, fetchImpl })
  ).rejects.toThrow("Please wait");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
