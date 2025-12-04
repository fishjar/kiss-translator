#!/usr/bin/env zx

console.log(chalk.cyan("\nBuilding iOS Userscript...\n"));

const srcFile = "build/web/kiss-translator.user.js";
const destFile = "build/web/kiss-translator-ios-safari.user.js";
const userscriptDir = "build/userscript"; // 目标汇总目录

try {
  // 1. 检查源文件
  if (!fs.existsSync(srcFile)) {
    throw new Error(
      `Source file not found: ${srcFile}. Run 'pnpm build:web' first.`
    );
  }

  // 2. 复制并重命名
  await fs.copy(srcFile, destFile);

  // 3. 读取并替换内容
  let content = await fs.readFile(destFile, "utf-8");

  const oldStr = "// @grant         unsafeWindow";
  const newStr = "// @inject-into   content";

  if (!content.includes(oldStr)) {
    console.warn(chalk.yellow(`Warning: Pattern "${oldStr}" not found.`));
  }

  content = content.replace(new RegExp(oldStr, "g"), newStr);

  // 4. 写入原 Web 目录
  await fs.writeFile(destFile, content, "utf-8");

  // 5. 同时复制一份到 userscript 目录
  await fs.ensureDir(userscriptDir);
  const iosDestInUserscript = path.join(userscriptDir, path.basename(destFile));
  await fs.copy(destFile, iosDestInUserscript);

  console.log(chalk.green(`✅ iOS Userscript generated at: ${destFile}`));
  console.log(chalk.green(`✅ Copied to: ${iosDestInUserscript}`));
} catch (err) {
  console.error(chalk.red("❌ Error building iOS userscript:"), err);
  process.exit(1);
}
