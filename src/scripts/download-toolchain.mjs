#!/usr/bin/env node
/**
 * @file download-toolchain.mjs
 * @description 下载/校验项目本地编译链（local toolchain）。
 *
 * 目的：把 zig 0.15.x、pnpm 9.14.4 固定到项目内的 .toolchain/（已 gitignore），
 * 让构建脚本优先使用它们，避免本机 PATH 里其他版本的 zig/pnpm 干扰。
 * Rust 的 wasm32-unknown-unknown target 仍由系统 rustup 管理，本脚本只检查并提示。
 *
 * 用法:
 *   node src/scripts/download-toolchain.mjs            # 下载缺少的组件并校验
 *   node src/scripts/download-toolchain.mjs --check    # 只校验（CI/本地自检）
 *   node src/scripts/download-toolchain.mjs --force    # 强制重新下载
 *   node src/scripts/download-toolchain.mjs --zig-only # 只处理 zig
 *   node src/scripts/download-toolchain.mjs --pnpm-only# 只处理 pnpm
 */

import fs from "node:fs/promises";
import { createWriteStream, readdirSync } from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const TOOLCHAIN_DIR = path.join(ROOT, ".toolchain");
const DOWNLOADS_DIR = path.join(TOOLCHAIN_DIR, "downloads");
const ZIG_VERSION = "0.15.2";
const PNPM_VERSION = "9.14.4";
const ZIG_INDEX_URL = "https://ziglang.org/download/index.json";
const ZIG_MIRROR_URL = "https://pkg.machengine.org/zig/";
const PNPM_TARBALL_URL =
  "https://registry.npmjs.org/pnpm/-/pnpm-" + PNPM_VERSION + ".tgz";
const IS_WINDOWS = process.platform === "win32";

function log(message) {
  console.log("[toolchain] " + message);
}

function warn(message) {
  console.warn("[toolchain] warn: " + message);
}

function fail(message) {
  console.error("[toolchain] error: " + message);
}

function parseArgs(argv) {
  const options = { check: false, force: false, zig: true, pnpm: true };
  for (const arg of argv) {
    if (arg === "--check") options.check = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--zig-only") options.pnpm = false;
    else if (arg === "--pnpm-only") options.zig = false;
    else if (arg === "--help") {
      console.log(
        [
          "用法: node src/scripts/download-toolchain.mjs [--check] [--force] [--zig-only] [--pnpm-only]",
          "",
          "下载 zig " +
            ZIG_VERSION +
            " 与 pnpm " +
            PNPM_VERSION +
            " 到 .toolchain/（gitignored），",
          "构建脚本会优先使用这里的二进制，而不是系统 PATH 中的版本。",
          "Rust 的 wasm32-unknown-unknown 由系统 rustup 管理，这里只检查。",
        ].join("\n")
      );
      process.exit(0);
    } else {
      fail("未知参数: " + arg);
      process.exit(2);
    }
  }
  return options;
}

function platformKey() {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const os =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : process.platform === "linux"
          ? "linux"
          : null;
  if (!os) throw new Error("不支持的平台: " + process.platform);
  return arch + "-" + os;
}

async function fetchJson(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error("GET " + url + " -> " + response.status);
  return response.json();
}

async function downloadTo(url, destination, expectedSha) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      log("下载 " + url + "（第 " + attempt + " 次）...");
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || !response.body) {
        throw new Error("HTTP " + response.status);
      }
      const partial = destination + ".part";
      const hash = createHash("sha256");
      const writer = createWriteStream(partial);
      const source = Readable.fromWeb(response.body);
      source.on("data", (chunk) => hash.update(chunk));
      await pipeline(source, writer);
      const digest = hash.digest("hex");
      if (expectedSha && digest !== expectedSha) {
        await fs.rm(partial, { force: true });
        throw new Error("sha256 不匹配: " + digest + " != " + expectedSha);
      }
      await fs.rename(partial, destination);
      return;
    } catch (err) {
      lastError = err;
      warn("下载失败: " + (err instanceof Error ? err.message : String(err)));
    }
  }
  throw new Error(
    "下载 " +
      url +
      " 失败: " +
      (lastError instanceof Error ? lastError.message : String(lastError))
  );
}

