import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertZipSourcesReady } from "./archive.mjs";
import * as archiveModule from "./archive.mjs";

const require = createRequire(import.meta.url);

const TASKS = [
  { output: "chrome.zip", source: "chrome" },
  { output: "../firefox.zip", source: "*", cwd: "firefox" },
];

test("ready build output passes the zip source check", async () => {
  const root = await fixture();
  try {
    await seed(root, "chrome");
    await seed(root, "firefox");
    await assertZipSourcesReady(TASKS, root);
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

test("stale zips are removed relative to the build dir (not build/build)", async () => {
  // 契约：清理必须相对 build/ 定位。历史回归——循环放在 cd("build") 之后
  // 又用 path.join("build", name)，实际删的是 build/build/*.zip，force 吞
  // ENOENT 静默空转，旧 zip 残留。
  const staleTasks = [
    { output: "chrome.zip", source: "chrome" },
    { output: "edge.zip", source: "edge" },
    { output: "userscript.zip", source: "userscript" },
    { output: "../firefox.zip", source: "*", cwd: "firefox" },
    { output: "../thunderbird.zip", source: "*", cwd: "thunderbird" },
  ];
  const stale = staleTasks.map((task) =>
    task.output.startsWith("../") ? task.output.slice(3) : task.output
  );
  const root = await fixture();
  try {
    const build = path.join(root, "build");
    await fs.mkdir(build, { recursive: true });
    // 错位哨兵：旧实现从 cwd=build 解析 path.join("build", name)，命中的正是
    // build/build/<name>；修复后该错位路径不得被触碰（内容保持不变）。
    await fs.mkdir(path.join(build, "build"), { recursive: true });
    for (const name of stale) {
      await fs.writeFile(path.join(build, name), "stale");
      await fs.writeFile(path.join(build, "build", name), `sentinel:${name}`);
    }
    await archiveModule.removeStaleZips(staleTasks, build);
    for (const name of stale) {
      await assert.rejects(() => fs.stat(path.join(build, name)), /ENOENT/);
      const sentinel = await fs.readFile(
        path.join(build, "build", name),
        "utf8"
      );
      assert.equal(sentinel, `sentinel:${name}`, `${name} 错位路径被误触碰`);
    }
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

test("missing or empty build output rejects before any zip is written", async () => {
  const root = await fixture();
  try {
    await seed(root, "chrome");
    await assert.rejects(() => assertZipSourcesReady(TASKS, root), /firefox/);
    await fs.rm(path.join(root, "chrome"), { recursive: true });
    await assert.rejects(() => assertZipSourcesReady(TASKS, root), /chrome/);
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

test("userscript output pairs the .user.js with icons-license.txt", async () => {
  // 油猴分发件无扩展商店许可页兜底：许可缺失或复制中断留下的孤儿
  // .user.js 不得产出 userscript.zip；成对在场才放行。
  const USERSCRIPT_TASKS = [{ output: "userscript.zip", source: "userscript" }];
  const root = await fixture();
  try {
    await fs.mkdir(path.join(root, "userscript"), { recursive: true });
    await fs.writeFile(
      path.join(root, "userscript", "kiss-translator.user.js"),
      "// userscript\n"
    );
    await assert.rejects(
      () => assertZipSourcesReady(USERSCRIPT_TASKS, root),
      /userscript/
    );
    await fs.writeFile(path.join(root, "userscript", "icons-license.txt"), "x");
    await assertZipSourcesReady(USERSCRIPT_TASKS, root);
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

async function fixture() {
  // 临时目录落在 os.tmpdir()，finally 整树删除，不在仓库根残留父目录。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "archive-test-"));
  await fs.mkdir(path.join(root, "chrome"), { recursive: true });
  await fs.mkdir(path.join(root, "firefox"), { recursive: true });
  return root;
}

async function seed(root, dir) {
  await fs.writeFile(path.join(root, dir, "index.html"), "<html></html>");
}

test("zx CLI entry executes archive main and fails loudly on missing build", async () => {
  // 契约（C-3）：zx 以动态 import 运行脚本且不回写 process.argv，入口闸必须
  // 取 CLI 注入的全局 __filename。build 未就绪时 main 必须非零退出且报错
  // 有声（含 "Build output missing"）——入口闸恒假即静默零产物违约。
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "archive-entry-"));
  try {
    const zxEntry = require.resolve("zx/cli");
    const archivePath = fileURLToPath(
      new URL("./archive.mjs", import.meta.url)
    );
    const run = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [zxEntry, archivePath],
        { cwd: tmp, encoding: "utf8" },
        (error, stdout, stderr) =>
          resolve({
            code: error ? (error.code ?? 1) : 0,
            output: `${stdout ?? ""}${stderr ?? ""}`,
          })
      );
    });
    assert.notEqual(run.code, 0);
    assert.match(run.output, /Build output missing/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("zx CLI entry produces five zips when sources are ready", async (t) => {
  let bestzipMain = null;
  try {
    bestzipMain = require.resolve("bestzip/bin/cli.js");
  } catch {
    bestzipMain = null;
  }
  if (!bestzipMain) {
    // 显式跳因须点明判据：本地 devDep 缺席才跳，绝不因网络/开关文案跳。
    t.skip("bestzip not installed locally; offline zip contract unchecked");
    return;
  }
  // 就绪相：本地 devDep 在场即实跑完整 zip 合同，绝不因网络/开关文案跳过。
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "archive-ready-"));
  try {
    const build = path.join(tmp, "build");
    for (const dir of ["chrome", "edge", "firefox", "thunderbird"]) {
      await fs.mkdir(path.join(build, dir), { recursive: true });
      await fs.writeFile(path.join(build, dir, "index.html"), "<html></html>");
    }
    await fs.mkdir(path.join(build, "userscript"), { recursive: true });
    await fs.writeFile(
      path.join(build, "userscript", "kiss-translator.user.js"),
      "// userscript\n"
    );
    await fs.writeFile(
      path.join(build, "userscript", "icons-license.txt"),
      "ISC\n"
    );
    const zxEntry = require.resolve("zx/cli");
    const archivePath = fileURLToPath(
      new URL("./archive.mjs", import.meta.url)
    );
    const run = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [zxEntry, archivePath],
        { cwd: tmp, encoding: "utf8" },
        (error, stdout, stderr) =>
          resolve({
            code: error ? (error.code ?? 1) : 0,
            output: `${stdout ?? ""}${stderr ?? ""}`,
          })
      );
    });
    assert.equal(run.code, 0, run.output);
    for (const zip of [
      path.join(build, "chrome.zip"),
      path.join(build, "edge.zip"),
      path.join(build, "userscript.zip"),
      path.join(build, "firefox.zip"),
      path.join(build, "thunderbird.zip"),
    ]) {
      const stat = await fs.stat(zip);
      assert.ok(stat.size > 0, `${zip} must be a non-empty zip`);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("bare node entry refuses to run silently (must go loud, not zero-output)", async () => {
  // 契约（C-4）：只应经 zx 运行。裸 node 直跑必须非零退出且在 stderr
  // 指出正确入口，绝不可以 Exit 0 零产物静默通过。
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "archive-bare-"));
  try {
    const archivePath = fileURLToPath(
      new URL("./archive.mjs", import.meta.url)
    );
    const run = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [archivePath],
        { cwd: tmp, encoding: "utf8" },
        (error, stdout, stderr) =>
          resolve({
            code: error ? (error.code ?? 1) : 0,
            output: `${stdout ?? ""}${stderr ?? ""}`,
          })
      );
    });
    assert.notEqual(run.code, 0);
    assert.match(run.output, /pnpm zip/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("junction entry still reaches archive main (realpath symmetry)", async (t) => {
  // 默认 ESM 对 import.meta.url 做 realpath，isMain 只 realpath 第二参，
  // 两者对称——junction 入口仍应命中。用工作区内 junction 保留 Node 包解析链；
  // 无权限创建链接则跳，不把环境限制伪装成产品缺陷。
  const workspaceRoot = path.resolve(
    fileURLToPath(new URL("../..", import.meta.url))
  );
  const tmp = await fs.mkdtemp(path.join(workspaceRoot, ".archive-junc-"));
  try {
    const real = path.join(tmp, "real");
    const link = path.join(tmp, "link");
    await fs.mkdir(real, { recursive: true });
    await fs.copyFile(
      fileURLToPath(new URL("./archive.mjs", import.meta.url)),
      path.join(real, "archive.mjs")
    );
    try {
      await fs.symlink(real, link, "junction");
    } catch {
      t.skip("junction not permitted on this host");
      return;
    }
    const zxEntry = require.resolve("zx/cli");
    const run = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [zxEntry, path.join(link, "archive.mjs")],
        { cwd: tmp, encoding: "utf8" },
        (error, stdout, stderr) =>
          resolve({
            code: error ? (error.code ?? 1) : 0,
            output: `${stdout ?? ""}${stderr ?? ""}`,
          })
      );
    });
    assert.notEqual(run.code, 0);
    assert.match(run.output, /Build output missing/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("importing archive via bare node runs nothing (zero side effects)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "archive-import-"));
  try {
    const archivePath = fileURLToPath(
      new URL("./archive.mjs", import.meta.url)
    );
    const script = path.join(tmp, "probe.mjs");
    await fs.writeFile(
      script,
      `import ${JSON.stringify(pathToFileURL(archivePath).href)};\nconsole.log("PROBE_DONE");\n`,
      "utf8"
    );
    const run = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [script],
        { cwd: tmp, encoding: "utf8" },
        (error, stdout) =>
          resolve({ code: error ? (error.code ?? 1) : 0, output: stdout ?? "" })
      );
    });
    assert.equal(run.code, 0);
    assert.equal(run.output.trim(), "PROBE_DONE");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("every npx-run package is declared in package.json or is a node builtin", async () => {
  const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const pkg = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8")
  );
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  const archiveSrc = await fs.readFile(
    fileURLToPath(new URL("./archive.mjs", import.meta.url)),
    "utf8"
  );
  const used = [...archiveSrc.matchAll(/npx\s+([\w@/.-]+)/g)].map((m) => m[1]);
  for (const name of used) {
    assert.ok(
      declared.has(name),
      `archive.mjs invokes \`npx ${name}\` but ${name} is not declared in package.json`
    );
  }
});
