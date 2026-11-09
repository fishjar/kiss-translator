import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const webpack = createRequire(require.resolve("react-scripts/package.json"))(
  "webpack"
);
const { webpack: configure } = require("../../config-overrides.js");

test("extension script entries resolve dynamic imports without page script loading", async () => {
  await fs.mkdir("tmp", { recursive: true });
  const root = await fs.mkdtemp(path.resolve("tmp/extension-chunks-"));
  try {
    await fs.writeFile(
      path.join(root, "entry.js"),
      'globalThis.result = import("./lazy.js").then(m => m.value);'
    );
    await fs.writeFile(
      path.join(root, "lazy.js"),
      `export const value = import("./nested.js").then(m => m.value); export const padding = "${"x".repeat(25000)}";`
    );
    await fs.writeFile(
      path.join(root, "nested.js"),
      "export const value = 42;"
    );
    const configured = configure(
      {
        output: {},
        module: { parser: {} },
        optimization: {},
        resolve: { alias: {} },
        plugins: [],
      },
      "production"
    );
    const entry = Object.fromEntries(
      Object.entries(configured.entry).map(([name, options]) => [
        name,
        typeof options === "string"
          ? path.join(root, "entry.js")
          : { ...options, import: path.join(root, "entry.js") },
      ])
    );
    const compiler = webpack({
      mode: "production",
      entry,
      module: configured.module,
      output: {
        ...configured.output,
        path: path.join(root, "dist"),
        filename: "[name].js",
        publicPath: "/",
      },
      optimization: { ...configured.optimization, minimize: false },
    });
    const stats = await new Promise((resolve, reject) => {
      compiler.run((error, stats) => {
        compiler.close((closeError) => {
          if (error || closeError) reject(error || closeError);
          else resolve(stats);
        });
      });
    });
    assert.equal(
      stats.hasErrors(),
      false,
      stats.toString({ all: false, errors: true })
    );
    for (const name of Object.keys(entry).filter(
      (name) => !["popup", "options"].includes(name)
    )) {
      assert.deepEqual(
        stats.compilation.entrypoints.get(name).getFiles(),
        [`${name}.js`],
        `${name} is self-contained`
      );
      const script = await fs.readFile(
        path.join(root, "dist", `${name}.js`),
        "utf8"
      );
      const context = vm.createContext({
        document: {
          getElementsByTagName() {
            throw new Error(
              "Attempted to load an extension chunk through the host page"
            );
          },
        },
      });
      context.self = context;
      vm.runInContext(script, context);
      assert.equal(await context.result, 42, name);
    }
    for (const name of ["popup", "options"]) {
      assert.ok(
        stats.compilation.entrypoints
          .get(name)
          .getFiles()
          .some((file) => file.startsWith("page-shared-options-popup")),
        `${name} keeps its HTML-loaded shared chunk`
      );
      const chunks = stats.compilation.entrypoints
        .get(name)
        .getRuntimeChunk()
        .getAllAsyncChunks();
      assert.equal(chunks.size, 0, `${name} bundles dynamic dependencies`);
      const context = vm.createContext({});
      context.self = context;
      for (const file of stats.compilation.entrypoints.get(name).getFiles()) {
        vm.runInContext(
          await fs.readFile(path.join(root, "dist", file), "utf8"),
          context
        );
      }
      assert.equal(
        await context.result,
        42,
        `${name} starts after shared scripts load`
      );
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
