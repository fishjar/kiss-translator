import fs from "fs";
import path from "path";
import { BUILTIN_RULES } from "./config/rules";

(() => {
  try {
    const data = JSON.stringify(BUILTIN_RULES, null, "  ");
    const file = path.resolve(
      __dirname,
      "../build/web/kiss-translator-rules.json"
    );
    fs.writeFileSync(file, data);
    console.info(`Built-in rules generated: ${file}`);
  } catch (err) {
    console.error(err);
  }
})();
