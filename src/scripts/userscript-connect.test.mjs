import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("userscript banner allows the 1min.ai API and InfiniCLOUD WebDAV hosts via @connect", async () => {
  const source = await fs.readFile(path.join(root, "config-overrides.js"), "utf8");
  const hosts = [...source.matchAll(/^\/\/ @connect\s+(\S+)/gm)].map((m) => m[1]);
  assert.ok(hosts.includes("api.1min.ai"));
  assert.ok(hosts.includes("kurio.infini-cloud.net"));
});
