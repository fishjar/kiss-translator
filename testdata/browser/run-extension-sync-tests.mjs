import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright"));
} catch (error) {
  throw new Error(
    "Playwright is unavailable. Install it or set PLAYWRIGHT_PATH to its package directory; see testdata/browser/README.md.",
    { cause: error }
  );
}
const origin = process.env.FIXTURE_ORIGIN || "http://127.0.0.1:3136";
const extensionPath = resolve(
  process.env.EXTENSION_BUILD_PATH || "testdata/browser/extension-build"
);
const output = resolve(
  process.env.BROWSER_EVIDENCE_DIR || "testdata/browser/evidence/extension"
);
const profile = resolve(`testdata/browser/profiles/extension-${Date.now()}`);
const executablePath =
  process.env.CHROMIUM_EXECUTABLE || chromium.executablePath();
await mkdir(output, { recursive: true });
await mkdir(profile, { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  executablePath,
  headless: true,
  viewport: { width: 1440, height: 1100 },
  locale: "en-US",
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});
const errors = [];
context.on("page", (page) =>
  page.on("pageerror", (error) => errors.push(error.message))
);
const state = async () => (await fetch(`${origin}/__fixture__/state`)).json();
const poll = async (check, message, timeout = 20000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
};
const ready = (page) =>
  page
    .locator('[data-testid="options-content"][aria-busy="false"]')
    .waitFor({ timeout: 60000 });
let worker;
let result;
try {
  const response = await fetch(`${origin}/__fixture__/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reset: true }),
  });
  assert.equal(response.status, 200);
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 30000 }));
  const extensionId = new URL(worker.url()).hostname;
  const stored = () =>
    worker.evaluate(async () =>
      Object.fromEntries(
        Object.entries(await chrome.storage.local.get(null))
          .filter(([key]) => key.startsWith("KISS-Translator"))
          .map(([key, value]) => {
            try {
              return [key, JSON.parse(value)];
            } catch {
              return [key, value];
            }
          })
      )
    );
  await poll(
    async () => !!(await stored())["KISS-Translator_sync"],
    "Extension install initialization never completed"
  );
  for (const page of context.pages()) await page.close();
  await worker.evaluate(
    async ({ origin }) => {
      // Observe the existing coordinator without replacing its implementation.
      globalThis.fixtureCoordinatorEvents = [];
      let nextConnection = 0;
      chrome.runtime.onConnect.addListener((port) => {
        if (port.name !== "kiss-storage-transaction") return;
        const connection = ++nextConnection;
        globalThis.fixtureCoordinatorEvents.push({
          event: "connect",
          connection,
          tab: port.sender?.tab?.id,
          documentId: port.sender?.documentId,
          url: port.sender?.url,
          at: Date.now(),
        });
        port.onMessage.addListener((message) => {
          globalThis.fixtureCoordinatorEvents.push({
            event: message.type,
            connection,
            at: Date.now(),
            keys: message.entries?.map(({ key }) => key),
          });
        });
        port.onDisconnect.addListener(() =>
          globalThis.fixtureCoordinatorEvents.push({
            event: "disconnect",
            connection,
            at: Date.now(),
          })
        );
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local")
          globalThis.fixtureCoordinatorEvents.push({
            event: "storage-changed",
            keys: Object.keys(changes),
            at: Date.now(),
          });
      });
      await chrome.storage.local.set({
        "KISS-Translator_sync": JSON.stringify({
          syncType: "KISS-Worker",
          syncUrl: `${origin}/a`,
          syncUser: "browser-review",
          syncKey: "browser-review-token",
          syncEncryptKey: "browser-review-secret",
          syncMeta: {},
          dataCaches: {},
          subRulesSyncAt: 0,
        }),
      });
    },
    { origin }
  );
  const firstPage = await context.newPage();
  await firstPage.goto(`chrome-extension://${extensionId}/options.html#/words`);
  await ready(firstPage);
  const secondPage = await context.newPage();
  await secondPage.setViewportSize({ width: 1100, height: 1100 });
  await secondPage.goto(`chrome-extension://${extensionId}/options.html#/sync`);
  await ready(secondPage);
  const iterations = [];
  for (let index = 0; index < 5; index += 1) {
    const before = (await stored())["KISS-Translator_sync"].syncMeta;
    await Promise.all([
      firstPage.locator('input[type="file"]').setInputFiles({
        name: "words.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(`extension${String.fromCharCode(97 + index)}\n`),
      }),
      secondPage.getByRole("button", { name: /Appearance mode:/ }).click(),
    ]);
    await poll(
      async () => {
        const meta = (await stored())["KISS-Translator_sync"].syncMeta;
        return (
          meta["kiss-setting_v2.json"].updateAt >
            (before["kiss-setting_v2.json"]?.updateAt || 0) &&
          meta["kiss-words.json"].updateAt >
            (before["kiss-words.json"]?.updateAt || 0)
        );
      },
      `Background coordination lost concurrent metadata on iteration ${index + 1}`
    );
    iterations.push((await stored())["KISS-Translator_sync"].syncMeta);
  }
  const expected = await stored();
  await poll(async () => {
    const remote = (await state()).remotes.a;
    return (
      remote?.["kiss-setting_v2.json"]?.decoded?.darkMode ===
        expected["KISS-Translator_setting_v2"].darkMode &&
      Object.keys(remote?.["kiss-words.json"]?.decoded || {}).length === 5
    );
  }, "Packaged extension did not upload all edits from two Options tabs");
  const events = await worker.evaluate(
    () => globalThis.fixtureCoordinatorEvents
  );
  const commitEvents = events.filter(({ event }) => event === "commit");
  assert.ok(
    commitEvents.some(
      ({ keys }) =>
        keys.includes("KISS-Translator_words") &&
        keys.includes("KISS-Translator_sync")
    ),
    "Words were not committed through the production background coordinator"
  );
  assert.ok(
    commitEvents.some(
      ({ keys }) =>
        keys.includes("KISS-Translator_setting_v2") &&
        keys.includes("KISS-Translator_sync")
    ),
    "Settings were not committed through the production background coordinator"
  );
  assert.ok(
    new Set(
      events
        .filter(
          ({ event, url }) =>
            event === "connect" && url?.includes("options.html")
        )
        .map(({ documentId, tab, url }) => documentId || tab || url)
    ).size >= 2,
    "Coordinator did not observe both real Options tabs"
  );
  assert.equal(errors.length, 0);
  const hashes = Object.fromEntries(
    await Promise.all(
      ["background.js", "options.js", "manifest.json"].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(resolve(extensionPath, file)))
          .digest("hex"),
      ])
    )
  );
  result = {
    name: "extension-background-concurrent-tabs",
    passed: true,
    extensionId,
    profile,
    executablePath,
    hashes,
    iterations,
    coordinatorEvents: events,
    local: await stored(),
    remote: await state(),
    errors,
  };
  await firstPage.screenshot({
    path: resolve(output, "extension-words.png"),
    fullPage: true,
  });
  await secondPage.screenshot({
    path: resolve(output, "extension-sync.png"),
    fullPage: true,
  });
  console.log(
    `PASS extension-background-concurrent-tabs (${commitEvents.length} observed background commits)`
  );
} catch (error) {
  result = {
    name: "extension-background-concurrent-tabs",
    passed: false,
    profile,
    executablePath,
    error: error.stack,
    remote: await state(),
    errors,
  };
  if (worker) {
    try {
      result.coordinatorEvents = await worker.evaluate(
        () => globalThis.fixtureCoordinatorEvents
      );
    } catch {}
  }
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(result, null, 2)
  );
  await context.close();
}
