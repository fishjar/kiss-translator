import { zipSync, strToU8 } from "fflate";
import { TextDecoder } from "util";
import {
  downloadProviderSource,
  parsePackageSource,
  checkPackageReplacement,
} from "./packageSource";
import { readProviderPackage } from "./package";

beforeAll(() => {
  global.TextDecoder = TextDecoder;
});
const sha = "a".repeat(40);
const manifest = {
  manifestVersion: 1,
  apiVersion: "1",
  id: "source-example",
  version: "1.0.0",
  services: [
    {
      id: "chat",
      implementation: { kind: "script", entry: "chat.js" },
      capabilities: { chat: { handler: "chat" } },
    },
  ],
};
const files = {
  "manifest.json": strToU8(JSON.stringify(manifest)),
  "chat.js": strToU8("exports.chat=()=>({text:'ok'});"),
};
const archive = zipSync(
  Object.fromEntries(
    Object.entries(files).map(([key, value]) => [
      `repository-${sha}/${key}`,
      value,
    ])
  )
);
function response(data) {
  const bytes =
    data instanceof Uint8Array ? data : strToU8(JSON.stringify(data));
  let sent = false;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () =>
          sent
            ? { done: true }
            : ((sent = true), { done: false, value: bytes }),
        cancel: async () => {},
        releaseLock() {},
      }),
    },
  };
}
test("GitHub follows the actual default branch once and restores the pinned commit without lookups", async () => {
  const fetchImpl = jest.fn(async (url) =>
    url.endsWith("/branches/development")
      ? response({ commit: { sha } })
      : url.startsWith("https://api.github.com")
        ? response({ default_branch: "development", private: false })
        : response(archive)
  );
  const pack = await downloadProviderSource(
    "https://github.com/owner/repository.git/",
    fetchImpl
  );
  expect(pack.source).toEqual({
    kind: "github",
    repoUrl: "https://github.com/owner/repository",
    commitSha: sha,
  });
  expect(pack.implementations.chat).toContain("exports.chat");
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "https://api.github.com/repos/owner/repository",
    "https://api.github.com/repos/owner/repository/branches/development",
    `https://codeload.github.com/owner/repository/zip/${sha}`,
  ]);
  fetchImpl.mockClear();
  await downloadProviderSource(pack.source, fetchImpl, { restore: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    redirect: "error",
  });
});
test("plain ZIP addresses retain source and archive normalization never searches nested projects", async () => {
  expect(
    (
      await downloadProviderSource(
        "https://example.invalid/download?id=1",
        async () => response(zipSync(files))
      )
    ).source
  ).toEqual({ kind: "zip", url: "https://example.invalid/download?id=1" });
  expect(() =>
    readProviderPackage(
      zipSync({
        "repo/sub/manifest.json": files["manifest.json"],
        "repo/sub/chat.js": files["chat.js"],
      }),
      { githubArchive: true }
    )
  ).toThrow("manifest.json");
  expect(() =>
    parsePackageSource("https://github.com/owner/repository/tree/main")
  ).toThrow();
});
test("updates require identity and increasing manifest version, unchanged content is a no-op", () => {
  const previous = { manifest, integrity: "old" };
  expect(checkPackageReplacement(previous, { ...previous })).toBe(false);
  for (const change of [
    { id: "different", version: "2.0.0" },
    { version: "0.9.0" },
    { version: "1.0.0" },
  ])
    expect(() =>
      checkPackageReplacement(previous, {
        manifest: { ...manifest, ...change },
        integrity: "new",
      })
    ).toThrow();
  expect(
    checkPackageReplacement(previous, {
      manifest: { ...manifest, version: "1.1.0" },
      integrity: "new",
    })
  ).toBe(true);
});
test("metadata errors and hanging lookup share one abortable deadline", async () => {
  await expect(
    downloadProviderSource("https://github.com/owner/repository", async () => ({
      ok: false,
      status: 403,
    }))
  ).rejects.toMatchObject({ code: "HTTP_ERROR" });
  jest.useFakeTimers();
  try {
    const controller = new AbortController();
    const result = downloadProviderSource(
      "https://github.com/owner/repository",
      () => new Promise(() => {}),
      { timeoutMs: 50, signal: controller.signal }
    );
    const rejected = expect(result).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    jest.advanceTimersByTime(50);
    await rejected;
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
