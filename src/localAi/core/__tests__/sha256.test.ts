import { describe, expect, it, vi } from "vitest";
import { Sha256, sha256Blob, crc32Blob } from "../sha256";
import * as idb from "../idb";
import * as opfs from "../opfs";
import { CATALOG } from "../catalog";
import { ModelManager, migrateRecord } from "../modelManager";
import type { ModelManifest, ModelRecord } from "../types";

async function webCryptoSha256(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("Sha256 流式增量哈希", () => {
  it.each([0, 1, 3, 55, 56, 57, 63, 64, 65, 128, 1023, 16384])(
    "字节长度 %i 与 WebCrypto SHA-256 完全一致",
    async (len) => {
      const data = new Uint8Array(len);
      for (let i = 0; i < len; i++) data[i] = (i * 131 + 17) & 0xff;
      const expected = await webCryptoSha256(data);

      // 任意分块增量更新（模拟 ReadableStream 分片）
      const hasher = new Sha256();
      let offset = 0;
      const steps = [1, 7, 19, 64, 65, 257];
      let stepIdx = 0;
      while (offset < len) {
        const take = Math.min(steps[stepIdx++ % steps.length]!, len - offset);
        hasher.update(data.subarray(offset, offset + take));
        offset += take;
      }
      expect(hasher.digestHex()).toBe(expected);

      // Blob 流式接口一致
      const blob = new Blob([data]);
      expect(await sha256Blob(blob)).toBe(expected);
    }
  );

  it("crc32Blob 正确计算标准测试向量 123456789", async () => {
    const bytes = new TextEncoder().encode("123456789");
    const crc = await crc32Blob(new Blob([bytes]));
    expect(crc).toBe(0xcbf43926);
  });
});

describe("migrateRecord 与 ModelManager.init 清单升级完整流程", () => {
  const baseManifest: ModelManifest = {
    id: "m1",
    name: "Model v2",
    version: "v2",
    task: "llm",
    runtime: "wllama",
    format: "gguf",
    backend: ["webgpu"],
    size: 200,
    dir: "llm/m1",
    source: "repo/v2",
    files: [
      { path: "same.bin", size: 100, sha256: "aaa" },
      { path: "updated.bin", size: 100, sha256: "bbb-new" },
    ],
  };

  it("始终以新版 catalog manifest 覆盖旧 manifest，仅保留大小与哈希一致的文件状态", () => {
    const oldManifest: ModelManifest = {
      ...baseManifest,
      name: "Model v1",
      version: "v1",
      backend: ["webgpu", "wasm"],
      source: "repo/v1",
      files: [
        { path: "same.bin", size: 100, sha256: "aaa" },
        { path: "updated.bin", size: 100, sha256: "bbb-old" },
        { path: "removed.bin", size: 50, sha256: "ccc" },
      ],
    };
    const stored: ModelRecord = {
      manifest: oldManifest,
      state: "installed",
      downloadedAt: 12345,
      files: {
        "same.bin": { state: "installed", downloaded: 100 },
        "updated.bin": { state: "installed", downloaded: 100 },
        "removed.bin": { state: "installed", downloaded: 50 },
      },
    };

    const migrated = migrateRecord(baseManifest, stored);
    expect(migrated.manifest).toBe(baseManifest);
    expect(migrated.manifest.version).toBe("v2");
    expect(migrated.manifest.backend).toEqual(["webgpu"]);
    // 未变化的文件保留 installed
    expect(migrated.files["same.bin"]?.state).toBe("installed");
    // sha256 变化的文件重置为 not-installed
    expect(migrated.files["updated.bin"]?.state).toBe("not-installed");
    // 已移除的文件不再保留在 files 中
    expect(migrated.files["removed.bin"]).toBeUndefined();
  });

  it("当旧清单无 sha256 而新清单新增 sha256 时，不直接继承 installed，交由后续校验", () => {
    const oldManifest: ModelManifest = {
      ...baseManifest,
      files: [
        { path: "same.bin", size: 100 }, // 旧清单无 sha256
        { path: "updated.bin", size: 100 },
      ],
    };
    const stored: ModelRecord = {
      manifest: oldManifest,
      state: "installed",
      files: {
        "same.bin": { state: "installed", downloaded: 100 },
        "updated.bin": { state: "installed", downloaded: 100 },
      },
    };

    const migrated = migrateRecord(baseManifest, stored);
    // 新清单中 same.bin 和 updated.bin 均有 sha256，旧文件不能直接被视为 installed
    expect(migrated.files["same.bin"]?.state).toBe("not-installed");
    expect(migrated.files["updated.bin"]?.state).toBe("not-installed");
  });

  it("当模型存储目录 dir 变更时重置所有旧文件状态", () => {
    const stored: ModelRecord = {
      manifest: { ...baseManifest, dir: "llm/old-dir" },
      state: "installed",
      files: {
        "same.bin": { state: "installed", downloaded: 100 },
        "updated.bin": { state: "installed", downloaded: 100 },
      },
    };
    const migrated = migrateRecord(baseManifest, stored);
    expect(migrated.files["same.bin"]?.state).toBe("not-installed");
    expect(migrated.state).toBe("not-installed");
  });

  it("ModelManager.init() 在文件大小不变但 SHA256 升级时，启动校验会检测哈希不符并删除 OPFS 旧文件、保持未安装", async () => {
    const target = CATALOG.find((m) => m.id === "ppocr-v5-mobile-det")!;
    const targetFile = target.files[0]!;
    const finalPath = `${target.dir}/${targetFile.path}`;

    // 模拟 IDB 中存有旧版记录：文件大小与新版完全相同，但旧版 sha256 不同
    const oldManifest: ModelManifest = {
      ...target,
      files: [{ ...targetFile, sha256: "0".repeat(64) }],
    };
    const oldRec: ModelRecord = {
      manifest: oldManifest,
      state: "installed",
      files: {
        [targetFile.path]: { state: "installed", downloaded: targetFile.size },
      },
    };

    const getAllSpy = vi.spyOn(idb, "getAllRecords").mockResolvedValue([oldRec]);
    const putSpy = vi.spyOn(idb, "putRecord").mockResolvedValue();
    const delSpy = vi.spyOn(idb, "deleteRecord").mockResolvedValue();
    // 模拟 OPFS 上仍残留同大小的旧文件，且其实际哈希为旧哈希
    const statSpy = vi
      .spyOn(opfs, "statFile")
      .mockImplementation(async (p) => (p === finalPath ? targetFile.size : undefined));
    const shaSpy = vi
      .spyOn(opfs, "sha256File")
      .mockResolvedValue("0".repeat(64));
    const removeSpy = vi.spyOn(opfs, "removeFile").mockResolvedValue();

    try {
      const mgr = new ModelManager("hf-mirror");
      await mgr.init();
      const rec = mgr.get(target.id)!;
      // 启动校验必须触发 sha256File 并移除旧文件，不能因同大小误判为 installed
      expect(shaSpy).toHaveBeenCalledWith(finalPath);
      expect(removeSpy).toHaveBeenCalledWith(finalPath);
      expect(rec.files[targetFile.path]?.state).toBe("not-installed");
      expect(rec.state).toBe("not-installed");
    } finally {
      getAllSpy.mockRestore();
      putSpy.mockRestore();
      delSpy.mockRestore();
      statSpy.mockRestore();
      shaSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it("ModelManager.init() 在启动校验遇到磁盘读取异常时保留现存文件不误删，并将模型标记为 error", async () => {
    const target = CATALOG.find((m) => m.id === "ppocr-v5-mobile-det")!;
    const targetFile = target.files[0]!;
    const finalPath = `${target.dir}/${targetFile.path}`;

    // 模拟 IDB 尚未记录已安装（如缓存丢失），但 OPFS 上已有完整大小模型文件
    const getAllSpy = vi.spyOn(idb, "getAllRecords").mockResolvedValue([]);
    const putSpy = vi.spyOn(idb, "putRecord").mockResolvedValue();
    const statSpy = vi
      .spyOn(opfs, "statFile")
      .mockImplementation(async (p) => (p === finalPath ? targetFile.size : undefined));
    const shaSpy = vi
      .spyOn(opfs, "sha256File")
      .mockRejectedValue(new Error("OPFS transient I/O error"));
    const removeSpy = vi.spyOn(opfs, "removeFile").mockResolvedValue();

    try {
      const mgr = new ModelManager("hf-mirror");
      await mgr.init();
      const rec = mgr.get(target.id)!;
      expect(shaSpy).toHaveBeenCalledWith(finalPath);
      // 严禁误删 OPFS 文件
      expect(removeSpy).not.toHaveBeenCalled();
      expect(rec.state).toBe("error");
      expect(rec.error).toContain("OPFS transient I/O error");
      expect(rec.files[targetFile.path]?.state).toBe("error");
    } finally {
      getAllSpy.mockRestore();
      putSpy.mockRestore();
      statSpy.mockRestore();
      shaSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it("ModelManager.init() 当旧缓存无 sha256 而新清单新增 sha256 时，能正确触发校验并将哈希正确的现存文件标记为 installed", async () => {
    const target = CATALOG.find((m) => m.id === "ppocr-v5-mobile-det")!;
    const targetFile = target.files[0]!;
    const finalPath = `${target.dir}/${targetFile.path}`;

    // 旧缓存中无 sha256，但标记为 installed
    const oldManifest: ModelManifest = {
      ...target,
      files: [{ ...targetFile, sha256: undefined }],
    };
    const oldRec: ModelRecord = {
      manifest: oldManifest,
      state: "installed",
      files: {
        [targetFile.path]: { state: "installed", downloaded: targetFile.size },
      },
    };

    const getAllSpy = vi.spyOn(idb, "getAllRecords").mockResolvedValue([oldRec]);
    const putSpy = vi.spyOn(idb, "putRecord").mockResolvedValue();
    const statSpy = vi
      .spyOn(opfs, "statFile")
      .mockImplementation(async (p) => (p === finalPath ? targetFile.size : undefined));
    const shaSpy = vi
      .spyOn(opfs, "sha256File")
      .mockResolvedValue(targetFile.sha256!);
    const removeSpy = vi.spyOn(opfs, "removeFile").mockResolvedValue();

    try {
      const mgr = new ModelManager("hf-mirror");
      await mgr.init();
      const rec = mgr.get(target.id)!;
      // 必须调用 sha256File 进行新清单哈希校验
      expect(shaSpy).toHaveBeenCalledWith(finalPath);
      expect(removeSpy).not.toHaveBeenCalled();
      expect(rec.state).toBe("installed");
      expect(rec.files[targetFile.path]?.state).toBe("installed");
    } finally {
      getAllSpy.mockRestore();
      putSpy.mockRestore();
      statSpy.mockRestore();
      shaSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});
