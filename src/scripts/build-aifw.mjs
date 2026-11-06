#!/usr/bin/env node
import fs from "node:fs/promises";
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const AIFW_DIR = path.join(ROOT, "aifw");
const AIFW_JS_PACKAGE_JSON = path.join(
  AIFW_DIR,
  "libs",
  "aifw-js",
  "package.json"
);
const AIFW_JS_DIST = path.join(AIFW_DIR, "libs", "aifw-js", "dist");
const TARGET_DIR = path.join(ROOT, "src", "vendor", "aifw-js");
const STATE_DIR = path.join(ROOT, ".aifw-build");
// 项目内工具链目录（gitignored）：优先于系统 PATH 使用其中的二进制。
const TOOLCHAIN_DIR = path.join(ROOT, ".toolchain");
const LEGACY_TOOLCHAIN_DIR = path.join(STATE_DIR, "toolchain");
const MANIFEST_FILE = path.join(STATE_DIR, "manifest.json");
const ENTRY_NAME = "aifw-js.js";
const WASM_NAME = "wasm/liboneaifw_core.wasm";
const REQUIRED_CHUNKS = [
  { label: "libaifw-*.js", pattern: /^libaifw-.*\.js$/ },
  { label: "libner-*.js", pattern: /^libner-.*\.js$/ },
];
const REQUIRED_ZIG = "0.15";
const WASM_MAGIC = "0061736d";
const IS_WINDOWS = process.platform === "win32";
const EXCLUDED_SOURCE_DIRS = new Set([
  ".git",
  "node_modules",
  "zig-out",
  "zig-cache",
  ".zig-cache",
  "target",
  "dist",
  "ner-models",
  ".venv",
  "venv",
  "__pycache__",
  ".pnpm-store",
]);
const EXCLUDED_SOURCE_FILES = new Set(["pnpm-lock.yaml", "package-lock.json"]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function log(message) {
  console.log(`[aifw] ${message}`);
}

function warn(message, hint) {
  console.warn(`[aifw] warn: ${message}`);
  if (hint) console.warn(`[aifw]       提示: ${hint}`);
}

function error(message, hint) {
  console.error(`[aifw] error: ${message}`);
  if (hint) console.error(`[aifw]        提示: ${hint}`);
}

function envFlag(name) {
  const value = (process.env[name] ?? "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function parseArgs(argv) {
  const options = {
    strict: envFlag("AIFW_BUILD_STRICT"),
    skip: envFlag("AIFW_BUILD_SKIP"),
    force: false,
    help: false,
    unknown: [],
  };
  for (const arg of argv) {
    if (arg === "--strict") options.strict = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else options.unknown.push(arg);
  }
  return options;
}

function printHelp() {
  console.log(
    [
      "用法: node src/scripts/build-aifw.mjs [--strict] [--force] [--help]",
      "",
      "从 aifw 子模块构建 aifw-js 运行期产物，并原子同步到 src/vendor/aifw-js。",
      "",
      "选项:",
      "  --strict  前置条件缺失或构建失败时以退出码 1 失败（CI 使用）",
      "  --force   忽略 .aifw-build/manifest.json 指纹缓存，强制重新构建",
      "  --help    显示本帮助",
      "",
      "环境变量:",
      "  AIFW_BUILD_STRICT=1          等价于 --strict",
      "  AIFW_BUILD_SKIP=1            直接跳过构建（保留现有的 src/vendor/aifw-js）",
      "  AIFW_BUILD_INSTALL_TARGETS=1 wasm32-unknown-unknown 缺失时尝试",
      "                               rustup target add wasm32-unknown-unknown",
      "",
      "  .toolchain/ 是本地编译链（gitignored），可用 pnpm toolchain:download 下载 zig/pnpm。",
      "",
      "前置条件: aifw 子模块、zig 0.15.x、cargo、rustup（含 wasm32-unknown-unknown）、",
      "          sh（Windows 需 Git usr/bin）、pnpm。",
      "缺失前置条件时默认只 warn 并退出 0（仅当 src/vendor/aifw-js 已构建过）；",
      "目录不存在时退出 1 并提示安装工具链。",
    ].join("\n")
  );
}

function isExecutableFile(file) {
  try {
    if (!statSync(file).isFile()) return false;
    if (!IS_WINDOWS) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableNames(name) {
  if (!IS_WINDOWS || path.extname(name)) return [name];
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);
  return [...new Set(extensions.map((ext) => name + ext.toLowerCase()))];
}

function findExecutable(name) {
  const directories = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  const names = executableNames(name);
  for (const directory of directories) {
    for (const candidate of names) {
      const file = path.join(directory, candidate);
      if (isExecutableFile(file)) return file;
    }
  }
  return null;
}

function findShell() {
  const direct = findExecutable("sh");
  if (direct) return { path: direct, note: null };
  if (!IS_WINDOWS) return null;
  const candidates = [];
  const git = findExecutable("git");
  if (git) {
    const gitRoot = path.dirname(path.dirname(git));
    candidates.push(path.join(gitRoot, "usr", "bin", "sh.exe"));
    candidates.push(path.join(gitRoot, "bin", "sh.exe"));
  }
  for (const base of [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ]) {
    if (base) candidates.push(path.join(base, "Git", "usr", "bin", "sh.exe"));
  }
  for (const candidate of candidates) {
    if (isExecutableFile(candidate)) {
      return { path: candidate, note: "Git Bash" };
    }
  }
  return null;
}

function quoteShellToken(value) {
  return /[\s"&|<>^()]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Node 在 Windows 上不能直接 spawn .cmd/.bat（pnpm），需要通过 shell 调用；
// 参数预先拼进命令字符串，避免 shell:true + args 触发 DEP0190 警告。
function buildSpawn(file, args) {
  if (IS_WINDOWS && /\.(cmd|bat)$/i.test(file)) {
    const command = [`"${file}"`, ...args.map(quoteShellToken)].join(" ");
    return { file: command, args: [], shell: true };
  }
  return { file, args, shell: false };
}

function runCapture(file, args, options = {}) {
  const spawn = buildSpawn(file, args);
  const result = spawnSync(spawn.file, spawn.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    windowsHide: true,
    shell: spawn.shell,
    timeout: options.timeout ?? 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout,
    stderr,
    error: result.error,
  };
}

function runInherited(file, args, options = {}) {
  const spawn = buildSpawn(file, args);
  const result = spawnSync(spawn.file, spawn.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: "inherit",
    windowsHide: true,
    shell: spawn.shell,
    timeout: options.timeout ?? 0,
  });
  if (result.error) {
    throw new Error(`无法启动 ${path.basename(file)}: ${result.error.message}`);
  }
  return result.status;
}

const TOOL_SUFFIXES = IS_WINDOWS ? [".exe", ".cmd", ".bat"] : [""];

function matchesToolFile(fileName, name) {
  const lower = fileName.toLowerCase();
  const base = name.toLowerCase();
  return TOOL_SUFFIXES.some((suffix) => lower === base + suffix);
}

/** 在 .toolchain / 旧 .aifw-build/toolchain 中递归查找二进制（限深）。 */
function findInToolchainDir(directory, name, depth = 0) {
  if (depth > 4) return null;
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isDirectory() || !matchesToolFile(entry.name, name)) continue;
    const file = path.join(directory, entry.name);
    if (isExecutableFile(file)) return file;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findInToolchainDir(
      path.join(directory, entry.name),
      name,
      depth + 1
    );
    if (found) return found;
  }
  return null;
}

/** 查找顺序：.toolchain → 旧 .aifw-build/toolchain → 系统 PATH。 */
function findPreferred(name) {
  for (const directory of [TOOLCHAIN_DIR, LEGACY_TOOLCHAIN_DIR]) {
    const found = findInToolchainDir(directory, name);
    if (found) return { file: found, source: "toolchain" };
  }
  const file = findExecutable(name);
  return file ? { file, source: "path" } : null;
}

function detectTool(name, versionArgs) {
  const preferred = findPreferred(name);
  if (!preferred) return { name, found: false, path: null, version: null };
  const result = runCapture(preferred.file, versionArgs, { timeout: 30000 });
  return {
    name,
    found: true,
    path: preferred.file,
    version: result.ok ? result.stdout.split(/\r?\n/)[0].trim() : null,
    error: result.ok ? null : (result.error?.message ?? result.stderr),
    source: preferred.source,
  };
}

function detectShell() {
  const shell = findShell();
  if (!shell) return { name: "sh", found: false, path: null, note: null };
  const probe = runCapture(shell.path, ["-c", "exit 0"], { timeout: 15000 });
  return {
    name: "sh",
    found: probe.ok,
    path: shell.path,
    note: shell.note,
    error: probe.ok ? null : (probe.error?.message ?? probe.stderr),
  };
}

function detectWasmTarget(rustup) {
  if (!rustup.found) return { installed: false, triedInstall: false };
  const list = () =>
    runCapture(rustup.path, ["target", "list"], { timeout: 60000 });
  let result = list();
  let installed =
    result.ok && /^wasm32-unknown-unknown \(installed\)$/m.test(result.stdout);
  let triedInstall = false;
  if (!installed && envFlag("AIFW_BUILD_INSTALL_TARGETS")) {
    triedInstall = true;
    log("缺少 wasm32-unknown-unknown，尝试 rustup target add ...");
    runInherited(rustup.path, ["target", "add", "wasm32-unknown-unknown"], {
      timeout: 600000,
    });
    result = list();
    installed =
      result.ok &&
      /^wasm32-unknown-unknown \(installed\)$/m.test(result.stdout);
  }
  return { installed, triedInstall };
}

/** 环境变量显式覆盖优先；否则按 .toolchain → 旧目录 → PATH 查找。 */
function detectToolWithOverride(name, versionArgs, overrideEnv) {
  const override = process.env[overrideEnv];
  if (override) {
    const file = path.resolve(override);
    if (isExecutableFile(file)) {
      const result = runCapture(file, versionArgs, { timeout: 30000 });
      return {
        name,
        found: true,
        path: file,
        version: result.ok ? result.stdout.split(/\r?\n/)[0].trim() : null,
        error: result.ok ? null : (result.error?.message ?? result.stderr),
        source: "override",
      };
    }
  }
  return detectTool(name, versionArgs);
}

function detectZig() {
  return detectToolWithOverride("zig", ["version"], "AIFW_ZIG_PATH");
}

function detectPnpm() {
  return detectToolWithOverride("pnpm", ["--version"], "AIFW_PNPM_PATH");
}

function detectToolchain() {
  const toolchain = {
    zig: detectZig(),
    cargo: detectTool("cargo", ["--version"]),
    rustup: detectTool("rustup", ["--version"]),
    pnpm: detectPnpm(),
    sh: detectShell(),
  };
  toolchain.wasmTarget = detectWasmTarget(toolchain.rustup);
  return toolchain;
}

function versionText(tool) {
  if (!tool.found) return "missing";
  const version = tool.version ?? "unknown";
  return version.replace(new RegExp(`^${tool.name}\\s+`, "i"), "");
}

function zigVersionMatches(version) {
  const match = /^(\d+)\.(\d+)\./.exec(version ?? "");
  return Boolean(match) && `${match[1]}.${match[2]}` === REQUIRED_ZIG;
}

function sourceLabel(tool) {
  if (tool.source === "toolchain") return "本地 .toolchain";
  if (tool.source === "override") return "环境变量";
  return "系统 PATH";
}

function toolchainDirExists() {
  try {
    return statSync(TOOLCHAIN_DIR).isDirectory();
  } catch {
    return false;
  }
}

function reportToolchain(toolchain) {
  const parts = [];
  if (toolchain.zig.found)
    parts.push(
      `zig ${versionText(toolchain.zig)}（${sourceLabel(toolchain.zig)}）`
    );
  if (toolchain.cargo.found)
    parts.push(
      `cargo ${versionText(toolchain.cargo)}（${sourceLabel(toolchain.cargo)}）`
    );
  if (toolchain.rustup.found)
    parts.push(
      `rustup ${versionText(toolchain.rustup)}（${sourceLabel(toolchain.rustup)}）`
    );
  if (toolchain.rustup.found)
    parts.push(
      toolchain.wasmTarget.installed
        ? "wasm32-unknown-unknown 已安装"
        : "wasm32-unknown-unknown 未安装"
    );
  if (toolchain.sh.found)
    parts.push(
      `sh ${toolchain.sh.note ? `(${toolchain.sh.note}) ` : ""}${toolchain.sh.path}`
    );
  if (toolchain.pnpm.found)
    parts.push(
      `pnpm ${versionText(toolchain.pnpm)}（${sourceLabel(toolchain.pnpm)}）`
    );
  log(
    parts.length > 0 ? `工具链: ${parts.join(" | ")}` : "工具链: 未找到可用工具"
  );
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function relativePosix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

async function listFilesWithSize(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        const stats = await fs.stat(absolute);
        files.push({
          absolute,
          name: relativePosix(root, absolute),
          bytes: stats.size,
        });
      }
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

function totalBytes(files) {
  return files.reduce((total, file) => total + file.bytes, 0);
}

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`;
}

async function listSourceFiles(root) {
  const files = [];
  const walk = async (directory) => {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_SOURCE_DIRS.has(entry.name)) {
          await walk(path.join(directory, entry.name));
        }
      } else if (entry.isFile()) {
        if (!EXCLUDED_SOURCE_FILES.has(entry.name)) {
          files.push(path.join(directory, entry.name));
        }
      }
    }
  };
  await walk(root);
  return files;
}

async function hashSubmoduleSource() {
  const files = await listSourceFiles(AIFW_DIR);
  const records = [];
  for (const file of files) {
    records.push([
      relativePosix(AIFW_DIR, file),
      sha256(await fs.readFile(file)),
    ]);
  }
  return sha256(JSON.stringify(records));
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return IS_WINDOWS
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

async function gitSubmoduleHead() {
  const git = findExecutable("git");
  if (!git) return null;
  const topLevel = runCapture(
    git,
    ["-C", AIFW_DIR, "rev-parse", "--show-toplevel"],
    { timeout: 30000 }
  );
  // 只有 aifw 自身是 git 仓库（子模块）时才使用 HEAD；否则回退到源码哈希，
  // 避免在 aifw 只是普通目录时误用外层仓库的 HEAD。
  if (!topLevel.ok || !samePath(topLevel.stdout, AIFW_DIR)) return null;
  const head = runCapture(git, ["-C", AIFW_DIR, "rev-parse", "HEAD"], {
    timeout: 30000,
  });
  return head.ok && /^[0-9a-f]{40}$/i.test(head.stdout) ? head.stdout : null;
}

async function computeFingerprint(toolchain, head) {
  const records = {
    schema: 1,
    submodule: head ?? `source:${await hashSubmoduleSource()}`,
    script: sha256(await fs.readFile(SCRIPT_PATH)),
    zig: versionText(toolchain.zig),
    cargo: versionText(toolchain.cargo),
    rustup: versionText(toolchain.rustup),
    wasmTarget: toolchain.wasmTarget.installed ? "installed" : "missing",
    pnpm: versionText(toolchain.pnpm),
    platform: `${process.platform}/${process.arch}`,
    node: process.version,
  };
  return sha256(JSON.stringify(records));
}

async function readManifest() {
  try {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8"));
    return manifest && typeof manifest === "object" ? manifest : null;
  } catch {
    return null;
  }
}

async function targetIsComplete(manifest) {
  if (
    !(await pathExists(path.join(TARGET_DIR, ENTRY_NAME))) ||
    !(await pathExists(path.join(TARGET_DIR, WASM_NAME)))
  ) {
    return false;
  }
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (files.length === 0) return false;
  for (const file of files) {
    if (!file || typeof file.name !== "string") return false;
    if (!(await pathExists(path.join(TARGET_DIR, file.name)))) return false;
  }
  return true;
}

async function assertWasm(file, label) {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, 4, 0);
    if (bytesRead !== 4 || header.toString("hex") !== WASM_MAGIC) {
      throw new Error(`${label} 不是有效的 WebAssembly 模块`);
    }
  } finally {
    await handle.close();
  }
}

async function validateRuntimeDir(directory, label) {
  const files = await listFilesWithSize(directory);
  const names = new Set(files.map((file) => file.name));
  for (const required of [ENTRY_NAME, WASM_NAME]) {
    if (!names.has(required)) throw new Error(`${label} 缺少 ${required}`);
  }
  for (const chunk of REQUIRED_CHUNKS) {
    const found = files.some(
      (file) => !file.name.includes("/") && chunk.pattern.test(file.name)
    );
    if (!found) throw new Error(`${label} 缺少 ${chunk.label}`);
  }
  const entry = await fs.readFile(path.join(directory, ENTRY_NAME), "utf8");
  if (!entry.includes("libaifw-")) {
    throw new Error(`${label} 的 ${ENTRY_NAME} 未引用 libaifw- 分包`);
  }
  await assertWasm(path.join(directory, WASM_NAME), `${label} 的 ${WASM_NAME}`);
  return files;
}

async function checkPrerequisites(toolchain) {
  reportToolchain(toolchain);
  if (toolchainDirExists()) {
    for (const tool of [toolchain.zig, toolchain.pnpm]) {
      if (tool.found && tool.source === "path") {
        warn(
          `正在使用系统 PATH 中的 ${tool.name}（可能被其他版本干扰）；建议运行 pnpm toolchain:download 安装本地编译链 .toolchain/。`
        );
      }
    }
  }
  const problems = [];
  if (!(await pathExists(AIFW_JS_PACKAGE_JSON))) {
    problems.push({
      name: "aifw 子模块",
      detail: "缺少 aifw/libs/aifw-js/package.json",
      hint: "git submodule update --init --recursive",
    });
  }
  if (!toolchain.zig.found) {
    problems.push({
      name: "zig",
      detail: "未找到 zig 命令（需要 0.15.x）",
      hint: "安装 Zig 0.15.x 并加入 PATH；CI 由 mlugg/setup-zig@v2 (0.15.2) 提供",
    });
  } else if (!toolchain.zig.version) {
    problems.push({
      name: "zig",
      detail: `zig version 执行失败: ${toolchain.zig.error ?? "未知错误"}`,
      hint: "重新安装 Zig 0.15.x 并确认 zig version 可执行",
    });
  } else if (!zigVersionMatches(toolchain.zig.version)) {
    problems.push({
      name: "zig",
      detail: `zig 版本 ${toolchain.zig.version} 不兼容（需要 0.15.x）`,
      hint: "安装 Zig 0.15.x；CI 由 mlugg/setup-zig@v2 (0.15.2) 提供",
    });
  }
  if (!toolchain.cargo.found) {
    problems.push({
      name: "cargo",
      detail: "未找到 cargo 命令",
      hint: "通过 rustup 安装 Rust 工具链（https://rustup.rs）",
    });
  }
  if (!toolchain.rustup.found) {
    problems.push({
      name: "rustup",
      detail: "未找到 rustup 命令",
      hint: "安装 rustup（https://rustup.rs）",
    });
  } else if (!toolchain.wasmTarget.installed) {
    problems.push({
      name: "rust wasm target",
      detail: "缺少 wasm32-unknown-unknown target",
      hint: "rustup target add wasm32-unknown-unknown（或设置 AIFW_BUILD_INSTALL_TARGETS=1 自动安装）",
    });
  }
  if (!toolchain.sh.found) {
    problems.push({
      name: "sh",
      detail: "未找到可用的 sh（build.zig 需要 sh -lc）",
      hint: IS_WINDOWS
        ? "安装 Git for Windows，并把 <Git>/usr/bin 加入 PATH"
        : "安装 POSIX shell（sh）",
    });
  }
  if (!toolchain.pnpm.found) {
    problems.push({
      name: "pnpm",
      detail: "未找到 pnpm 命令",
      hint: "安装 pnpm（CI 使用 9.14.4）",
    });
  }
  return problems;
}

function buildEnvironment(toolchain) {
  const env = { ...process.env };
  // Windows 的 process.env 可能保留 "Path" 这种大小写；如果同时写入 "PATH"，
  // 子进程环境块里会出现两个仅大小写不同的键，zig/cargo 的 PATH 查找可能取到
  // 未合并的旧值（表现为 cargo FileNotFound）。这里统一成一个键。
  const pathKeys = Object.keys(env).filter(
    (key) => key.toUpperCase() === "PATH"
  );
  const current = pathKeys.length > 0 ? String(env[pathKeys[0]] ?? "") : "";
  const currentEntries = current.split(path.delimiter).filter(Boolean);
  const extraPaths = [];
  for (const tool of [
    toolchain.sh,
    toolchain.zig,
    toolchain.cargo,
    toolchain.rustup,
    toolchain.pnpm,
  ]) {
    if (!tool?.found || !tool.path) continue;
    const directory = path.dirname(tool.path);
    if (
      !currentEntries.includes(directory) &&
      !extraPaths.includes(directory)
    ) {
      extraPaths.push(directory);
    }
  }
  for (const key of pathKeys) delete env[key];
  if (currentEntries.length > 0 || extraPaths.length > 0) {
    env.PATH = [...extraPaths, ...currentEntries].join(path.delimiter);
  }
  // 缓存放进项目内 .toolchain（gitignored），避免 %LOCALAPPDATA%\zig 在受限
  // 环境下不可写（会报 “failed to check cache: manifest_create AccessDenied”）。
  env.ZIG_GLOBAL_CACHE_DIR ??= path.join(TOOLCHAIN_DIR, "zig-cache");
  env.ZIG_LOCAL_CACHE_DIR ??= path.join(TOOLCHAIN_DIR, "zig-local-cache");
  return env;
}

function runBuildStep(file, args, options) {
  const status = runInherited(file, args, {
    cwd: options.cwd,
    env: options.env,
  });
  if (status !== 0) {
    throw new Error(`${options.label} 失败（退出码 ${status ?? "unknown"}）`);
  }
}

async function removeStaleStaging() {
  const parent = path.dirname(TARGET_DIR);
  const entries = await fs.readdir(parent).catch(() => []);
  for (const entry of entries) {
    if (!/^aifw-js\.(tmp|old)-\d+$/.test(entry)) continue;
    await fs.rm(path.join(parent, entry), { recursive: true, force: true });
  }
}

async function replaceTarget() {
  const stage = `${TARGET_DIR}.tmp-${process.pid}`;
  const backup = `${TARGET_DIR}.old-${process.pid}`;
  await removeStaleStaging();
  await fs.mkdir(path.dirname(TARGET_DIR), { recursive: true });
  await fs.rm(stage, { recursive: true, force: true });
  let backedUp = false;
  try {
    await fs.cp(AIFW_JS_DIST, stage, { recursive: true });
    await validateRuntimeDir(stage, "暂存的 aifw-js 产物");
    try {
      await fs.rename(TARGET_DIR, backup);
      backedUp = true;
    } catch (renameError) {
      if (renameError.code !== "ENOENT") throw renameError;
    }
    try {
      await fs.rename(stage, TARGET_DIR);
    } catch (renameError) {
      if (backedUp) await fs.rename(backup, TARGET_DIR).catch(() => {});
      backedUp = false;
      throw renameError;
    }
    if (backedUp) await fs.rm(backup, { recursive: true, force: true });
  } catch (buildError) {
    await fs.rm(stage, { recursive: true, force: true });
    throw buildError;
  }
  return validateRuntimeDir(TARGET_DIR, "src/vendor/aifw-js");
}

const BUILD_ZIG = path.join(AIFW_DIR, "build.zig");
const WASM_INSTALL_MARKER = "b.addInstallArtifact(wasm_exe";

/**
 * 上游 build.zig 的 web:wasm step 只编译 wasm，不写 zig-out；这里在构建期间
 * 临时补一条 install artifact 依赖（随后恢复原文件），让 copy-assets.mjs 能拿到
 * zig-out/bin/liboneaifw_core.wasm。
 */
async function withInstalledWasmArtifact(env, toolchain) {
  const original = await fs.readFile(BUILD_ZIG, "utf8");
  let patched = original;
  if (!original.includes(WASM_INSTALL_MARKER)) {
    const anchor = "web_step.dependOn(&wasm_exe.step);";
    if (!original.includes(anchor)) {
      throw new Error(
        "build.zig 结构变化：找不到 web_step.dependOn(&wasm_exe.step)"
      );
    }
    patched = original.replace(
      anchor,
      anchor +
        "\n    web_step.dependOn(&b.addInstallArtifact(wasm_exe, .{}).step);"
    );
    await fs.writeFile(BUILD_ZIG, patched);
  }
  try {
    runBuildStep(
      toolchain.zig.path,
      ["build", "-Doptimize=Debug", "web:wasm"],
      {
        cwd: AIFW_DIR,
        env,
        label: "zig build -Doptimize=Debug web:wasm",
      }
    );
  } finally {
    if (patched !== original) await fs.writeFile(BUILD_ZIG, original);
  }
}

async function buildRuntime(toolchain) {
  const env = buildEnvironment(toolchain);
  const pnpm = toolchain.pnpm.path;
  log("安装 @oneaifw/aifw-js 依赖 ...");
  const installArgs = [
    "install",
    "--filter",
    "@oneaifw/aifw-js",
    "--ignore-scripts",
  ];
  try {
    runBuildStep(pnpm, ["--dir", "aifw", ...installArgs], {
      cwd: ROOT,
      env,
      label: "pnpm --dir aifw install",
    });
  } catch (installError) {
    warn(
      `pnpm --dir aifw install 失败，回退到 pnpm -C: ${installError.message}`
    );
    runBuildStep(pnpm, ["-C", "aifw", ...installArgs], {
      cwd: ROOT,
      env,
      label: "pnpm -C aifw install",
    });
  }
  // build.zig 的 web:wasm step 只编译 wasm_exe，不会 install 到 zig-out；
  // copy-assets.mjs 需要 zig-out/bin/liboneaifw_core.wasm，因此构建期间临时给
  // web:wasm 增加 install artifact，结束后恢复 build.zig 原文。
  log("构建核心 WASM（zig build -Doptimize=Debug web:wasm）...");
  await withInstalledWasmArtifact(env, toolchain);
  log("打包 aifw-js（pnpm --filter @oneaifw/aifw-js build）...");
  runBuildStep(pnpm, ["--filter", "@oneaifw/aifw-js", "build"], {
    cwd: AIFW_DIR,
    env,
    label: "pnpm --filter @oneaifw/aifw-js build",
  });
  const distFiles = await validateRuntimeDir(AIFW_JS_DIST, "aifw-js dist");
  log(
    `构建产物校验通过: ${distFiles.length} 个文件，${formatBytes(totalBytes(distFiles))}`
  );
  const installed = await replaceTarget();
  log("已同步到 src/vendor/aifw-js:");
  for (const file of installed) {
    log(`  ${file.name} (${formatBytes(file.bytes)})`);
  }
  log(`合计 ${formatBytes(totalBytes(installed))}`);
  return installed;
}

async function writeManifest({ fingerprint, head }) {
  try {
    const files = await listFilesWithSize(TARGET_DIR);
    const manifest = {
      fingerprint,
      submoduleHead: head,
      builtAt: new Date().toISOString(),
      files: [],
    };
    for (const file of files) {
      manifest.files.push({
        name: file.name,
        bytes: file.bytes,
        sha256: sha256(await fs.readFile(file.absolute)),
      });
    }
    await fs.mkdir(STATE_DIR, { recursive: true });
    const temporary = `${MANIFEST_FILE}.tmp-${process.pid}`;
    await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    await fs.rename(temporary, MANIFEST_FILE);
  } catch (manifestError) {
    warn(
      `写入 .aifw-build/manifest.json 失败: ${manifestError instanceof Error ? manifestError.message : String(manifestError)}`
    );
  }
}

async function fallbackToCommitted() {
  try {
    const files = await validateRuntimeDir(TARGET_DIR, "src/vendor/aifw-js");
    log(
      `保留现有产物 src/vendor/aifw-js（${files.length} 个文件，${formatBytes(totalBytes(files))}）。`
    );
    return 0;
  } catch (committedError) {
    error(
      `src/vendor/aifw-js 不存在或不可用（此前未构建过）: ${committedError instanceof Error ? committedError.message : String(committedError)}`
    );
    error(
      "请安装 zig 0.15.x 与 rust wasm32-unknown-unknown（或设置 AIFW_ZIG_PATH）后运行 pnpm build:aifw。"
    );
    return 1;
  }
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }
  if (options.unknown.length > 0) {
    error(`未知参数: ${options.unknown.join(" ")}`);
    printHelp();
    return 2;
  }
  if (options.skip) {
    log("AIFW_BUILD_SKIP=1，跳过 aifw 运行期产物构建。");
    return 0;
  }

  log("从 aifw 子模块准备 aifw-js 运行期产物 ...");
  const toolchain = detectToolchain();
  const head = await gitSubmoduleHead();
  const fingerprint = await computeFingerprint(toolchain, head);
  log(
    `aifw 子模块: ${head ? head.slice(0, 12) : "源码哈希回退"}；构建指纹: ${fingerprint.slice(0, 12)}`
  );

  if (options.force) {
    log("--force：忽略 .aifw-build 缓存指纹。");
  } else {
    const cached = await readManifest();
    if (cached && cached.fingerprint === fingerprint) {
      if (await targetIsComplete(cached)) {
        log("src/vendor/aifw-js 已是最新（指纹一致），跳过构建。");
        return 0;
      }
    }
  }

  const problems = await checkPrerequisites(toolchain);
  if (problems.length > 0) {
    for (const problem of problems) {
      warn(`缺少前置条件 - ${problem.name}: ${problem.detail}`, problem.hint);
    }
    if (options.strict) {
      error(
        `strict 模式：aifw 前置条件缺失（${problems
          .map((problem) => problem.name)
          .join(", ")}），无法构建。`
      );
      return 1;
    }
    warn("已跳过 aifw 构建，继续使用现有的 src/vendor/aifw-js 产物。");
    return fallbackToCommitted();
  }

  try {
    await buildRuntime(toolchain);
  } catch (buildError) {
    const message =
      buildError instanceof Error ? buildError.message : String(buildError);
    if (options.strict) {
      error(`strict 模式：aifw 构建失败 - ${message}`);
      return 1;
    }
    warn(`aifw 构建失败: ${message}`);
    warn("继续使用现有的 src/vendor/aifw-js 产物。");
    return fallbackToCommitted();
  }

  await writeManifest({ fingerprint, head });
  log("aifw 运行期产物已更新。");
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (fatalError) {
  error(
    `未预期的失败: ${fatalError instanceof Error ? fatalError.message : String(fatalError)}`
  );
  process.exitCode = 1;
}
