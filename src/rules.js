import fs from "fs";
import path from "path";
import { BUILTIN_RULES } from "./config/rules";

(() => {
  // rules
  try {
    const data = JSON.stringify(BUILTIN_RULES, null, 2);
    const file = path.resolve(
      __dirname,
      "../build/web/kiss-translator-rules.json"
    );
    fs.writeFileSync(file, data);
    console.info(`Built-in rules generated: ${file}`);
  } catch (err) {
    console.error(err);
  }

  // version
  try {
    var pjson = require("../package.json");
    const file = path.resolve(__dirname, "../build/web/version.txt");
    fs.writeFileSync(file, pjson.version);
    console.info(`Version file generated: ${file}`);
  } catch (err) {
    console.error(err);
  }
})();
