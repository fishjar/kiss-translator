import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertBundle, sha256, walkFiles } from "./bundle-audit.mjs";

const require = createRequire(import.meta.url);

export async function fingerprint(root = process.cwd()) {
  const inputs = ["package.json", "pnpm-lock.yaml", "vite.config.local-ai.ts"];
  // The shared host imports Provider runners and their config/lib dependencies.
  for (const dir of ["src/localAi", "src/providers", "src/config", "src/libs", "src/scripts"]) {
    for (const file of await walkFiles(path.join(root, dir)))
      inputs.push(path.relative(root, file));
  }
  const records = await Promise.all(
    inputs
      .sort()
      .map(async (name) => [
        name.replaceAll("\\", "/"),
        sha256(await fs.readFile(path.join(root, name))),
      ])
  );
  for (const name of [
    "vite",
    "typescript",
    "onnxruntime-web",
    "@paddleocr/paddleocr-js",
  ]) {
    const pkg = JSON.parse(
      await fs.readFile(
        path.join(root, "node_modules", name, "package.json"),
        "utf8"
      )
    );
    records.push([name, pkg.version]);
  }
  records.push(
    ["node", process.version],
    ["platform", `${process.platform}/${process.arch}`]
  );
  return sha256(JSON.stringify(records));
}

export async function replaceCache(stage, cache) {
  // Both directories must stay inside the caller's project; never remove an
  // arbitrary directory derived from environment variables.
  const root = process.cwd();
  for (const dir of [stage, cache]) {
    const relative = path.relative(root, path.resolve(dir));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error(`Unsafe cache directory: ${dir}`);
  }
  const backup = `${stage}-previous`;
  let moved = false;
  try {
    await fs.rename(cache, backup).then(
      () => {
        moved = true;
      },
      (e) => {
        if (e.code !== "ENOENT") throw e;
      }
    );
    await fs.rename(stage, cache);
  } catch (e) {
    if (moved) await fs.rename(backup, cache);
    throw e;
  }
  if (moved) await fs.rm(backup, { recursive: true });
}

export async function ensureLocalAi({ force = false, build } = {}) {
  const cache = path.resolve(".local-ai-build");
  await fs.mkdir("tmp", { recursive: true });
  const lockPath = path.resolve("tmp/local-ai-build.lock");
  const lock = await fs.open(lockPath, "wx");
  let stage;
  try {
    const hash = await fingerprint();
    if (!force) {
      try {
        const saved = JSON.parse(
          await fs.readFile(path.join(cache, ".build-manifest.json"), "utf8")
        );
        if (saved.fingerprint === hash) {
          const current = await assertBundle(cache, { runtime: true });
          if (JSON.stringify(current.files) === JSON.stringify(saved.files)) {
            console.log("Local AI cache verified; skipping build.");
            return cache;
          }
        }
      } catch {
        /* A stale or incomplete cache is rebuilt below. */
      }
    }
    stage = await fs.mkdtemp(path.resolve("tmp/local-ai-build-"));
    if (build) await build(stage);
    else {
      const cli = path.join(
        path.dirname(require.resolve("vite/package.json")),
        "bin/vite.js"
      );
      const result = spawnSync(
        process.execPath,
        [
          cli,
          "build",
          "--config",
          "vite.config.local-ai.ts",
          "--outDir",
          stage,
        ],
        { stdio: "inherit" }
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`Local AI build failed (${result.status})`);
    }
    const report = await assertBundle(stage, { runtime: true });
    await fs.writeFile(
      path.join(stage, ".build-manifest.json"),
      JSON.stringify({ fingerprint: hash, files: report.files })
    );
    await replaceCache(stage, cache);
    stage = undefined;
    return cache;
  } finally {
    if (stage) await fs.rm(stage, { recursive: true, force: true });
    await lock.close();
    await fs.unlink(lockPath);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await ensureLocalAi({ force: true });
