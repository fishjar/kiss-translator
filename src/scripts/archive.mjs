#!/usr/bin/env zx

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Zip 源目录就绪校验：每个任务的源目录必须存在且至少含一个条目；
 * 含 .user.js 的目录还必须携带 icons-license.txt——油猴分发件没有扩展
 * 商店的许可页兜底，许可缺失或复制中断留下的孤儿脚本不得产出 zip。
 * 未就绪时在任何旧 zip 被清理之前早退（零产物）。
 */
export async function assertZipSourcesReady(tasks, buildDir = "build") {
  const missing = [];
  for (const task of tasks) {
    const dir = path.join(buildDir, task.cwd || task.source);
    const entries = await fs.readdir(dir).catch(() => null);
    if (!entries || entries.length === 0) {
      missing.push(task.output);
      continue;
    }
    if (
      entries.some((file) => file.endsWith(".user.js")) &&
      !entries.includes("icons-license.txt")
    ) {
      missing.push(task.output);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Build output missing or incomplete for: ${missing.join(", ")}. Run \`pnpm build\` before \`pnpm zip\`.`
    );
  }
}

async function main() {
  console.log(chalk.cyan("\nStarting compression tasks...\n"));

  /**
   * 定义打包任务配置
   * * @property {string} output - 输出文件名
   * @property {string} source - 要打包的源（文件或目录名）
   * @property {string} [cwd]  - (可选) 执行打包命令时所在的目录。
   */
  const tasks = [
    { output: "chrome.zip", source: "chrome" },
    { output: "edge.zip", source: "edge" },
    { output: "userscript.zip", source: "userscript" },
    {
      output: "../firefox.zip",
      source: "*",
      cwd: "firefox",
    },
    {
      output: "../thunderbird.zip",
      source: "*",
      cwd: "thunderbird",
    },
  ];

  await assertZipSourcesReady(tasks);

  // 1. 进入 build 目录
  cd("build");

  // 2. 清理旧的 zip 文件
  await $`npx shx rm -f *.zip`;

  try {
    for (const task of tasks) {
      if (task.cwd) {
        // === 特殊打包：进入目录内部打包 (Firefox/Thunderbird) ===
        const originalCwd = process.cwd(); // 记录当前位置 (build/)

        // 1. 进入子目录
        cd(task.cwd);
        console.log(`Zipping contents of ${task.cwd} (flat structure)...`);

        // 2. 执行打包: 将当前目录所有文件 (*) 打包到父级目录的 zip 中
        await $`npx bestzip ${task.output} *`;

        // 3. 回到原目录
        cd(originalCwd);
      } else {
        // === 普通打包：打包文件夹本身 (Chrome/Edge) ===
        console.log(`Zipping folder ${task.source}...`);
        await $`npx bestzip ${task.output} ${task.source}`;
      }
    }
    console.log(chalk.green("\n✅ All zip files created successfully."));
  } catch (err) {
    console.error(chalk.red("❌ Error during zipping:"), err);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