function run(file, args, options) {
  const settings = options || {};
  const result = spawnSync(file, args, {
    cwd: settings.cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: settings.timeout || 300000,
  });
  if (result.error) return { ok: false, error: result.error.message };
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function matchesName(fileName, name) {
  const lower = fileName.toLowerCase();
  const base = name.toLowerCase();
  if (lower === base) return true;
  if (!IS_WINDOWS) return false;
  return (
    lower === base + ".exe" ||
    lower === base + ".cmd" ||
    lower === base + ".bat"
  );
}

function findExecutableIn(directory, name, depth) {
  const level = depth || 0;
  if (level > 5) return null;
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (matchesName(entry.name, name)) return path.join(directory, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findExecutableIn(
      path.join(directory, entry.name),
      name,
      level + 1
    );
    if (found) return found;
  }
  return null;
}

/** 跨目录/跨盘移动：优先 rename，失败时退化为复制后删除。 */
async function movePath(source, target) {
  try {
    await fs.rename(source, target);
  } catch (err) {
    if (err && err.code !== "EXDEV") throw err;
    await fs.cp(source, target, { recursive: true });
    await fs.rm(source, { recursive: true, force: true });
  }
}

async function extractArchive(archive, destination) {
  await fs.mkdir(destination, { recursive: true });
  const result = run("tar", ["-xf", archive, "-C", destination], {
    timeout: 600000,
  });
  if (!result.ok) {
    throw new Error("解压失败（tar -xf）: " + (result.error || result.stderr));
  }
}

async function installZig(options) {
  const key = platformKey();
  const existing = findExecutableIn(TOOLCHAIN_DIR, "zig", 0);
  if (existing && !options.force) {
    const version = run(existing, ["version"]);
    if (version.ok && version.stdout === ZIG_VERSION) {
      log("zig " + ZIG_VERSION + " 已存在: " + existing);
      return existing;
    }
    warn(
      "已存在的 zig 版本为 " +
        (version.stdout || "unknown") +
        "，需要 " +
        ZIG_VERSION
    );
  }
  if (options.check) {
    throw new Error(
      "缺少 zig " + ZIG_VERSION + "，请运行 pnpm toolchain:download"
    );
  }

  log("获取 Zig " + ZIG_VERSION + " 下载信息...");
  const index = await fetchJson(ZIG_INDEX_URL);
  const release = index[ZIG_VERSION];
  if (!release) throw new Error("Zig 索引中没有版本 " + ZIG_VERSION);
  const entry = release[key];
  if (!entry || !entry.tarball) {
    throw new Error("Zig " + ZIG_VERSION + " 没有平台 " + key + " 的下载项");
  }
  const tarball = entry.tarball;
  const filename = tarball.split("/").pop();
  const archive = path.join(DOWNLOADS_DIR, filename);
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
  const exists = await fs.stat(archive).catch(() => null);
  if (!exists || options.force) {
    try {
      await downloadTo(tarball, archive, entry.shasum);
    } catch (err) {
      warn(
        "官方源失败，尝试镜像: " +
          (err instanceof Error ? err.message : String(err))
      );
      await downloadTo(ZIG_MIRROR_URL + filename, archive, entry.shasum);
    }
  }
  // 先在系统临时目录解压，再移入项目：既避免半成品留在 .toolchain，
  // 也避免在受限 Windows 环境里让工具链继承工作区的 ACL 限制。
  const temp = path.join(os.tmpdir(), "_kiss_aifw_zig_" + process.pid);
  await fs.rm(temp, { recursive: true, force: true });
  await fs.mkdir(temp, { recursive: true });
  try {
    await extractArchive(archive, temp);
    const entries = await fs.readdir(temp, { withFileTypes: true });
    const rootEntry = entries.find((entry) => entry.isDirectory());
    if (!rootEntry) throw new Error("解压后找不到 zig 目录");
    const target = path.join(TOOLCHAIN_DIR, "zig-" + ZIG_VERSION);
    await fs.rm(target, { recursive: true, force: true });
    await movePath(path.join(temp, rootEntry.name), target);
    log("zig 已安装到 " + target);
    return findExecutableIn(target, "zig", 0);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

function pnpmShimContent() {
  if (IS_WINDOWS) {
    return (
      '@echo off\r\nnode "%~dp0..\\pnpm\\' +
      PNPM_VERSION +
      '\\bin\\pnpm.cjs" %*\r\n'
    );
  }
  return (
    '#!/bin/sh\nexec node "$(dirname "$0")/../pnpm/' +
    PNPM_VERSION +
    '/bin/pnpm.cjs" "$@"\n'
  );
}

async function writePnpmShim() {
  const binDir = path.join(TOOLCHAIN_DIR, "bin");
  await fs.mkdir(binDir, { recursive: true });
  const shim = path.join(binDir, IS_WINDOWS ? "pnpm.cmd" : "pnpm");
  await fs.writeFile(shim, pnpmShimContent(), { mode: 0o755 });
  return shim;
}

async function installPnpm(options) {
  const target = path.join(TOOLCHAIN_DIR, "pnpm", PNPM_VERSION);
  const cli = path.join(target, "bin", "pnpm.cjs");
  const existing = await fs.stat(cli).catch(() => null);
  if (existing && !options.force) {
    const version = run(process.execPath, [cli, "--version"]);
    if (version.ok && version.stdout === PNPM_VERSION) {
      log("pnpm " + PNPM_VERSION + " 已存在: " + cli);
      await writePnpmShim();
      return cli;
    }
  }
  if (options.check) {
    throw new Error(
      "缺少 pnpm " + PNPM_VERSION + "，请运行 pnpm toolchain:download"
    );
  }

  const archive = path.join(DOWNLOADS_DIR, "pnpm-" + PNPM_VERSION + ".tgz");
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
  const exists = await fs.stat(archive).catch(() => null);
  if (!exists || options.force) {
    await downloadTo(PNPM_TARBALL_URL, archive);
  }
  const temp = path.join(os.tmpdir(), "_kiss_aifw_pnpm_" + process.pid);
  await fs.rm(temp, { recursive: true, force: true });
  await fs.mkdir(temp, { recursive: true });
  try {
    await extractArchive(archive, temp);
    const packageDir = path.join(temp, "package");
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await movePath(packageDir, target);
    await writePnpmShim();
    log("pnpm 已安装到 " + target);
    return cli;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

function checkRustTarget() {
  const rustup = run("rustup", ["--version"]);
  if (!rustup.ok) {
    warn(
      "未找到 rustup；Rust 的 wasm32-unknown-unknown target 需要系统安装 rustup"
    );
    return false;
  }
  const list = run("rustup", ["target", "list", "--installed"]);
  if (!list.ok) {
    warn("无法读取 rustup target 列表");
    return false;
  }
  if (!/^wasm32-unknown-unknown$/m.test(list.stdout)) {
    warn(
      "缺少 wasm32-unknown-unknown target，请运行: rustup target add wasm32-unknown-unknown"
    );
    return false;
  }
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  log(
    options.check
      ? "校验本地编译链（.toolchain）..."
      : "准备本地编译链（.toolchain，已 gitignore，优先级高于系统 PATH）..."
  );
  let ok = true;
  try {
    if (options.zig) {
      const zig = await installZig(options);
      if (zig && options.check) {
        const version = run(zig, ["version"]);
        if (!version.ok || version.stdout !== ZIG_VERSION) {
          throw new Error(
            "zig 校验失败: " + (version.stdout || version.stderr)
          );
        }
        log("zig " + ZIG_VERSION + " 校验通过");
      }
    }
    if (options.pnpm) {
      const pnpm = await installPnpm(options);
      if (pnpm && options.check) {
        const version = run(process.execPath, [pnpm, "--version"]);
        if (!version.ok || version.stdout !== PNPM_VERSION) {
          throw new Error(
            "pnpm 校验失败: " + (version.stdout || version.stderr)
          );
        }
        log("pnpm " + PNPM_VERSION + " 校验通过");
      }
    }
    if (!checkRustTarget()) ok = false;
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    ok = false;
  }
  if (!ok) {
    fail("本地编译链不完整；构建脚本在缺少工具链时会失败并提示。");
    process.exit(1);
  }
  log(
    "本地编译链就绪：构建时会优先使用 .toolchain/ 中的二进制，而不是系统 PATH。"
  );
}

await main();
