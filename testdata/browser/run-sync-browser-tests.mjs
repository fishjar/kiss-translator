import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

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
const origin = process.env.FIXTURE_ORIGIN || "http://127.0.0.1:3134";
const output = resolve(
  process.env.BROWSER_EVIDENCE_DIR || "testdata/browser/evidence"
);
const disableWebLocks = process.env.DISABLE_WEB_LOCKS === "1";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "chrome",
});
const report = [];
const activeContexts = new Set();
let diagnostics = {};
const control = async (body) => {
  const response = await fetch(`${origin}/__fixture__/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
};
const state = async () => (await fetch(`${origin}/__fixture__/state`)).json();
const local = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("KISS-Translator"))
        .map(([key, value]) => [key, JSON.parse(value)])
    )
  );
const poll = async (check, message, timeout = 14000) => {
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
const theme = (page) =>
  page.getByRole("button", {
    name: /Appearance mode:/,
  });
const syncButton = (page) => page.getByRole("button", { name: /^Sync now$/i });
const importWords = (page, words) =>
  page.locator('input[type="file"]').setInputFiles({
    name: "words.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`${words.join("\n")}\n`),
  });
const fresh = async (
  protocol = "KISS-Worker",
  initial = {},
  waitForReady = true
) => {
  await control({ reset: true, ...initial });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "en-US",
  });
  activeContexts.add(context);
  if (disableWebLocks)
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "locks", {
        configurable: true,
        value: undefined,
      });
    });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/__fixture__/start`);
  await page.selectOption("#protocol", protocol);
  await page
    .getByRole("button", { name: "Reset local data and open Options" })
    .click();
  if (waitForReady) await ready(page);
  return { context, page, errors };
};
const run = async (name, test) => {
  diagnostics = {};
  const startedAt = new Date().toISOString();
  try {
    const evidence = await test();
    report.push({ name, passed: true, startedAt, ...evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    const pages = [];
    for (const context of activeContexts) {
      for (const page of context.pages()) {
        try {
          pages.push({
            url: page.url(),
            local: await local(page),
            text: await page.locator("body").innerText(),
          });
          await page.screenshot({
            path: resolve(output, `${name}-failure-${pages.length}.png`),
            fullPage: true,
          });
        } catch {}
      }
    }
    report.push({
      name,
      passed: false,
      startedAt,
      error: error.stack,
      diagnostics,
      pages,
      remote: await state(),
    });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    for (const context of activeContexts) await context.close();
    activeContexts.clear();
    const held = (await state()).gates;
    if (held.length) await control({ release: held });
  }
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2)
  );
};

