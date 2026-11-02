#!/usr/bin/env node
/**
 * @file clean.mjs
 * @description 清理构建缓存/编译中间产物，跨平台（Windows/macOS/Linux）。
 *
 * 用法:
 *   pnpm clean              # 仅构建产物：build、tmp、.local-ai-build、node_modules/.cache
 *   pnpm clean:aifw         # aifw 编译链：src/vendor/aifw-js、.aifw-build、aifw 内 zig/cargo 产物
 *   pnpm clean:toolchain    # 删除 .toolchain（下次需 pnpm toolchain:download）
 *   pnpm clean:deps         # 删除 node_modules 与 aifw/node_modules（下次 pnpm install）
 *   pnpm clean:global       # 旧 zig 全局缓存、corepack 缓存（项目外，慎用）
 *   pnpm clean:all          # 以上全部
 *
 *   任一命令支持 --dry-run：只列出将删除的内容和大小，不实际删除。
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const targets = argv.filter((arg) => !arg.startsWith("--"));

function log(message) {
  console.log("[clean] " + message);
}

function resolve(relative) {
  return path.join(ROOT, relative);
}

async function sizeOf(target) {
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  const entries = await fs
    .readdir(target, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    total += await sizeOf(path.join(target, entry.name));
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / 1024 / 1024).toFixed(1) + " MiB";
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GiB";
}

async function remove(relative) {
  const target = resolve(relative);
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat) {
    log("跳过（不存在）: " + relative);
    return 0;
  }
  const bytes = await sizeOf(target);
  log(
    (dryRun ? "将删除: " : "删除: ") +
      relative +
      "（" +
      formatBytes(bytes) +
      "）"
  );
  if (!dryRun) {
    await fs.rm(target, { recursive: true, force: true });
  }
  return bytes;
}

const GROUPS = {
  build: ["build", "tmp", ".local-ai-build", "node_modules/.cache"],
  aifw: [
    "src/vendor/aifw-js",
    ".aifw-build",
    "aifw/zig-out",
    "aifw/.zig-cache",
    "aifw/libs/regex/target",
    "aifw/libs/aifw-js/dist",
  ],
  toolchain: [".toolchain"],
  deps: ["node_modules", "aifw/node_modules", "aifw/libs/aifw-js/node_modules"],
};

function globalTargets() {
  const list = [];
  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) {
      list.push(path.join(process.env.LOCALAPPDATA, "zig"));
      list.push(path.join(process.env.LOCALAPPDATA, "node", "corepack"));
    }
  } else {
    list.push(path.join(os.homedir(), ".cache", "zig"));
    list.push(path.join(os.homedir(), ".cache", "node", "corepack"));
  }
  return list;
}

async function removeAbsolute(target, label) {
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat) {
    log("跳过（不存在）: " + label);
    return 0;
  }
  const bytes = await sizeOf(target);
  log(
    (dryRun ? "将删除: " : "删除: ") + label + "（" + formatBytes(bytes) + "）"
  );
  if (!dryRun) {
    await fs.rm(target, { recursive: true, force: true });
  }
  return bytes;
}

function selectedGroups() {
  if (targets.length === 0) return ["build"];
  if (targets.includes("all")) return ["build", "aifw", "toolchain", "deps"];
  return targets;
}

const groups = selectedGroups();
for (const group of groups) {
  if (group !== "global" && !GROUPS[group]) {
    console.error(
      "[clean] 未知目标: " +
        group +
        "（可选: build、aifw、toolchain、deps、global、all）"
    );
    process.exit(2);
  }
}

let total = 0;
log(dryRun ? "dry-run：只统计，不删除" : "开始清理");
for (const group of groups) {
  if (group === "global") {
    for (const target of globalTargets()) {
      total += await removeAbsolute(target, target);
    }
    continue;
  }
  log("--- " + group + " ---");
  for (const relative of GROUPS[group]) {
    total += await remove(relative);
  }
}

log("合计" + (dryRun ? "可释放" : "已释放") + " " + formatBytes(total));
if (!groups.includes("toolchain") && !dryRun) {
  const toolchainMissing = !(await fs
    .lstat(resolve(".toolchain"))
    .catch(() => null));
  if (toolchainMissing) {
    log(
      "提示: .toolchain 不存在；如需重新构建 aifw，请先 pnpm toolchain:download"
    );
  }
}
if (!dryRun && (groups.includes("toolchain") || groups.includes("deps"))) {
  log("后续: pnpm install && pnpm toolchain:download（按需）");
}
