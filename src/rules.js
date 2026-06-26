import fs from "fs";
import path from "path";
import { BUILTIN_RULES } from "./config/rules";

/**
 * 这是一个在构建 (Build) 阶段由 Node.js 运行的辅助脚本。
 * 作用是生成内置规则的静态 JSON 文件以及记录当前版本号的文本文件，供云端分发与客户端检测更新。
 */
(() => {
  // 1. 生成内置翻译规则的静态 JSON 配置文件
  try {
    const data = JSON.stringify(BUILTIN_RULES, null, 2);
    // 生成的目标路径在打包输出文件夹的 web 目录下
    const file = path.resolve(
      __dirname,
      "../build/web/kiss-translator-rules.json"
    );
    fs.writeFileSync(file, data);
    console.info(`Built-in rules generated: ${file}`);
  } catch (err) {
    console.error("Failed to generate built-in rules file:", err);
  }

  // 2. 从 package.json 读取最新版本号并生成 version.txt，以供自动更新检测
  try {
    const packageFile = path.resolve(__dirname, "../package.json");
    const pjson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    const file = path.resolve(__dirname, "../build/web/version.txt");
    fs.writeFileSync(file, pjson.version);
    console.info(`Version file generated: ${file}`);
  } catch (err) {
    console.error("Failed to generate version file:", err);
  }
})();
