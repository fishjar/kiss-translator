import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import bestzip from "bestzip";

export const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

export async function walkFiles(root) {
  const files = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(full)));
    else files.push(full);
  }
  return files.sort();
}

// ORT contains feature probes for these unused backends. The extension selects
// the explicit JSEP paths; these are not loadable extension resources.
const OPTIONAL_ORT_PROBES =
  /^ort-wasm-simd-threaded\.(?:asyncify|jspi)(?:-[\w-]+)?\.(?:wasm|mjs)$/;

export async function inspectBundle(root, { runtime = false } = {}) {
  root = path.resolve(root);
  const entries = await walkFiles(root);
  const files = [];
  const errors = [];
  const references = [];
  const pages = {};
  const hashes = new Map();
  for (const full of entries) {
    const name = path.relative(root, full).replaceAll("\\", "/");
    const bytes = await fs.readFile(full);
    const hash = sha256(bytes);
    files.push({ name, bytes: bytes.length, sha256: hash });
    if (/\.(?:onnx|gguf|safetensors|pt|pth)$/i.test(name))
      errors.push(`Model weight in bundle: ${name}`);
    if (/\.map$/.test(name))
      errors.push(`Source map in release bundle: ${name}`);
    if (bytes.length >= 65536) {
      if (hashes.has(hash))
        errors.push(`Duplicate large asset: ${hashes.get(hash)} / ${name}`);
      hashes.set(hash, name);
    }
    if (!/\.(?:m?js|html)$/.test(name)) continue;
    const code = bytes.toString();
    const refs = [];
    if (name.endsWith(".html")) {
      for (const m of code.matchAll(
        /<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g
      ))
        refs.push(m[1]);
      pages[name] = refs.filter((s) => s.endsWith(".js"));
    } else {
      for (const m of code.matchAll(
        /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\bnew\s+URL\(\s*)["']([^"']+)["']/g
      ))
        refs.push(m[1]);
    }
    for (const ref of refs) {
      if (
        /^(?:[a-z]+:|#)/i.test(ref) ||
        !/\.(?:m?js|wasm|css)(?:[?#]|$)/.test(ref)
      )
        continue;
      const clean = ref.split(/[?#]/)[0];
      const target = clean.startsWith("/")
        ? path.join(root, clean.slice(1))
        : path.resolve(path.dirname(full), clean);
      const relative = path.relative(root, target);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        errors.push(`Escaping resource: ${name} -> ${ref}`);
        continue;
      }
      const exists = await fs.stat(target).then(
        (s) => s.isFile(),
        () => false
      );
      const explicitJsepPath =
        path.basename(target) === "ort-wasm-simd-threaded.jsep.wasm" &&
        entries.some((p) =>
          /ort-wasm-simd-threaded\.jsep-[\w-]+\.wasm$/.test(p)
        );
      const optional =
        !exists &&
        (OPTIONAL_ORT_PROBES.test(path.basename(target)) || explicitJsepPath);
      references.push({
        from: name,
        to: relative.replaceAll("\\", "/"),
        optional,
      });
      if (!exists && !optional)
        errors.push(`Missing resource: ${name} -> ${ref}`);
    }
  }
  if (runtime && !files.some((f) => f.name === "offscreen.js"))
    errors.push("Missing offscreen.js");
  const byName = new Map(files.map((f) => [f.name, f.bytes]));
  for (const [page, scripts] of Object.entries(pages)) {
    pages[page] = {
      scripts,
      initialScriptBytes: scripts.reduce(
        (n, s) => n + (byName.get(s.replace(/^\//, "")) || 0),
        0
      ),
    };
  }
  const groups = {};
  for (const file of files) {
    const group = /^(?:local-ai\/|offscreen\.)/.test(file.name)
      ? "local-ai"
      : /\.js$/.test(file.name)
        ? "webpack"
        : "static";
    groups[group] = (groups[group] || 0) + file.bytes;
  }
  return {
    bytes: files.reduce((n, f) => n + f.bytes, 0),
    groups,
    pages,
    files,
    references,
    errors,
  };
}

export async function assertBundle(root, options) {
  const report = await inspectBundle(root, options);
  if (report.errors.length) throw new Error(report.errors.join("\n"));
  return report;
}

export function checkBudget(report, budget) {
  for (const field of ["bytes", "zipBytes"]) {
    const limit = budget[field] + Math.max(budget[field] * 0.01, 256 * 1024);
    if (report[field] > limit)
      throw new Error(
        `${field}: ${report[field]} exceeds budget ${Math.floor(limit)}; review and explain the size change before updating the baseline`
      );
  }
}

export async function auditRelease(root, destination) {
  const report = await assertBundle(root);
  await fs.mkdir(destination, { recursive: true });
  const zipPath = path.resolve(destination, "chrome.zip");
  await bestzip.nodeZip({
    level: 6,
    cwd: path.resolve(root),
    source: report.files.map((f) => f.name),
    destination: zipPath,
  });
  report.zipBytes = (await fs.stat(zipPath)).size;
  report.dependencies = {};
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
  for (const name of Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    const installed = JSON.parse(
      await fs.readFile(path.join("node_modules", name, "package.json"), "utf8")
    );
    report.dependencies[name] = installed.version;
  }
  report.moduleReports = [];
  for (const name of [
    "tmp/build-analysis/chrome-webpack.json",
    ".local-ai-build/.modules.json",
  ]) {
    const text = await fs.readFile(name, "utf8").catch(() => null);
    if (text) {
      const output = path.basename(name).replace(/^\./, "rollup-");
      await fs.writeFile(path.join(destination, output), text);
      report.moduleReports.push(output);
    }
  }
  await fs.writeFile(
    path.join(destination, "report.json"),
    JSON.stringify(report, null, 2)
  );
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [root = "build/chrome", destination = "build/analysis", budgetPath] =
    process.argv.slice(2);
  const report = await auditRelease(root, destination);
  console.log(
    JSON.stringify(
      {
        bytes: report.bytes,
        zipBytes: report.zipBytes,
        groups: report.groups,
        pages: report.pages,
      },
      null,
      2
    )
  );
  if (budgetPath)
    checkBudget(report, JSON.parse(await fs.readFile(budgetPath, "utf8")));
}
