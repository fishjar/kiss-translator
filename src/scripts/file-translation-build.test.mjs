import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const exists = async (file) =>
  fs.access(file).then(
    () => true,
    () => false
  );
const sites = await readJson("src/config/fileTranslationSites.json");

test("homepage compilation excludes extension services and executable AI assets", async () => {
  const modules = await readJson("tmp/build-analysis/homepage-modules.json");
  assert.ok(modules.includes("src/fileTranslation/client.js"));
  assert.ok(!modules.some((file) => /^src\/(apis|localAi)\//.test(file)));
  assert.ok(!modules.includes("src/libs/storage.js"));
  for (const name of [
    "manifest.json",
    "_locales",
    "api",
    "local-ai",
    "offscreen.js",
    "options.html",
  ])
    assert.equal(await exists(path.join("build/homepage", name)), false, name);
});

test("composed website retains userscript settings and resolves both web entrypoints", async () => {
  for (const name of [
    "options.html",
    "options.js",
    "kiss-translator.user.js",
    "version.txt",
  ])
    assert.ok(await exists(path.join("build/web", name)), name);
  for (const name of ["index.html", "file-translate.html"]) {
    const html = await fs.readFile(path.join("build/web", name), "utf8");
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(
      (match) => match[1]
    );
    assert.ok(scripts.length);
    for (const script of scripts) {
      assert.ok(script.startsWith("./assets/homepage/"), script);
      assert.ok(await exists(path.join("build/web", script)), script);
    }
  }
});

for (const target of ["edge-dev", "chrome", "firefox"])
  test(`${target} bridge uses a single self-contained script and narrow page matches`, async () => {
    const root = `build/${target}`;
    const manifest = await readJson(`${root}/manifest.json`);
    const bridge = manifest.content_scripts.find((entry) =>
      entry.js.includes("file-bridge.js")
    );
    assert.deepEqual(bridge.js, ["file-bridge.js"]);
    assert.equal(bridge.all_frames, false);
    assert.deepEqual(
      bridge.matches.filter((url) => url.startsWith("https:")),
      sites.map((url) => `${url}*`)
    );
    assert.deepEqual(
      bridge.matches.filter((url) => url.startsWith("http:")),
      [
        "http://localhost:3000/file-translate.html*",
        "http://127.0.0.1:3000/file-translate.html*",
      ]
    );
    assert.ok(await exists(`${root}/file-bridge.js`));
    assert.equal(await exists(`${root}/file-translate.html`), false);
    assert.equal(await exists(`${root}/fileTranslate.js`), false);
    const script = await fs.readFile(`${root}/file-bridge.js`, "utf8");
    assert.ok(!script.includes("page-shared-options-popup"));
  });
