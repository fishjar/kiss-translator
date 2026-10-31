// 分发纯度闸（审计§四认定缺失的机器闸）：非测试、非分发器装配源的源码
// 不得直连 @mui/icons-material/*，必须从 components/icons 取图标。先于任何
// 调用点修改落此文件即红（7 个 P0 目标 + 2 个 Phase-2 deferred 命中）。
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..", "..");
const SKIP_DIRS = new Set([
  "node_modules", "build", ".git", ".kilo", "coverage", "public", "testdata", "tmp",
]);
// 分发器本体与生成器天然 import MUI/Lucide 上游，逐字豁免。
const ALLOWED_IMPORTERS = new Set([
  path.join(SRC, "components", "icons", "index.js"),
  path.join(SRC, "components", "icons", "lucide", "index.js"),
  path.join(SRC, "hooks", "M3Theme.js"),
  path.join(SRC, "homepage", "App.js"), // Phase-2 deferred
  path.join(SRC, "views", "FileTranslate", "EpubReaderView.js"), // Phase-2 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Runtime.js"), // Phase-2 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Asr.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Device.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Jev.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Layout.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Llm.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "LogViewer.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Models.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Ocr.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Tts.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "LocalAiTabs", "Vlm.js"), // PR3 deferred
  path.join(SRC, "views", "FileTranslate", "FileTranslateSettings.js"), // PR3 deferred
  path.join(SRC, "views", "FileTranslate", "FileTranslateToolbar.js"), // PR3 deferred
  path.join(SRC, "views", "FileTranslate", "FileTranslateView.js"), // PR3 deferred
  path.join(SRC, "views", "FileTranslate", "ImageViewerDialog.js"), // PR3 deferred
  path.join(SRC, "views", "FileTranslate", "PdfWorkspace.js"), // PR3 deferred
  path.join(SRC, "views", "RuleEditor", "index.js"), // PR3 deferred
  // 以下 2 个为变基新基（#1248 terminology 家族）带入的直连文件，随 PR3 收口。
  path.join(SRC, "views", "Options", "Playground.js"), // PR3 deferred
  path.join(SRC, "views", "Options", "TerminologyTables.js"), // PR3 deferred
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory())
      return SKIP_DIRS.has(entry) ? [] : walk(full);
    if (!/\.(js|jsx)$/.test(entry) || entry.includes(".test.")) return [];
    return [full];
  });

describe("consumer icon-dispatch purity", () => {
  test("no consumer file imports @mui/icons-material directly", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      if (ALLOWED_IMPORTERS.has(file)) continue;
      const text = readFileSync(file, "utf8");
      if (/from\s+["']@mui\/icons-material(?:\/|["'])/.test(text)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
