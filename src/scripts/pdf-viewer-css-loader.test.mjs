import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const reactRequire = createRequire(
  require.resolve("react-scripts/package.json")
);
const postcss = reactRequire("postcss");
const presetEnv = reactRequire("postcss-preset-env");
const { cssnanoMinify } = reactRequire("css-minimizer-webpack-plugin");
const fixViewerCss = require("./pdf-viewer-css-loader.cjs");

async function minify(source, file) {
  const transformed = await postcss([
    presetEnv({ stage: 3, autoprefixer: { flexbox: "no-2009" } }),
  ]).process(source, { from: file });
  return cssnanoMinify({ [file]: transformed.css });
}

test("PDF.js viewer CSS passes CRA minification after repairing its fallback", async () => {
  const file = require.resolve("pdfjs-dist/web/pdf_viewer.css");
  const source = await fs.readFile(file, "utf8");
  const before = await minify(source, file);
  assert.ok(
    before.warnings.some((warning) => warning.includes("--sidebar-width"))
  );
  const after = await minify(fixViewerCss(source), file);
  assert.equal(after.warnings.length, 0);
  assert.ok(
    /var\(--viewsManager-width,\s*var\(--sidebar-width\)\)/.test(after.code)
  );
});
