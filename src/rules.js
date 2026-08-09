import fs from "fs";
import path from "path";
import { BUILTIN_RULES } from "./config/rules";

/**
 * 这是一个在构建 (Build) 阶段由 Node.js 运行的辅助脚本。
 * 作用是生成内置规则的静态 JSON 文件，供云端分发。
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
})();