try {
  const selected = process.argv.slice(2);
  const shouldRun = (name) => !selected.length || selected.includes(name);
  if (shouldRun("inspect"))
    await run("inspect", async () => {
      const { context, page, errors } = await fresh();
      await page.screenshot({
        path: resolve(output, "options-sync.png"),
        fullPage: true,
      });
      const dom = await page.locator("body").innerText();
      await writeFile(resolve(output, "options-sync.txt"), dom);
      console.log(dom);
      const result = {
        local: await local(page),
        remote: await state(),
        errors,
      };
      await context.close();
      return result;
    });
  if (shouldRun("route-unmount"))
    await run("route-unmount", async () => {
      const { context, page, errors } = await fresh();
      await page.locator('a[href="#/words"]').click();
      await ready(page);
      await page.locator('input[type="file"]').setInputFiles({
        name: "words.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("persistence\n"),
      });
      await poll(
        async () => !!(await local(page))["KISS-Translator_words"]?.persistence,
        "Imported word never reached localStorage"
      );
      await page.locator('a[href="#/sync"]').click();
      await poll(
        async () =>
          !!(await state()).remotes.a?.["kiss-words.json"]?.decoded
            ?.persistence,
        "Route unmount discarded the pending word upload"
      );
      const result = {
        local: await local(page),
        remote: await state(),
        errors,
      };
      await page.screenshot({
        path: resolve(output, "route-unmount.png"),
        fullPage: true,
      });
      await context.close();
      return result;
    });
  if (shouldRun("immediate-sync"))
    await run("immediate-sync", async () => {
      const { context, page, errors } = await fresh();
      await page.setViewportSize({ width: 1100, height: 1100 });
      await theme(page).waitFor();
      const changedAt = Date.now();
      await theme(page).click();
      await syncButton(page).click();
      const clickElapsedMs = Date.now() - changedAt;
      assert.ok(
        clickElapsedMs < 300,
        `Manual sync missed the original 300 ms race window (${clickElapsedMs} ms)`
      );
      await poll(
        async () =>
          (await state()).remotes.a?.["kiss-setting_v2.json"]?.decoded
            ?.darkMode === "light",
        "Immediate manual sync did not upload the latest theme"
      );
      const result = {
        clickElapsedMs,
        local: await local(page),
        remote: await state(),
        errors,
      };
      assert.equal(
        result.local["KISS-Translator_setting_v2"].darkMode,
        "light"
      );
      await page.screenshot({
        path: resolve(output, "immediate-sync.png"),
        fullPage: true,
      });
      await context.close();
      return result;
    });
  if (shouldRun("webdav"))
    await run("webdav", async () => {
      const { context, page, errors } = await fresh("WebDAV");
      await page.setViewportSize({ width: 1100, height: 1100 });
      await theme(page).waitFor();
      await theme(page).click();
      await syncButton(page).click();
      await poll(
        async () =>
          (await state()).remotes.a?.["kiss-setting_v2.json"]?.decoded
            ?.darkMode === "light",
        "WebDAV sync did not upload latest theme"
      );
      const result = {
        local: await local(page),
        remote: await state(),
        errors,
      };
      assert.ok(
        result.remote.requests.some((request) => request.method === "PUT")
      );
      assert.ok(result.remote.remotes.a["kiss-setting_v2.json"].encrypted);
      await context.close();
      return result;
    });
  if (shouldRun("metadata-rollback"))
    await run("metadata-rollback", async () => {
      const { context, page, errors } = await fresh();
      await page.setViewportSize({ width: 1100, height: 1100 });
      await theme(page).click();
      await poll(
        async () =>
          (await local(page))["KISS-Translator_setting_v2"]?.darkMode ===
          "light",
        "Theme edit was not persisted"
      );
      await new Promise((resolve) => setTimeout(resolve, 400));
      const before = await local(page);
      const remoteTime = Date.now() + 5000;
      await control({
        seed: [
          {
            target: "a",
            key: "kiss-setting_v2.json",
            updateAt: remoteTime,
            value: {
              ...before["KISS-Translator_setting_v2"],
              darkMode: "dark",
            },
          },
        ],
      });
      // Inject one native storage failure at the accepted remote metadata write.
      // The Options app, network, encryption, and rollback path remain unchanged.
      await page.evaluate(
        ({ remoteTime }) => {
          const original = Storage.prototype.setItem;
          window.fixtureMetadataFailures = 0;
          Storage.prototype.setItem = function (key, value) {
            if (
              key === "KISS-Translator_sync" &&
              JSON.parse(value).syncMeta?.["kiss-setting_v2.json"]?.updateAt ===
                remoteTime &&
              window.fixtureMetadataFailures === 0
            ) {
              window.fixtureMetadataFailures += 1;
              throw new Error("Injected metadata persistence failure");
            }
            return original.call(this, key, value);
          };
        },
        { remoteTime }
      );
      await syncButton(page).click();
      await poll(
        () => page.evaluate(() => window.fixtureMetadataFailures === 1),
        "The intended metadata failure was not reached"
      );
      const afterFailure = await local(page);
      assert.equal(
        afterFailure["KISS-Translator_setting_v2"].darkMode,
        "light",
        "Rollback did not restore the edited theme"
      );
      await poll(
        async () =>
          (await local(page))["KISS-Translator_setting_v2"]?.darkMode ===
          "dark",
        "Automatic retry did not resume after metadata rollback"
      );
      const result = {
        before,
        afterFailure,
        local: await local(page),
        remote: await state(),
        errors,
      };
      await page.screenshot({
        path: resolve(output, "metadata-rollback.png"),
        fullPage: true,
      });
      await context.close();
      return result;
    });
  if (shouldRun("first-sync-failure"))
    await run("first-sync-failure", async () => {
      const { context, page, errors } = await fresh("KISS-Worker", {
        seed: [
          {
            target: "a",
            key: "kiss-words.json",
            updateAt: Date.now() - 1000,
            value: { remote: { createdAt: 1 } },
          },
        ],
        plans: [{ target: "a", key: "kiss-words.json", status: 503 }],
      });
      await page.locator('a[href="#/words"]').click();
      await ready(page);
      await control({
        plans: [
          {
            target: "a",
            key: "kiss-words.json",
            hold: "failed-first-edit",
            status: 503,
          },
        ],
      });
      await importWords(page, ["first"]);
      await poll(
        async () => (await state()).gates.includes("failed-first-edit"),
        "Automatic sync did not reach the held request"
      );
      await importWords(page, ["second"]);
      await poll(
        async () => !!(await local(page))["KISS-Translator_words"]?.second,
        "Second edit was not persisted during pending sync"
      );
      const duringFailure = await local(page);
      await control({ release: ["failed-first-edit"] });
      await poll(async () => {
        const remote = (await state()).remotes.a?.["kiss-words.json"]?.decoded;
        return remote?.first && remote?.second;
      }, "Failed first sync lost an edit made during the request");
      const result = {
        duringFailure,
        local: await local(page),
        remote: await state(),
        errors,
      };
      assert.ok(result.local["KISS-Translator_words"].first);
      assert.ok(result.local["KISS-Translator_words"].second);
      await page.screenshot({
        path: resolve(output, "first-sync-failure.png"),
        fullPage: true,
      });
      await context.close();
      return result;
    });
  if (shouldRun("destination-switch"))
    await run("destination-switch", async () => {
      const { context, page, errors } = await fresh();
      const timestamp = Date.now();
      await control({
        seed: [
          {
            target: "a",
            key: "kiss-words.json",
            updateAt: timestamp + 2000,
            value: { obsolete: { createdAt: 1 } },
          },
          {
            target: "b",
            key: "kiss-words.json",
            updateAt: timestamp + 1000,
            value: { alternate: { createdAt: 2 } },
          },
        ],
        plans: [
          { target: "a", key: "kiss-words.json", hold: "obsolete-target" },
        ],
      });
      await syncButton(page).click();
      await poll(
        async () => (await state()).gates.includes("obsolete-target"),
        "Manual sync did not reach the old target"
      );
      await page.locator('input[name="syncUrl"]').fill(`${origin}/b`);
      await poll(
        async () =>
          (await local(page))["KISS-Translator_sync"]?.syncUrl ===
          `${origin}/b`,
        "New sync target was not persisted"
      );
      await control({ release: ["obsolete-target"] });
      await syncButton(page).waitFor({ state: "visible" });
      await poll(
        async () => await syncButton(page).isEnabled(),
        "Old sync never settled"
      );
      const afterOldReply = await local(page);
      assert.ok(
        !afterOldReply["KISS-Translator_words"]?.obsolete,
        "Obsolete target wrote its response locally"
      );
      await syncButton(page).click();
      await poll(
        async () => !!(await local(page))["KISS-Translator_words"]?.alternate,
        "New target was not adopted"
      );
      const result = {
        afterOldReply,
        local: await local(page),
        remote: await state(),
        errors,
      };
      assert.deepEqual(result.remote.remotes.b["kiss-words.json"].decoded, {
        alternate: { createdAt: 2 },
      });
      await page.screenshot({
        path: resolve(output, "destination-switch.png"),
        fullPage: true,
      });
      await context.close();
      return result;
    });
  if (shouldRun("concurrent-tabs"))
    await run(
      disableWebLocks ? "concurrent-tabs-idb" : "concurrent-tabs",
      async () => {
        const { context, page, errors } = await fresh();
        await page.locator('a[href="#/words"]').click();
        await ready(page);
        const secondPage = await context.newPage();
        await secondPage.setViewportSize({ width: 1100, height: 1100 });
        await secondPage.goto(`${origin}/options.html#/sync`);
        await ready(secondPage);
        const coordination = await page.evaluate(async () => ({
          webLocks: !!navigator.locks,
          databases: await indexedDB.databases(),
        }));
        if (disableWebLocks) {
          assert.equal(
            coordination.webLocks,
            false,
            "Web Locks were not disabled"
          );
          assert.ok(
            coordination.databases.some(
              ({ name }) => name === "kiss-storage-transaction"
            ),
            "The real IndexedDB fallback was not opened"
          );
        } else
          assert.ok(
            coordination.webLocks,
            "Native Web Locks are required for this verification"
          );
        const iterations = [];
        diagnostics.iterations = [];
        for (let index = 0; index < 5; index += 1) {
          const before =
            (await local(page))["KISS-Translator_sync"]?.syncMeta || {};
          const iteration = { index, before };
          diagnostics.iterations.push(iteration);
          await Promise.all([
            importWords(page, [`parallel${String.fromCharCode(97 + index)}`]),
            theme(secondPage).click(),
          ]);
          await poll(
            async () => {
              const meta = (await local(page))["KISS-Translator_sync"]
                ?.syncMeta;
              iteration.latest = meta;
              return (
                meta?.["kiss-setting_v2.json"]?.updateAt >
                  (before["kiss-setting_v2.json"]?.updateAt || 0) &&
                meta?.["kiss-words.json"]?.updateAt >
                  (before["kiss-words.json"]?.updateAt || 0)
              );
            },
            `Concurrent metadata update lost a key on iteration ${index + 1}`
          );
          iterations.push((await local(page))["KISS-Translator_sync"].syncMeta);
        }
        const expected = await local(page);
        await poll(async () => {
          const remote = (await state()).remotes.a;
          return (
            remote?.["kiss-setting_v2.json"]?.decoded?.darkMode ===
              expected["KISS-Translator_setting_v2"].darkMode &&
            Object.keys(remote?.["kiss-words.json"]?.decoded || {}).length === 5
          );
        }, "Two real tabs did not converge to all edits");
        const result = {
          coordination,
          iterations,
          local: await local(page),
          remote: await state(),
          errors,
        };
        await page.screenshot({
          path: resolve(output, "concurrent-tabs-words.png"),
          fullPage: true,
        });
        await secondPage.screenshot({
          path: resolve(output, "concurrent-tabs-sync.png"),
          fullPage: true,
        });
        await context.close();
        return result;
      }
    );
  if (shouldRun("same-tab-multiple-keys"))
    await run("same-tab-multiple-keys", async () => {
      const { context, page, errors } = await fresh();
      await page.locator('a[href="#/words"]').click();
      await ready(page);
      await page.setViewportSize({ width: 1100, height: 1100 });
      const before =
        (await local(page))["KISS-Translator_sync"]?.syncMeta || {};
      const started = Date.now();
      await Promise.all([importWords(page, ["pairwise"]), theme(page).click()]);
      const editElapsedMs = Date.now() - started;
      assert.ok(
        editElapsedMs < 300,
        `Edits missed the original shared debounce window (${editElapsedMs} ms)`
      );
      await poll(async () => {
        const meta = (await local(page))["KISS-Translator_sync"]?.syncMeta;
        return (
          meta?.["kiss-setting_v2.json"]?.updateAt >
            (before["kiss-setting_v2.json"]?.updateAt || 0) &&
          meta?.["kiss-words.json"]?.updateAt >
            (before["kiss-words.json"]?.updateAt || 0)
        );
      }, "Two edits in one page did not preserve both metadata timestamps");
      await poll(async () => {
        const remote = (await state()).remotes.a;
        return (
          remote?.["kiss-setting_v2.json"]?.decoded?.darkMode === "light" &&
          remote?.["kiss-words.json"]?.decoded?.pairwise
        );
      }, "One page lost an upload when editing two storage keys together");
      const result = {
        editElapsedMs,
        local: await local(page),
        remote: await state(),
        errors,
      };
      await page.screenshot({
        path: resolve(output, "same-tab-multiple-keys.png"),
        fullPage: true,
      });
      await context.close();
      return result;
    });
  if (shouldRun("interaction-fallback"))
    await run("interaction-fallback", async () => {
      const { context, page, errors } = await fresh(
        "KISS-Worker",
        {
          plans: [
            {
              target: "a",
              key: "kiss-setting_v2.json",
              hold: "initial-loading",
            },
          ],
        },
        false
      );
      await page.setViewportSize({ width: 1100, height: 1100 });
      await page
        .locator('[data-testid="options-content"][aria-busy="true"]')
        .waitFor();
      await poll(
        async () => (await state()).gates.includes("initial-loading"),
        "Initial sync was not held"
      );
      const before = await local(page);
      // Remove native inert behavior to verify the JavaScript fallback directly.
      await page.evaluate(() => {
        const content = document.querySelector(
          '[data-testid="options-content"]'
        );
        content.removeAttribute("inert");
      });
      const appearance = theme(page);
      const labelBefore = await appearance.getAttribute("aria-label");
      await appearance.focus();
      const focusWasBlurred = await appearance.evaluate(
        (element) => document.activeElement !== element
      );
      assert.ok(
        focusWasBlurred,
        "Fallback let a background button retain keyboard focus"
      );
      await page.keyboard.press("Enter");
      await appearance.dispatchEvent("click");
      await page.locator('input[name="syncUrl"]').dispatchEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      });
      assert.equal(
        await appearance.getAttribute("aria-label"),
        labelBefore,
        "Locked keyboard/click changed the theme"
      );
      assert.deepEqual(
        await local(page),
        before,
        "Locked interactions changed browser storage"
      );
      await page.screenshot({
        path: resolve(output, "interaction-fallback-locked.png"),
        fullPage: true,
      });
      await control({ release: ["initial-loading"] });
      await ready(page);
      await appearance.click();
      await poll(
        async () =>
          (await local(page))["KISS-Translator_setting_v2"]?.darkMode ===
          "light",
        "Controls did not unlock after startup sync"
      );
      const result = {
        focusWasBlurred,
        before,
        local: await local(page),
        remote: await state(),
        errors,
      };
      await page.screenshot({
        path: resolve(output, "interaction-fallback-unlocked.png"),
        fullPage: true,
      });
      await context.close();
      return result;
    });
} finally {
  await browser.close();
}
if (report.some((result) => !result.passed)) process.exitCode = 1;
