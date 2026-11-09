import fs from "node:fs/promises";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
// Only compile our trusted catalogue. No engine, downloads, endpoints, weights
// or model sessions belong in the FileTranslate frontend's task metadata.
const source = await fs.readFile(
  new URL("../localAi/core/catalog.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const exported = {};
new Function("exports", compiled)(exported);
const metadata = {
  asrTimestamps: Object.fromEntries(
    exported.CATALOG.filter(
      (model) => model.task === "asr" && model.wordTimestamps === true
    ).map((model) => [model.id, true])
  ),
  backends: Object.fromEntries(
    exported.CATALOG.map((model) => [model.id, model.backend])
  ),
  models: Object.fromEntries(
    exported.CATALOG.map((model) => [model.id, model.task])
  ),
  ocrGroups: exported.OCR_GROUPS.map(({ id, detId, recId }) => ({
    id,
    detId,
    recId,
  })),
};
await fs.writeFile(
  new URL("../config/localModelTasks.json", import.meta.url),
  JSON.stringify(metadata, null, 2) + "\n"
);
console.log("Updated local model task metadata.");
