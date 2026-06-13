#!/usr/bin/env zx
import { argv, quote, $ } from "zx";

// 在 Windows 上使用 cmd.exe，避免 zx 默认使用 WSL bash 导致 node not found
if (process.platform === "win32") {
  $.shell = "cmd.exe";
  $.prefix = "";
  $.quote = quote
}

// 用法: zx src/scripts/build-task.mjs --target=chrome
const target = argv.target;

if (!target) {
  console.error(
    chalk.red("Error: Please specify a target, e.g., --target=chrome")
  );
  process.exit(1);
}

const buildRoot = "build";
const targetDir = path.join(buildRoot, target);

// 辅助：获取构建目录下的文件路径
const inDest = (file) => path.join(targetDir, file);

console.log(chalk.blue(`\n🚀 Starting build task for: ${chalk.bold(target)}`));

try {
  // 1. 【清理】 清空当前目标的构建目录
  await fs.remove(targetDir);

  // 2. 【构建】 区分普通构建和特殊构建（如 Edge）
  if (target === "edge") {
    // Edge 特殊逻辑：直接复制 Chrome 构建结果
    const chromeDir = path.join(buildRoot, "chrome");
    if (!(await fs.pathExists(chromeDir))) {
      throw new Error(
        'Chrome build not found! Please run "pnpm build:chrome" first.'
      );
    }
    await fs.copy(chromeDir, targetDir);
    console.log(chalk.green("✅ Copied Chrome build to Edge."));
  } else {
    // 标准 React 构建流程
    const clientEnv = target === "web" ? "userscript" : target;

    process.env.BUILD_PATH = `./${targetDir}`;
    process.env.REACT_APP_CLIENT = clientEnv;
    process.env.FORCE_COLOR = "1";
    process.env.NODE_OPTIONS = [
      process.env.NODE_OPTIONS,
      "--disable-warning=DEP0176",
    ]
      .filter(Boolean)
      .join(" ");

    console.log(chalk.gray(`Running react-app-rewired build...`));
    await $`react-app-rewired build`;
  }

  // 3. 【后处理】 文件清理与移动
  console.log(chalk.gray(`Running post-build cleanups...`));

  // -----------------------------------------------------------------------
  // 场景 A: Chrome, Edge, Safari (标准扩展)
  // -----------------------------------------------------------------------
  if (["chrome", "edge", "safari"].includes(target)) {
    // 1. 清理 HTML
    await fs.remove(inDest("content.html"));

    // 2. 清理多余的 Firefox/Thunderbird manifest
    await fs.remove(inDest("manifest.firefox.json"));
    await fs.remove(inDest("manifest.thunderbird.json"));
  }

  // -----------------------------------------------------------------------
  // 场景 B: Firefox, Thunderbird (需要替换 Manifest)
  // -----------------------------------------------------------------------
  if (["firefox", "thunderbird"].includes(target)) {
    await fs.remove(inDest("content.html"));

    const specificManifest = inDest(`manifest.${target}.json`);
    const finalManifest = inDest("manifest.json");

    if (await fs.pathExists(specificManifest)) {
      await fs.move(specificManifest, finalManifest, { overwrite: true });
    }

    // 清理所有残留的 manifest.*.json
    const files = await fs.readdir(targetDir);
    for (const f of files) {
      if (f.startsWith("manifest.") && f !== "manifest.json") {
        await fs.remove(inDest(f));
      }
    }
  }

  // -----------------------------------------------------------------------
  // 场景 C: Web (Userscript)
  // -----------------------------------------------------------------------
  if (target === "web") {
    // 1. Web 版不需要任何 manifest 文件
    const filesInDir = await fs.readdir(targetDir);
    for (const f of filesInDir) {
      if (f.startsWith("manifest") && f.endsWith(".json")) {
        await fs.remove(inDest(f));
      }
    }

    // 2. 将生成的普通 userscript 复制到 userscript 汇总目录
    const userscriptDir = path.join(buildRoot, "userscript");
    await fs.ensureDir(userscriptDir);

    for (const f of filesInDir) {
      // 重新遍历，因为上面可能删除了文件
      if (f.endsWith(".user.js")) {
        await fs.copy(inDest(f), path.join(userscriptDir, f));
      }
    }
  }

  console.log(
    chalk.green(`✅ Build task for [${target}] completed successfully!`)
  );
} catch (err) {
  console.error(chalk.red(`\n❌ Build failed for ${target}:`));
  console.error(err);
  process.exit(1);
}
