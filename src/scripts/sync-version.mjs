#!/usr/bin/env zx
import { $ } from "zx";

/**
 * 版本号同步脚本
 * 从 package.json 读取版本号，自动同步到其他配置文件
 */

const rootDir = path.resolve(__dirname, "../..");

// 读取 package.json 中的版本号
const pkgPath = path.join(rootDir, "package.json");
const pkg = await fs.readJSON(pkgPath);
const version = pkg.version;

console.log(chalk.blue(`📦 从 package.json 读取版本号: ${chalk.bold(version)}`));

// 需要同步的文件列表
const filesToSync = [
    {
        path: path.join(rootDir, ".env"),
        type: "env",
        pattern: /^REACT_APP_VERSION=.+$/m,
        replacement: `REACT_APP_VERSION=${version}`,
    },
    {
        path: path.join(rootDir, "public/manifest.json"),
        type: "json",
        key: "version",
    },
    {
        path: path.join(rootDir, "public/manifest.firefox.json"),
        type: "json",
        key: "version",
    },
    {
        path: path.join(rootDir, "public/manifest.thunderbird.json"),
        type: "json",
        key: "version",
    },
];

let syncCount = 0;

// 遍历并更新每个文件
for (const file of filesToSync) {
    try {
        if (file.type === "env") {
            // 处理 .env 文件
            let content = await fs.readFile(file.path, "utf-8");
            const newContent = content.replace(file.pattern, file.replacement);

            if (content !== newContent) {
                await fs.writeFile(file.path, newContent, "utf-8");
                console.log(chalk.green(`✅ 已更新: ${path.relative(rootDir, file.path)}`));
                syncCount++;
            } else {
                console.log(chalk.gray(`⏭️  无需更新: ${path.relative(rootDir, file.path)}`));
            }
        } else if (file.type === "json") {
            // 处理 JSON 文件
            const jsonData = await fs.readJSON(file.path);

            if (jsonData[file.key] !== version) {
                jsonData[file.key] = version;
                await fs.writeJSON(file.path, jsonData, { spaces: 2 });
                console.log(chalk.green(`✅ 已更新: ${path.relative(rootDir, file.path)}`));
                syncCount++;
            } else {
                console.log(chalk.gray(`⏭️  无需更新: ${path.relative(rootDir, file.path)}`));
            }
        }
    } catch (err) {
        console.error(chalk.red(`❌ 更新失败: ${path.relative(rootDir, file.path)}`));
        console.error(err.message);
    }
}

console.log(chalk.blue(`\n🎉 版本号同步完成！共更新 ${syncCount} 个文件到版本 ${chalk.bold(version)}`));
