import { describe, expect, it, vi } from "vitest";
import { unzipSync, zipSync } from "fflate";
import { buildModelZip, extractZipEntries } from "../exportModel";
import type { ModelManifest } from "../types";

function makeManifest(
  id: string,
  dir: string,
  files: { path: string; size: number }[]
): ModelManifest {
  return {
    id,
    name: id,
    version: "v1",
    task: "llm",
    runtime: "wllama",
    format: "gguf",
    backend: ["wasm"],
    size: files.reduce((s, f) => s + f.size, 0),
    files,
    source: "test",
    dir,
  };
}

describe("buildModelZip & extractZipEntries", () => {
  it("条目保持 OPFS 目录布局且内容大小一致，且可通过 extractZipEntries 零拷贝切片还原", async () => {
    const m1 = makeManifest("m1", "llm/m1", [
      { path: "a.gguf", size: 1024 },
      { path: "sub/b.bin", size: 512 },
    ]);
    const m2 = makeManifest("m2", "llm/m2", [{ path: "c.txt", size: 7 }]);
    const read = vi.fn(async (p: string) => {
      const n =
        p === "llm/m1/a.gguf" ? 1024 : p === "llm/m1/sub/b.bin" ? 512 : p === "llm/m2/c.txt" ? 7 : -1;
      if (n < 0) throw new Error(`unexpected path ${p}`);
      const buf = new ArrayBuffer(n);
      new Uint8Array(buf).fill(p.length);
      return buf;
    });
    const blob = await buildModelZip([m1, m2], undefined, read);
    expect(blob.type).toBe("application/zip");
    const out = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(out).sort()).toEqual([
      "llm/m1/a.gguf",
      "llm/m1/sub/b.bin",
      "llm/m2/c.txt",
    ]);
    expect(out["llm/m1/a.gguf"]!.byteLength).toBe(1024);
    expect(out["llm/m1/sub/b.bin"]!.byteLength).toBe(512);
    expect(out["llm/m2/c.txt"]!.byteLength).toBe(7);

    // 验证 extractZipEntries 能通过 File.slice 零拷贝提取 STORE 条目
    const zipFile = new File([blob], "bundle.zip", { type: "application/zip" });
    const extracted = await extractZipEntries(zipFile);
    expect(extracted.map((x) => ({ name: x.name, size: x.file.size }))).toEqual([
      { name: "a.gguf", size: 1024 },
      { name: "b.bin", size: 512 },
      { name: "c.txt", size: 7 },
    ]);
  });

  it("高压缩率 DEFLATE ZIP 当解压后总大小超限时直接拦截，即使 ZIP 本身很小", async () => {
    // 构造 8KB 全零数据，DEFLATE 压缩后仅几十字节，但解压后为 8192 字节
    const raw = new Uint8Array(8192);
    const compressed = zipSync({ "model/weights.bin": raw }, { level: 9 });
    expect(compressed.byteLength).toBeLessThan(256);
    const zipFile = new File([new Uint8Array(compressed)], "tiny.zip", {
      type: "application/zip",
    });

    // 设定 maxInflateBytes = 4096（4KB），验证在解压前即根据解压后大小拦截
    await expect(extractZipEntries(zipFile, 4096)).rejects.toThrow(
      /内存安全上限/
    );

    // 在上限充足（16KB）时可正常逐项解压
    const ok = await extractZipEntries(zipFile, 16384);
    expect(ok).toHaveLength(1);
    expect(ok[0]!.name).toBe("weights.bin");
    expect(ok[0]!.file.size).toBe(8192);
  });

  it("每读完一个文件回调一次进度", async () => {
    const m1 = makeManifest("m1", "d", [{ path: "x.bin", size: 1 }]);
    const m2 = makeManifest("m2", "e", [{ path: "y.bin", size: 1 }]);
    const read = async () => new ArrayBuffer(1);
    const steps: { filesDone: number; fileCount: number }[] = [];
    await buildModelZip([m1, m2], (p) => steps.push({ ...p }), read);
    expect(steps).toEqual([
      { filesDone: 1, fileCount: 2 },
      { filesDone: 2, fileCount: 2 },
    ]);
  });
});

