import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertZipSourcesReady } from "./archive.mjs";

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
