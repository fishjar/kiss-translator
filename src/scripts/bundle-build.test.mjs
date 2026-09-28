import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { inspectBundle, checkBudget } from "./bundle-audit.mjs";
import { fingerprint, ensureLocalAi } from "./local-ai-cache.mjs";

async function fixture() {
  await fs.mkdir("tmp", { recursive: true });
  return fs.mkdtemp(path.resolve("tmp/bundle-test-"));
}

test("audit catches missing imports, workers, weights and duplicate binaries", async () => {
  const root = await fixture();
  try {
    await fs.writeFile(
      path.join(root, "offscreen.js"),
      'import "./missing.js"; new Worker(new URL("./absent.js", import.meta.url));'
    );
    await fs.writeFile(path.join(root, "model.onnx"), "weight");
    await fs.writeFile(path.join(root, "one.wasm"), Buffer.alloc(65536));
    await fs.copyFile(path.join(root, "one.wasm"), path.join(root, "two.wasm"));
    const report = await inspectBundle(root, { runtime: true });
    assert.equal(report.errors.length, 4);
    assert.ok(report.errors.some((e) => e.includes("absent.js")));
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

test("audit resolves relative resources and counts all initial page scripts", async () => {
  const root = await fixture();
  try {
    await fs.mkdir(path.join(root, "local-ai"));
    await fs.writeFile(
      path.join(root, "popup.html"),
      '<script src="/shared.js"></script><script src="/popup.js"></script>'
    );
    await fs.writeFile(path.join(root, "shared.js"), "12345");
    await fs.writeFile(path.join(root, "popup.js"), "123");
    await fs.writeFile(
      path.join(root, "local-ai/worker.js"),
      'import "../shared.js";'
    );
    const report = await inspectBundle(root);
    assert.deepEqual(report.errors, []);
    assert.equal(report.pages["popup.html"].initialScriptBytes, 8);
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

test("budget uses the larger of one percent and 256 KiB", () => {
  assert.doesNotThrow(() =>
    checkBudget({ bytes: 110, zipBytes: 110 }, { bytes: 100, zipBytes: 100 })
  );
  assert.throws(() =>
    checkBudget(
      { bytes: 200000000, zipBytes: 100 },
      { bytes: 100000000, zipBytes: 100 }
    )
  );
});

test("content fingerprints, verified cache hits, corrupt cache repair and failed build isolation", async () => {
  const root = await fixture();
  const previous = process.cwd();
  try {
    for (const dir of [
      "src/localAi",
      "src/scripts",
      "node_modules/vite",
      "node_modules/typescript",
      "node_modules/onnxruntime-web",
      "node_modules/@paddleocr/paddleocr-js",
    ])
      await fs.mkdir(path.join(root, dir), { recursive: true });
    for (const file of [
      "package.json",
      "pnpm-lock.yaml",
      "vite.config.local-ai.ts",
      "src/localAi/test.ts",
      "src/scripts/build.mjs",
    ])
      await fs.writeFile(path.join(root, file), "aaaa");
    for (const name of [
      "vite",
      "typescript",
      "onnxruntime-web",
      "@paddleocr/paddleocr-js",
    ])
      await fs.writeFile(
        path.join(root, "node_modules", name, "package.json"),
        '{"version":"1.0.0"}'
      );
    const before = await fingerprint(root);
    const file = path.join(root, "src/localAi/test.ts");
    const stat = await fs.stat(file);
    await fs.writeFile(file, "bbbb");
    await fs.utimes(file, stat.atime, stat.mtime);
    assert.notEqual(await fingerprint(root), before);
    const afterSource = await fingerprint(root);
    await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "bbbb");
    assert.notEqual(await fingerprint(root), afterSource);
    process.chdir(root);
    let count = 0;
    const build = async (stage) => {
      count++;
      await fs.writeFile(path.join(stage, "offscreen.js"), "export {}; ");
    };
    await ensureLocalAi({ build });
    await ensureLocalAi({ build });
    assert.equal(count, 1);
    await fs.writeFile(".local-ai-build/offscreen.js", "broken");
    await ensureLocalAi({ build });
    assert.equal(count, 2);
    await assert.rejects(
      ensureLocalAi({
        force: true,
        build: async () => {
          throw new Error("build failed");
        },
      })
    );
    assert.equal(
      await fs.readFile(".local-ai-build/offscreen.js", "utf8"),
      "export {}; "
    );
    assert.equal((await fs.readdir("tmp")).length, 0);
  } finally {
    process.chdir(previous);
    await fs.rm(root, { recursive: true });
  }
});
