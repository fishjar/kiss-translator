import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import configureHtmlDecoder from "./html-decoder-webpack.cjs";

const require = createRequire(import.meta.url);
const runtimeRequire = createRequire(
  require.resolve("react-scripts/package.json")
);
const webpack = runtimeRequire("webpack");
const { JSDOM } = runtimeRequire("jsdom");
const root = path.resolve("tmp/html-decoder-build-tests");

function moduleNames(modules = []) {
  return modules.flatMap((module) => [
    module.name || "",
    ...moduleNames(module.modules),
  ]);
}

test("compiled DOM entries exclude parse5 while the background runs without DOM APIs", async () => {
  await fs.mkdir(root, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(root, "case-"));
  const entry = path.join(fixture, "entry.js");
  await fs.writeFile(
    entry,
    `import { decodeHTMLEntities, decodeHTMLTranslationText } from ${JSON.stringify(path.resolve("src/libs/html.js"))};
globalThis.decoded = [
  decodeHTMLEntities('<frameset><frame></frameset>'),
  decodeHTMLEntities('Body<style>ignored</style><noscript><b>Fallback</b></noscript> &amp;lt;'),
  decodeHTMLTranslationText('First<br>Second &amp; UI')
];`
  );

  for (const extension of [true, false]) {
    const config = {
      mode: "production",
      context: path.resolve("."),
      entry: extension
        ? { background: entry, content: entry, options: entry }
        : { "kiss-translator.user": entry },
      output: { path: path.join(fixture, extension ? "extension" : "web") },
      resolve: { extensions: [".js"] },
      plugins: [],
      optimization: { minimize: false },
    };
    if (extension) configureHtmlDecoder(config, webpack);
    const compiler = webpack(config);
    const stats = await new Promise((resolve, reject) => {
      compiler.run((error, result) => {
        compiler.close((closeError) => {
          if (error || closeError) reject(error || closeError);
          else resolve(result);
        });
      });
    });
    assert.equal(
      stats.hasErrors(),
      false,
      stats.toString({ all: false, errors: true })
    );
    const report = stats.toJson({
      all: false,
      chunks: true,
      chunkModules: true,
      nestedModules: true,
      chunkModulesSpace: Infinity,
      nestedModulesSpace: Infinity,
      groupModulesByAttributes: false,
      groupModulesByCacheStatus: false,
      groupModulesByType: false,
      groupModulesByPath: false,
      dependentModules: true,
    });
    for (const chunk of report.chunks) {
      const background = chunk.names.includes("background");
      assert.equal(
        moduleNames(chunk.modules).some((name) =>
          /[/\\]parse5[/\\]/.test(name)
        ),
        background,
        `parse5 dependency in ${chunk.names}`
      );
      const code = await fs.readFile(
        path.join(config.output.path, chunk.files[0]),
        "utf8"
      );
      let decoded;
      if (background) {
        const context = vm.createContext({});
        vm.runInContext(code, context);
        decoded = Array.from(context.decoded);
      } else {
        const dom = new JSDOM("", { runScripts: "outside-only" });
        try {
          dom.window.eval(code);
          decoded = Array.from(dom.window.decoded);
        } finally {
          dom.window.close();
        }
      }
      assert.deepEqual(decoded, [
        "",
        "BodyFallback &lt;",
        "First\nSecond & UI",
      ]);
    }
  }
});
