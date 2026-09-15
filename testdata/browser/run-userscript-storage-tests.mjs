import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const webOrigin = process.env.FIXTURE_ORIGIN || "http://127.0.0.1:3154";
const gmOrigin = process.env.GM_FIXTURE_ORIGIN || "http://127.0.0.1:3157";
const gmOtherOrigin = process.env.GM_SECOND_ORIGIN || "http://127.0.0.1:3158";
const output = resolve(
  process.env.BROWSER_EVIDENCE_DIR ||
    "testdata/browser/evidence/userscript-storage"
);
const STOKEY_SYNC = "KISS-Translator_sync";
const STOKEY_WORDS = "KISS-Translator_words";
const STOKEY_SETTING = "KISS-Translator_setting_v2";
const WORDS_KEY = "kiss-words.json";
const passphrase = "browser-review-secret";
const report = [];
const contexts = new Set();
const contextErrors = new Map();
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "chrome",
});
const control = async (body) => {
  const response = await fetch(`${webOrigin}/__fixture__/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
};
const state = async () =>
  (await fetch(`${webOrigin}/__fixture__/state`)).json();
const local = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("KISS-Translator"))
        .map(([key, value]) => [key, JSON.parse(value)])
    )
  );
const poll = async (check, message, timeout = 20000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(message);
};
const ready = (page) =>
  page
    .locator('[data-testid="options-content"][aria-busy="false"]')
    .waitFor({ timeout: 120000 });
const importWords = (page, words) =>
  page.locator('input[type="file"]').setInputFiles({
    name: "words.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`${words.join("\n")}\n`),
  });
const syncButton = (page) => page.getByRole("button", { name: /^Sync now$/i });
const stored = (backend, key) => JSON.parse(backend.values.get(key) || "null");
const assertLegacyStorage = (backend) => {
  const keys = new Set([
    ...backend.values.keys(),
    ...backend.calls.map(({ args }) => args.key).filter(Boolean),
  ]);
  assert.deepEqual(
    [...keys].filter((key) => /:(record|ack):/.test(key)),
    [],
    "The application accessed a new record/ack storage key"
  );
};
const newContext = async () => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    locale: "en-US",
  });
  contexts.add(context);
  const errors = [];
  contextErrors.set(context, errors);
  context.on("page", (page) =>
    page.on("pageerror", (error) =>
      errors.push({ url: page.url(), message: error.message })
    )
  );
  return context;
};
const snapshot = (backend) => ({
  values: Object.fromEntries(
    [...backend.values].map(([key, value]) => [key, JSON.parse(value)])
  ),
  calls: backend.calls.map((entry) => ({ ...entry })),
});

// Simulate only the privileged GM transport. The Options bundle installs its
// real adaptScript bridge and runs unchanged startup, hooks, and storage code.
// The shared asynchronous backend spans origins and deliberately offers no CAS.
const gmBackend = () => {
  const values = new Map([
    [
      STOKEY_SYNC,
      JSON.stringify({
        syncType: "",
        syncUrl: "https://destination-a.invalid",
        syncUser: "user-a",
        syncKey: "",
        syncEncryptKey: "passphrase-a",
        syncMeta: {},
        dataCaches: {},
        subRulesSyncAt: 0,
      }),
    ],
    [STOKEY_WORDS, JSON.stringify({ legacyword: { createdAt: 1 } })],
  ]);
  const calls = [];
  let gate;
  return {
    values,
    calls,
    pauseNextConfigRead(origin) {
      let resolvePaused;
      let resume;
      const paused = new Promise((resolve) => {
        resolvePaused = resolve;
      });
      const resumed = new Promise((resolve) => {
        resume = resolve;
      });
      gate = { origin, paused, resumed, resolvePaused, resume, used: false };
      return gate;
    },
    release() {
      gate?.resume();
    },
    async call(source, { action, args = {} }) {
      const origin = new URL(source.page.url()).origin;
      const call = {
        index: calls.length,
        origin,
        action,
        args,
        startedAt: Date.now(),
      };
      calls.push(call);
      if (action === "getValue") {
        const captured = values.get(args.key);
        if (
          args.key === STOKEY_SYNC &&
          gate &&
          !gate.used &&
          gate.origin === origin
        ) {
          gate.used = true;
          call.held = true;
          gate.resolvePaused();
          await gate.resumed;
          call.releasedAt = Date.now();
        }
        call.result = captured;
        call.finishedAt = Date.now();
        return captured;
      }
      if (action === "setValue") values.set(args.key, args.val);
      else if (action === "deleteValue") values.delete(args.key);
      else if (action === "info")
        return {
          script: { name: "KISS Translator", version: "2.0.31" },
          scriptHandler: "Browser verification fixture",
        };
      else throw new Error(`Unexpected fixture GM action: ${action}`);
      call.finishedAt = Date.now();
      return null;
    },
  };
};
const gmPage = async (
  context,
  backend,
  { origin = gmOrigin, route = "words" } = {}
) => {
  const page = await context.newPage();
  await page.exposeBinding("fixtureGmCall", (source, details) =>
    backend.call(source, details)
  );
  await page.addInitScript(() => {
    const eventName = "kiss-browser-fixture-gm";
    window.APP_INFO = {
      name: "KISS Translator",
      version: "2.0.31",
      eventName,
    };
    window.GM = {
      getValue: (key) =>
        window.fixtureGmCall({ action: "getValue", args: { key } }),
      setValue: (key, val) =>
        window.fixtureGmCall({ action: "setValue", args: { key, val } }),
    };
    window.addEventListener(eventName, async ({ detail }) => {
      try {
        const data = await window.fixtureGmCall(detail);
        window.dispatchEvent(
          new CustomEvent(detail.pong, { detail: { data } })
        );
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent(detail.pong, { detail: { error: error.message } })
        );
      }
    });
  });
  await page.goto(`${origin}/options.html#/${route}`);
  return page;
};

const run = async (name, test) => {
  const startedAt = new Date().toISOString();
  try {
    const result = await test();
    const errors = [...contexts].flatMap((context) =>
      contextErrors.get(context)
    );
    assert.deepEqual(
      errors,
      [],
      "The browser reported an unhandled page error"
    );
    report.push({
      name,
      passed: true,
      startedAt,
      browserVersion: browser.version(),
      ...result,
      errors,
    });
    console.log(`PASS ${name}`);
  } catch (error) {
    const pages = [];
    for (const context of contexts)
      for (const page of context.pages()) {
        try {
          pages.push({
            url: page.url(),
            text: await page.locator("body").innerText(),
            local: await local(page),
          });
          await page.screenshot({
            path: resolve(output, `${name}-failure-${pages.length}.png`),
            fullPage: true,
          });
        } catch {}
      }
    const failure = {
      name,
      passed: false,
      startedAt,
      error: error.stack,
      pages,
    };
    report.push(failure);
    await writeFile(
      resolve(output, `${name}-failure-${startedAt.replaceAll(":", "-")}.json`),
      JSON.stringify(failure, null, 2)
    );
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    for (const context of contexts) await context.close();
    contexts.clear();
    contextErrors.clear();
    await writeFile(
      resolve(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
  }
};

try {
  const selected = process.argv.slice(2);
  const shouldRun = (name) => !selected.length || selected.includes(name);
  if (shouldRun("wrong-passphrase"))
    await run("wrong-passphrase", async () => {
      const context = await newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await control({ reset: true });
      await page.goto(`${webOrigin}/__fixture__/start`);
      await page
        .getByRole("button", { name: "Reset local data and open Options" })
        .click();
      await ready(page);
      const validDefaults = await state();
      const seeded = await control({
        reset: true,
        seed: [
          {
            target: "a",
            key: WORDS_KEY,
            value: { cloudbackup: { createdAt: 42 } },
            updateAt: Date.now() - 60000,
          },
          {
            target: "a",
            key: "kiss-setting_v2.json",
            value: validDefaults.remotes.a["kiss-setting_v2.json"].decoded,
            updateAt: Date.now() - 60000,
          },
          {
            target: "a",
            key: "kiss-rules_v2.json",
            value: validDefaults.remotes.a["kiss-rules_v2.json"].decoded,
            updateAt: Date.now() - 60000,
          },
        ],
      });
      const originalPacket = seeded.remotes.a[WORDS_KEY].value;
      await page.goto(`${webOrigin}/__fixture__/start`);
      await page.evaluate(
        ({ origin, key }) => {
          localStorage.clear();
          localStorage.setItem(
            key,
            JSON.stringify({
              syncType: "KISS-Worker",
              syncUrl: `${origin}/a`,
              syncUser: "browser-review",
              syncKey: "browser-review-token",
              syncEncryptKey: "incorrect-passphrase",
              syncMeta: {},
              dataCaches: {},
              subRulesSyncAt: 0,
            })
          );
        },
        { origin: webOrigin, key: STOKEY_SYNC }
      );
      await page.goto(`${webOrigin}/options.html#/words`);
      await ready(page);
      await importWords(page, ["localafterfailure"]);
      await poll(
        async () =>
          (await state()).requests.filter((entry) => entry.key === WORDS_KEY)
            .length >= 2,
        "The automatic retry was not reached after editing with the wrong passphrase"
      );
      await importWords(page, ["secondlocaledit"]);
      await poll(
        async () =>
          (await state()).requests.filter((entry) => entry.key === WORDS_KEY)
            .length >= 3,
        "The second automatic retry was not reached with the wrong passphrase"
      );
      await page.locator('a[href="#/sync"]').click();
      await ready(page);
      const requestsBeforeManual = (await state()).requests.length;
      await syncButton(page).click();
      await poll(
        async () => (await state()).requests.length > requestsBeforeManual,
        "The manual retry was not reached with the wrong passphrase"
      );
      await poll(
        () => syncButton(page).isEnabled(),
        "The failed manual sync did not settle"
      );
      const failedState = await state();
      assert.equal(
        failedState.remotes.a[WORDS_KEY].value,
        originalPacket,
        "Wrong-passphrase retries replaced the original encrypted cloud backup"
      );
      assert.deepEqual(failedState.remotes.a[WORDS_KEY].decoded, {
        cloudbackup: { createdAt: 42 },
      });
      assert.ok(
        failedState.requests
          .filter((entry) => entry.key === WORDS_KEY)
          .every((entry) => !entry.uploaded),
        "A retry uploaded unverified local content"
      );
      const afterFailure = await local(page);
      assert.ok(
        afterFailure[STOKEY_WORDS].localafterfailure,
        "Failed decryption lost the local edit"
      );
      await page.screenshot({
        path: resolve(output, "wrong-passphrase-protected.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Clear local passphrase", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Clear passphrase", exact: true })
        .click();
      await poll(
        async () => (await local(page))[STOKEY_SYNC].syncEncryptKey === "",
        "The obsolete local passphrase was not cleared"
      );
      await page
        .getByRole("button", { name: "Encryption Passphrase", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("New Passphrase", { exact: true })
        .fill(passphrase);
      await dialog
        .getByLabel("Confirm Passphrase", { exact: true })
        .fill(passphrase);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await poll(
        async () =>
          (await local(page))[STOKEY_SYNC].syncEncryptKey === passphrase,
        "Corrected passphrase did not persist"
      );
      await syncButton(page).click();
      await poll(
        async () => !!(await local(page))[STOKEY_WORDS]?.cloudbackup,
        "Corrected passphrase did not recover the original cloud backup"
      );
      await poll(
        () => syncButton(page).isEnabled(),
        "The successful sync did not settle"
      );
      await page.locator('a[href="#/words"]').click();
      await ready(page);
      await importWords(page, ["aftercorrection"]);
      await poll(
        async () =>
          !!(await state()).remotes.a?.[WORDS_KEY]?.decoded?.aftercorrection,
        "Uploads did not recover after validating the corrected passphrase"
      );
      const remote = await state();
      assert.ok(remote.remotes.a[WORDS_KEY].decoded.cloudbackup);
      await page.screenshot({
        path: resolve(output, "wrong-passphrase-recovered.png"),
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      return {
        originalPacket,
        afterFailure,
        failedState,
        local: await local(page),
        remote,
        errors,
      };
    });
  if (shouldRun("legacy-bridge"))
    await run("legacy-bridge", async () => {
      const context = await newContext();
      const backend = gmBackend();
      const page = await gmPage(context, backend);
      await ready(page);
      await page.getByText("legacyword", { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => "storageProtocol" in window.APP_INFO),
        false
      );
      assert.ok(backend.calls.length > 0, "The existing bridge was not used");
      assertLegacyStorage(backend);
      await page.screenshot({
        path: resolve(output, "legacy-bridge-accepted.png"),
        fullPage: true,
      });
      return {
        pageText: await page.locator("body").innerText(),
        backend: snapshot(backend),
      };
    });
  if (shouldRun("legacy-storage-interop"))
    await run("legacy-storage-interop", async () => {
      const context = await newContext();
      const backend = gmBackend();
      const page = await gmPage(context, backend);
      await ready(page);
      await page.getByText("legacyword", { exact: true }).waitFor();
      await importWords(page, ["optionsword"]);
      await poll(
        () => stored(backend, STOKEY_WORDS)?.optionsword,
        "Options did not write plain JSON to the existing words key"
      );
      const second = await gmPage(context, backend, { origin: gmOtherOrigin });
      await ready(second);
      await second.getByText("optionsword", { exact: true }).waitFor();
      await second.getByText("legacyword", { exact: true }).waitFor();
      assert.notEqual(new URL(page.url()).origin, new URL(second.url()).origin);
      const legacyWords = await second.evaluate(async (key) => {
        const words = JSON.parse(await GM.getValue(key));
        await GM.setValue(
          key,
          JSON.stringify({ ...words, oldapiword: { createdAt: 2 } })
        );
        return words;
      }, STOKEY_WORDS);
      assert.ok(
        legacyWords.optionsword,
        "The existing GM API did not read the Options edit"
      );
      await page.reload();
      await ready(page);
      await page.getByText("oldapiword", { exact: true }).waitFor();
      await page.getByText("optionsword", { exact: true }).waitFor();
      await page.setViewportSize({ width: 1100, height: 1100 });
      await page.getByRole("button", { name: /Appearance mode:/ }).click();
      await poll(
        () => stored(backend, STOKEY_SETTING)?.darkMode === "light",
        "Options did not save settings to the existing key"
      );
      const legacySettings = await second.evaluate(async (key) => {
        const settings = JSON.parse(await GM.getValue(key));
        await GM.setValue(
          key,
          JSON.stringify({ ...settings, darkMode: "dark" })
        );
        return settings;
      }, STOKEY_SETTING);
      assert.equal(legacySettings.darkMode, "light");
      await page.reload();
      await ready(page);
      await page
        .getByRole("button", { name: /Appearance mode: current Dark/i })
        .waitFor();
      assertLegacyStorage(backend);
      await second.screenshot({
        path: resolve(output, "legacy-storage-api.png"),
        fullPage: true,
      });
      await page.screenshot({
        path: resolve(output, "legacy-storage-options.png"),
        fullPage: true,
      });
      return {
        origins: [new URL(page.url()).origin, new URL(second.url()).origin],
        legacyWords,
        legacySettings,
        backend: snapshot(backend),
      };
    });
  for (const missingConfig of [false, true]) {
    const name = missingConfig
      ? "gm-destination-race-empty-config"
      : "gm-destination-race";
    if (!shouldRun(name)) continue;
    await run(name, async () => {
      const context = await newContext();
      const backend = gmBackend();
      if (missingConfig) backend.values.delete(STOKEY_SYNC);
      const first = await gmPage(context, backend);
      await ready(first);
      const second = await gmPage(context, backend, {
        origin: gmOtherOrigin,
        route: "sync",
      });
      await ready(second);
      const before = snapshot(backend);
      const gate = backend.pauseNextConfigRead(gmOrigin);
      const imported = importWords(first, ["racedword"]);
      try {
        await Promise.race([
          gate.paused,
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "GM metadata transaction did not reach the held read"
                  )
                ),
              10000
            )
          ),
        ]);
        await second
          .locator('input[name="syncUrl"]')
          .fill("https://destination-b.invalid");
        await poll(
          () =>
            stored(backend, STOKEY_SYNC)?.syncUrl ===
            "https://destination-b.invalid",
          "The second origin did not persist its destination change"
        );
        const afterSwitch = snapshot(backend);
        const changed = stored(backend, STOKEY_SYNC);
        gate.resume();
        await imported;
        await poll(
          () => stored(backend, STOKEY_WORDS)?.racedword,
          "The delayed edit did not commit after releasing its stale metadata snapshot"
        );
        await first.getByText("racedword", { exact: true }).waitFor();
        const finalConfig = stored(backend, STOKEY_SYNC);
        assert.equal(
          finalConfig.syncUrl,
          "https://destination-b.invalid",
          "A metadata commit reverted the completed destination change"
        );
        assert.equal(
          finalConfig.destinationRevision,
          changed.destinationRevision,
          "A metadata commit rolled back destinationRevision"
        );
        const lateWrites = backend.calls.filter(
          (entry) =>
            entry.origin === gmOrigin &&
            entry.action === "setValue" &&
            entry.args.key === STOKEY_SYNC &&
            entry.index >= before.calls.length
        );
        assert.ok(
          lateWrites.every(
            ({ args }) => JSON.parse(args.val).syncUrl === changed.syncUrl
          ),
          "A metadata-only change rewrote the configuration with an obsolete destination"
        );
        await second.reload();
        await ready(second);
        assert.equal(
          await second.locator('input[name="syncUrl"]').inputValue(),
          "https://destination-b.invalid"
        );
        const effectiveSync = stored(backend, STOKEY_SYNC);
        assert.deepEqual(
          effectiveSync.syncMeta,
          {},
          "Metadata from the obsolete destination leaked into the new target"
        );
        assertLegacyStorage(backend);
        await first.screenshot({
          path: resolve(output, `${name}-words.png`),
          fullPage: true,
        });
        await second.screenshot({
          path: resolve(output, `${name}-preserved.png`),
          fullPage: true,
        });
        return {
          origins: [gmOrigin, gmOtherOrigin],
          before,
          afterSwitch,
          finalConfig,
          effectiveSync,
          obsoleteConfigWrites: lateWrites,
          backend: snapshot(backend),
        };
      } finally {
        backend.release();
      }
    });
  }
} finally {
  await browser.close();
}
if (report.some((result) => !result.passed)) process.exitCode = 1;
