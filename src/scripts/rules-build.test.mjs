import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core");
const sourcePath = fileURLToPath(new URL("../rules.js", import.meta.url));
const { code } = transformSync(await fs.readFile(sourcePath, "utf8"), {
  babelrc: false,
  configFile: false,
  presets: [require.resolve("@babel/preset-env")],
});

test("rules build writes the built-in rules to the web output", () => {
  const rules = [{ pattern: "*" }];
  const writes = [];
  const childProcess = {};
  vm.runInNewContext(code, {
    require(name) {
      if (name === "fs")
        return { writeFileSync: (...args) => writes.push(args) };
      if (name === "path") return path;
      if (name === "./config/rules") return { BUILTIN_RULES: rules };
      throw new Error(`Unexpected import: ${name}`);
    },
    __dirname: path.dirname(sourcePath),
    console: { info() {} },
    process: childProcess,
  });
  assert.equal(writes.length, 1);
  assert.equal(
    writes[0][0],
    path.resolve(
      path.dirname(sourcePath),
      "../build/web/kiss-translator-rules.json"
    )
  );
  assert.deepEqual(JSON.parse(writes[0][1]), rules);
  assert.equal(childProcess.exitCode, undefined);
});

test("rules build exits unsuccessfully when writing the output fails", () => {
  const runner = `
    const vm = require("node:vm");
    vm.runInNewContext(${JSON.stringify(code)}, {
      require(name) {
        if (name === "fs") return {
          writeFileSync() { throw new Error("Simulated output failure"); }
        };
        if (name === "path") return require("node:path");
        if (name === "./config/rules") return { BUILTIN_RULES: [] };
        throw new Error("Unexpected import: " + name);
      },
      __dirname: ${JSON.stringify(path.dirname(sourcePath))},
      console,
      process,
    });
  `;
  const result = spawnSync(process.execPath, ["-e", runner], {
    encoding: "utf8",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Failed to generate built-in rules file/);
  assert.match(result.stderr, /Simulated output failure/);
});
