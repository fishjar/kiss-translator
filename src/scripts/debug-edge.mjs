import fs from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const extension = path.join(root, "build/edge-dev");
const profile = path.join(root, "tmp/edge-file-translate-profile");
const candidates = [
  process.env.EDGE_PATH,
  process.env["ProgramFiles(x86)"] &&
    path.join(
      process.env["ProgramFiles(x86)"],
      "Microsoft/Edge/Application/msedge.exe"
    ),
  process.env.ProgramFiles &&
    path.join(
      process.env.ProgramFiles,
      "Microsoft/Edge/Application/msedge.exe"
    ),
  process.env.LOCALAPPDATA &&
    path.join(
      process.env.LOCALAPPDATA,
      "Microsoft/Edge/Application/msedge.exe"
    ),
].filter(Boolean);
let edge;
for (const candidate of candidates) {
  if (
    await fs.access(candidate).then(
      () => true,
      () => false
    )
  ) {
    edge = candidate;
    break;
  }
}
if (!edge) throw new Error("未找到 Edge；可通过 EDGE_PATH 指定可执行文件。");
const manifest = JSON.parse(
  await fs.readFile(path.join(extension, "manifest.json"), "utf8").catch(() => {
    throw new Error("请先运行 pnpm build:edge-dev。");
  })
);
if (
  !manifest.content_scripts?.some(
    (entry) =>
      entry.js.includes("file-bridge.js") &&
      entry.matches.includes("http://localhost:3000/file-translate.html*")
  )
)
  throw new Error("开发扩展没有本地通信桥，请重新运行 pnpm build:edge-dev。");
await fetch("http://localhost:3000/file-translate.html", {
  signal: AbortSignal.timeout(5000),
}).catch(() => {
  throw new Error("请先运行 pnpm start:homepage，并保持服务运行。");
});
await fs.mkdir(profile, { recursive: true });
if (process.platform === "win32") {
  const { stdout } = await promisify(execFile)(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$debugInstances = @(Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('--user-data-dir=' + $env:KISS_FILE_DEBUG_PROFILE) -and $_.CommandLine -notlike '*--type=*' }); ($debugInstances.Count -gt 0) | ConvertTo-Json -Compress",
    ],
    {
      windowsHide: true,
      env: { ...process.env, KISS_FILE_DEBUG_PROFILE: profile },
    }
  );
  if (stdout.trim() === "true")
    throw new Error(
      "独立 Edge 调试配置已运行；请关闭该调试窗口后重试，以使 --load-extension 生效。"
    );
}
const child = spawn(
  edge,
  [
    `--user-data-dir=${profile}`,
    `--load-extension=${extension}`,
    "--no-first-run",
    "http://localhost:3000/file-translate.html",
  ],
  { detached: true, stdio: "ignore", windowsHide: true }
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.unref();
console.log(
  "Edge 已启动。请检查文件页的扩展版本与“开发构建”标识；若未连接，在 edge://extensions 加载 build/edge-dev。"
);
