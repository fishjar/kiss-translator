#!/usr/bin/env zx

import fs from "node:fs/promises";
import path from "node:path";
import { isMain } from "zx/cli";
import { fileURLToPath } from "node:url";

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

/**
 * 清理遗留的 zip 输出：按任务输出名逐一删除 build 目录下的同名文件，
 * 忽略缺失。必须在 `cd("build")` 之前调用——前置位若晚于 cd，相对路径会解析
 * 成 `build/build/*.zip` 而因 `force: true` 静默空转，旧 zip 残留会让中途
 * 失败的打包看起来仍产出完整。
 */
export async function removeStaleZips(tasks, buildDir = "build") {
  for (const task of tasks) {
    const name = task.output.startsWith("../")
      ? task.output.slice(3)
      : task.output;
    await fs.rm(path.join(buildDir, name), { force: true });
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

  // 1. 清理旧的 zip 文件：必须在进入 build/ 之前按 cwd 相对 build/ 删除本任务
  //    五个输出名（chrome/edge/userscript 由本目录 bestzip 产，firefox/thunderbird
  //    由子目录 bestzip 写到 build/ 根）。前置位若晚于 cd("build")，相对路径会
  //    解析成 build/build/*.zip 并因 force 吞 ENOENT 静默空转，旧 zip 残留
  //    会让中途失败的打包看起来仍完整。不得走 npx（shx 非本仓声明依赖，干净/
  //    离线环境必炸且引入网络腿）。
  await removeStaleZips(tasks);

  // 2. 进入 build 目录
  cd("build");

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

// zx 以动态 import 运行脚本且不回写 process.argv：argv 派入口闸在 CLI 通道恒假
// ＝静默零产物；裸 isMain(import.meta.url) 的第二参同样回落 process.argv[1]
// （指向 CLI 本体），依旧恒假。CLI 经 injectGlobalRequire 注入的全局
// __filename 才是脚本内可靠入口信号，必须显式传给 isMain 第二参。
if (
  typeof globalThis.__filename === "string" &&
  isMain(import.meta.url, globalThis.__filename)
) {
  await main();
} else if (
  typeof globalThis.$ === "undefined" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  // 裸 node 直跑：zx 全局未注入护墙。此前整段静默跳过 → Exit 0 零产物假成功。
  // 作为主模块落到这里时必须有声失败，指明真实入口。
  console.error(
    "archive.mjs must run under zx. Use `pnpm zip` or `npx zx src/scripts/archive.mjs`."
  );
  process.exitCode = 1;
}
