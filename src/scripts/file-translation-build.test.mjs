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
  assert.ok(modules.includes("src/components/TerminologySelect.js"));
  for (const name of ["I18n", "Terminology", "Setting"])
    assert.ok(!modules.includes(`src/hooks/${name}.js`));
  assert.ok(!modules.some((file) => /^src\/(apis|localAi)\//.test(file)));
  for (const name of ["storage", "browser", "msg"])
    assert.ok(!modules.includes(`src/libs/${name}.js`));
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

test("composed website removes the replaced entry and updates its asset manifest", async () => {
  for (const name of ["main.js", "content.html"])
    assert.equal(await exists(path.join("build/web", name)), false, name);
  const manifest = await readJson("build/web/asset-manifest.json");
  const homepage = await readJson("build/homepage/asset-manifest.json");
  assert.equal(manifest.files["main.js"], homepage.files["main.js"]);
  assert.equal(
    manifest.files["fileTranslate.js"],
    homepage.files["fileTranslate.js"]
  );
  assert.ok(manifest.files["options.js"]);
  assert.deepEqual(manifest.entrypoints, homepage.entrypoints);
  for (const file of Object.values(manifest.files))
    assert.ok(
      await exists(path.join("build/web", file.replace(/^\//, ""))),
      file
    );
});

for (const target of ["homepage", "web"])
  test(`${target} PDF styles resolve all assets and share export fonts`, async () => {
    const root = `build/${target}`;
    const directory = "assets/homepage";
    const files = await fs.readdir(`${root}/${directory}`);
    assert.ok(!files.some((file) => /^KaTeX_/.test(file)));
    const fontPaths = new Set();
    for (const file of files.filter((file) => file.endsWith(".css"))) {
      const css = await fs.readFile(`${root}/${directory}/${file}`, "utf8");
      for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
        const url = match[1];
        if (/^(data:|https?:|#)/.test(url)) continue;
        const asset = path.posix.normalize(path.posix.join(directory, url));
        assert.ok(await exists(path.join(root, asset)), `${file}: ${url}`);
        if (asset.includes("KaTeX_")) fontPaths.add(asset);
      }
    }
    const css = await fs.readFile(`${root}/assets/pdf/katex.min.css`, "utf8");
    const exportFonts = new Set(
      [...css.matchAll(/url\(([^)]+)\)/g)].map((match) =>
        path.posix.join("assets/pdf", match[1].replace(/["']/g, ""))
      )
    );
    assert.ok(fontPaths.size > 0);
    assert.deepEqual(fontPaths, exportFonts);
    for (const font of exportFonts)
      assert.ok(await exists(path.join(root, font)), font);
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
    for (const base of [
      "https://kiss-translator.rayjar.com",
      "https://fishjar.github.io/kiss-translator",
      "https://kiss-translator-dev.rayjar.com",
      "https://kiss-translator-dev.pages.dev",
      "https://kiss-translator.pages.dev",
    ]) {
      assert.ok(bridge.matches.includes(`${base}/file-translate.html*`));
      assert.ok(bridge.matches.includes(`${base}/file-translate*`));
    }
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
