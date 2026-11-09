import * as idb from "./idb";
import * as opfs from "./opfs";
import { downloadFileToTemp, tempPathFor, DownloadError } from "./downloadManager";
import { extractZipEntries } from "./exportModel";
import { CATALOG } from "./catalog";
import { isExtensionContext } from "./types";
import { nextRpcId, type ModelImportTaskResult } from "../runtime/rpc";
import { runtimeHost, type RuntimeHostAdapter } from "../runtime/runtimeHostAdapter";
import type {
  ModelManifest,
  ModelRecord,
  Mirror,
} from "./types";

export type ModelListener = (id: string, rec: ModelRecord) => void;

const EMIT_THROTTLE_MS = 100;

// 让一个可能在「暂停/取消」时仍挂起的 promise（如 OPFS 读写）可被 AbortSignal 中断：
// 信号一旦 abort，立即以 AbortError 拒绝，无需等原 promise 完成。
function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  const abortErr = () => new DOMException("Aborted", "AbortError");
  if (signal.aborted) return Promise.reject(abortErr());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortErr());
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      }
    );
  });
}

const IN_PROGRESS = new Set<string>(["queued", "downloading", "verifying"]);

function newRecord(manifest: ModelManifest): ModelRecord {
  const files: ModelRecord["files"] = {};
  for (const f of manifest.files) {
    files[f.path] = { state: "not-installed", downloaded: 0 };
  }
  return { manifest, state: "not-installed", files };
}

export function migrateRecord(
  manifest: ModelManifest,
  stored?: ModelRecord
): ModelRecord {
  const rec = newRecord(manifest);
  if (!stored) return rec;

  if (stored.manifest.dir === manifest.dir) {
    const oldFileMap = new Map(
      (stored.manifest.files ?? []).map((f) => [f.path, f])
    );
    for (const f of manifest.files) {
      const oldFs = stored.files?.[f.path];
      const oldSpec = oldFileMap.get(f.path);
      const sizeMatch = !oldSpec || oldSpec.size === f.size;
      const shaMatch = (!f.sha256 && !oldSpec?.sha256) || (!!f.sha256 && oldSpec?.sha256 === f.sha256);
      if (oldFs && sizeMatch && shaMatch) {
        rec.files[f.path] = { ...oldFs };
      }
    }
    rec.state = stored.state;
    rec.downloadedAt = stored.downloadedAt;
    rec.error = stored.error;
  }
  return rec;
}

export class LocalModelManager {
  private records = new Map<string, ModelRecord>();
  private listeners = new Set<ModelListener>();
  private aborters = new Map<string, AbortController>();
  private lastEmit = new Map<string, number>();
  private pauseRequested = new Set<string>();
  private mirror: Mirror;

  constructor(mirror: Mirror) {
    this.mirror = mirror;
    for (const m of CATALOG) {
      this.records.set(m.id, newRecord(m));
    }
  }

  setMirror(mirror: Mirror): void {
    this.mirror = mirror;
  }

  getMirror(): Mirror {
    return this.mirror;
  }

  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    this.initPromise ??= this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const stored = await idb.getAllRecords();
    const byId = new Map(stored.map((r) => [r.manifest.id, r]));
    const catalogIds = new Set<string>();

    for (const manifest of CATALOG) {
      catalogIds.add(manifest.id);
      const old = byId.get(manifest.id);
      const rec = migrateRecord(manifest, old);
      this.records.set(manifest.id, rec);
    }
    // 清理已从 CATALOG 移除的遗留记录，防止静默混入当前列表
    for (const id of byId.keys()) {
      if (!catalogIds.has(id)) {
        await idb.deleteRecord(id);
      }
    }
    await this.verifyInstalled();
    for (const rec of this.records.values()) {
      if (byId.has(rec.manifest.id)) {
        this.persist(rec);
      }
      this.emit(rec.manifest.id, rec, true);
    }
  }

  private async verifyInstalled(): Promise<void> {
    for (const rec of this.records.values()) {
      const manifest = rec.manifest;
      let verifyReadErr: string | undefined;
      for (const f of manifest.files) {
        const finalPath = `${manifest.dir}/${f.path}`;
        const size = await opfs.statFile(finalPath);
        const fs = rec.files[f.path];
        if (!fs) continue;
        if (size === f.size) {
          if (fs.state !== "installed" && f.sha256) {
            let actualHash: string;
            try {
              actualHash = await opfs.sha256File(finalPath);
            } catch (err) {
              // 无法完成校验（如磁盘临时读取故障）：保留现存文件不删除，标记为 error
              const msg = err instanceof Error ? err.message : String(err);
              fs.state = "error";
              fs.downloaded = size;
              fs.error = `校验读取失败: ${msg}`;
              verifyReadErr ??= `文件校验读取失败 (${f.path}): ${msg}`;
              continue;
            }
            if (actualHash !== f.sha256) {
              // 成功算出哈希但与当前清单不符：清理旧文件并重置为未安装
              await opfs.removeFile(finalPath);
              await opfs.removeFile(tempPathFor(manifest.id, f.path));
              fs.state = "not-installed";
              fs.downloaded = 0;
              continue;
            }
          }
          fs.state = "installed";
          fs.downloaded = f.size;
          fs.error = undefined;
        } else if (fs.state === "installed") {
          fs.state = "not-installed";
          fs.downloaded = 0;
        }
      }
      const allInstalled = manifest.files.every(
        (f) => rec.files[f.path]?.state === "installed"
      );
      if (allInstalled) {
        rec.state = "installed";
        rec.error = undefined;
      } else if (verifyReadErr) {
        rec.state = "error";
        rec.error = verifyReadErr;
      } else if (rec.state === "installed") {
        rec.state = "not-installed";
      } else if (IN_PROGRESS.has(rec.state)) {
        // 重启后不存在正在进行的下载：把残留的进行中状态归一化，
        // 否则 UI 卡死在「排队中/下载中」且暂停/取消失效（无活动下载可中断）。
        rec.state = "not-installed";
        for (const f of manifest.files) {
          const fs = rec.files[f.path];
          if (fs && IN_PROGRESS.has(fs.state)) {
            // 保留已下载字节数，点「下载」即可断点续传
            fs.state = fs.downloaded > 0 ? "paused" : "not-installed";
            fs.speed = 0;
            fs.etaSeconds = null;
          }
        }
      }
    }
  }

  subscribe(fn: ModelListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(): ModelRecord[] {
    return [...this.records.values()];
  }

  get(id: string): ModelRecord | undefined {
    return this.records.get(id);
  }

  private emit(id: string, rec: ModelRecord, force = false): void {
    const now = Date.now();
    const last = this.lastEmit.get(id) ?? 0;
    if (!force && now - last < EMIT_THROTTLE_MS) return;
    this.lastEmit.set(id, now);
    for (const fn of this.listeners) {
      try {
        fn(id, rec);
      } catch {
        // 监听器异常不影响流程
      }
    }
  }

  private persist(rec: ModelRecord): void {
    void idb.putRecord(rec).catch(() => undefined);
  }

  startDownload(id: string): { started: boolean; record: ModelRecord } {
    const rec = this.records.get(id);
    if (!rec) throw new Error(`unknown model: ${id}`);
    if (
      rec.state === "downloading" ||
      rec.state === "queued" ||
      rec.state === "verifying"
    ) {
      return { started: false, record: rec };
    }
    void this.download(id).catch(() => undefined);
    return { started: true, record: this.records.get(id)! };
  }

  async download(id: string): Promise<void> {
    const rec = this.records.get(id);
    if (!rec) throw new Error(`unknown model: ${id}`);
    if (
      rec.state === "downloading" ||
      rec.state === "queued" ||
      rec.state === "verifying"
    ) {
      return;
    }
    const manifest = rec.manifest;
    const aborter = new AbortController();
    this.aborters.set(id, aborter);
    rec.error = undefined;
    try {
      rec.state = "queued";
      this.emit(id, rec, true);
      this.persist(rec);

      for (const file of manifest.files) {
        const finalPath = `${manifest.dir}/${file.path}`;
        const existing = await abortable(
          opfs.statFile(finalPath),
          aborter.signal
        );
        if (existing === file.size) {
          const curState = rec.files[file.path]?.state;
          if (curState === "installed" || !file.sha256) {
            this.setFile(id, file.path, {
              state: "installed",
              downloaded: file.size,
            });
            continue;
          }
          // 仅当成功算出哈希且与清单不符时才删除重下；读取异常直接抛出以保留现存文件
          const hash = await abortable(
            opfs.sha256File(finalPath, aborter.signal),
            aborter.signal
          );
          if (hash === file.sha256) {
            this.setFile(id, file.path, {
              state: "installed",
              downloaded: file.size,
              error: undefined,
            });
            continue;
          }
          await abortable(opfs.removeFile(finalPath), aborter.signal);
        }

        const tempPath = tempPathFor(id, file.path);
        const resumeFrom =
          (await abortable(opfs.statFile(tempPath), aborter.signal)) ?? 0;
        rec.state = "downloading";
        this.setFile(id, file.path, {
          state: "downloading",
          downloaded: resumeFrom,
          speed: 0,
          etaSeconds: null,
        });
        this.emit(id, rec, true);

        const downloadSource =
          this.mirror === "modelscope"
            ? (manifest.modelscopeSource ?? manifest.source)
            : manifest.source;
        await downloadFileToTemp(
          this.mirror,
          downloadSource,
          file,
          tempPath,
          {
            signal: aborter.signal,
            onProgress: (downloaded, _total, speed) => {
              const total = file.size;
              const eta = speed > 0 ? (total - downloaded) / speed : null;
              this.setFile(id, file.path, {
                state: "downloading",
                downloaded,
                speed,
                etaSeconds: eta,
              });
              this.emit(id, rec);
            },
          },
          manifest.base,
          manifest.revision
        );

        rec.state = "verifying";
        this.setFile(id, file.path, {
          state: "verifying",
          downloaded: file.size,
        });
        this.emit(id, rec, true);

        const actualSize = await abortable(
          opfs.statFile(tempPath),
          aborter.signal
        );
        if (actualSize !== file.size) {
          throw new DownloadError(
            `文件大小不符: ${actualSize ?? 0}/${file.size}`
          );
        }
        if (file.sha256) {
          const hash = await abortable(
            opfs.sha256File(tempPath, aborter.signal),
            aborter.signal
          );
          if (hash !== file.sha256) {
            throw new DownloadError(`SHA256 校验失败: ${hash}`);
          }
        }
        await abortable(opfs.moveFile(tempPath, finalPath), aborter.signal);
        this.setFile(id, file.path, {
          state: "installed",
          downloaded: file.size,
          speed: 0,
          etaSeconds: null,
        });
      }

      rec.state = "installed";
      rec.downloadedAt = Date.now();
      this.emit(id, rec, true);
      this.persist(rec);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        const paused = this.pauseRequested.has(id);
        if (paused) {
          rec.state = "paused";
          for (const f of manifest.files) {
            const fs = rec.files[f.path];
            if (fs && (fs.state === "downloading" || fs.state === "queued")) {
              fs.state = "paused";
            }
          }
        } else {
          rec.state = "not-installed";
          for (const f of manifest.files) {
            const fs = rec.files[f.path];
            if (fs && fs.state !== "installed") fs.state = "not-installed";
          }
          await this.removeTempFiles(id, manifest);
        }
      } else {
        rec.state = "error";
        rec.error = e instanceof Error ? e.message : String(e);
      }
      this.emit(id, rec, true);
      this.persist(rec);
    } finally {
      this.aborters.delete(id);
      this.pauseRequested.delete(id);
    }
  }

  async pause(id: string): Promise<void> {
    const rec = this.records.get(id);
    if (!rec) return;
    if (rec.state !== "downloading" && rec.state !== "queued" && rec.state !== "verifying") {
      return;
    }
    this.pauseRequested.add(id);
    this.aborters.get(id)?.abort();
  }

  async cancel(id: string): Promise<void> {
    const rec = this.records.get(id);
    if (!rec) return;
    if (rec.state === "downloading" || rec.state === "queued" || rec.state === "verifying") {
      this.aborters.get(id)?.abort();
      return;
    }
    rec.state = "not-installed";
    for (const f of rec.manifest.files) {
      const fs = rec.files[f.path];
      if (fs && fs.state !== "installed") {
        fs.state = "not-installed";
        fs.downloaded = 0;
        fs.error = undefined;
      }
    }
    await this.removeTempFiles(id, rec.manifest);
    this.emit(id, rec, true);
    this.persist(rec);
  }

  async remove(id: string): Promise<void> {
    const rec = this.records.get(id);
    if (!rec) return;
    if (this.aborters.has(id)) this.aborters.get(id)?.abort();
    const manifest = rec.manifest;
    for (const f of manifest.files) {
      await opfs.removeFile(`${manifest.dir}/${f.path}`);
    }
    await this.removeTempFiles(id, manifest);
    rec.state = "not-installed";
    rec.downloadedAt = undefined;
    rec.error = undefined;
    for (const f of manifest.files) {
      rec.files[f.path] = { state: "not-installed", downloaded: 0 };
    }
    await idb.deleteRecord(id);
    this.emit(id, rec, true);
  }

  startImportFiles(
    id: string,
    files: { name: string; file: File }[],
    taskId: string = nextRpcId("import-task"),
    onComplete?: (res: ModelImportTaskResult) => void
  ): { started: boolean; taskId: string; record: ModelRecord } {
    const rec = this.records.get(id);
    if (!rec) throw new Error(`unknown model: ${id}`);
    rec.error = undefined;
    rec.state = "verifying";
    this.emit(id, rec, true);
    void (async () => {
      await Promise.resolve();
      try {
        const imported = await this.importFiles(id, files);
        onComplete?.({
          taskId,
          modelId: id,
          ok: true,
          imported,
          record: this.records.get(id),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onComplete?.({
          taskId,
          modelId: id,
          ok: false,
          error: message,
          record: this.records.get(id),
        });
      }
    })();
    return { started: true, taskId, record: this.records.get(id)! };
  }

  async importFiles(
    id: string,
    files: { name: string; file: File }[]
  ): Promise<number> {
    const rec = this.records.get(id);
    if (!rec) throw new Error(`unknown model: ${id}`);
    const manifest = rec.manifest;
    const expected = new Map(manifest.files.map((f) => [f.path.split("/").pop(), f]));

    rec.error = undefined;
    rec.state = "verifying";
    this.emit(id, rec, true);

    try {
      const expanded: { name: string; file: File }[] = [];
      for (const item of files) {
        if (item.name.toLowerCase().endsWith(".zip")) {
          const subEntries = await extractZipEntries(item.file);
          expanded.push(...subEntries);
        } else {
          expanded.push(item);
        }
      }

      let imported = 0;
      for (const { name, file } of expanded) {
        const f = expected.get(name);
        if (!f) continue;
        if (file.size !== f.size) continue;
        const tempPath = tempPathFor(id, f.path);
        const finalPath = `${manifest.dir}/${f.path}`;
        this.setFile(id, f.path, { state: "verifying", downloaded: f.size });
        this.emit(id, rec, true);
        const hash = await opfs.writeBlobAndHash(
          tempPath,
          file,
          Boolean(f.sha256)
        );
        if (f.sha256 && hash !== f.sha256) {
          await opfs.removeFile(tempPath);
          throw new DownloadError(`${name} SHA256 校验失败`);
        }
        await opfs.moveFile(tempPath, finalPath);
        this.setFile(id, f.path, { state: "installed", downloaded: f.size });
        imported++;
        this.emit(id, rec, true);
      }
      const all = manifest.files.every(
        (f) => rec.files[f.path]?.state === "installed"
      );
      if (all) {
        rec.state = "installed";
        rec.downloadedAt = Date.now();
      } else {
        rec.state = "not-installed";
      }
      this.emit(id, rec, true);
      this.persist(rec);
      return imported;
    } catch (err) {
      rec.state = "error";
      rec.error = err instanceof Error ? err.message : String(err);
      this.emit(id, rec, true);
      this.persist(rec);
      throw err;
    }
  }

  async storageStats(): Promise<{ usage: number; quota: number }> {
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    } catch {
      return { usage: 0, quota: 0 };
    }
  }

  private setFile(
    id: string,
    filePath: string,
    patch: Partial<ModelRecord["files"][string]>
  ): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const fs = rec.files[filePath] ?? { state: "not-installed", downloaded: 0 };
    rec.files[filePath] = { ...fs, ...patch };
  }

  private async removeTempFiles(id: string, manifest: ModelManifest): Promise<void> {
    for (const f of manifest.files) {
      await opfs.removeFile(tempPathFor(id, f.path));
    }
  }
}

export { LocalModelManager as ModelManager };

/**
 * 扩展 UI 侧的远程 ModelManager 代理：
 * 所有下载/暂停/取消/删除/导入均委托给 offscreen.html 中的唯一 LocalModelManager 执行，
 * 并通过 BroadcastChannel 实时同步状态与进度。
 */
export class RemoteModelManager {
  private records = new Map<string, ModelRecord>();
  private listeners = new Set<ModelListener>();
  private mirror: Mirror;
  private initPromise: Promise<void> | null = null;
  private readonly host: RuntimeHostAdapter;

  constructor(
    mirror: Mirror = "hf-mirror",
    host: RuntimeHostAdapter = runtimeHost
  ) {
    this.mirror = mirror;
    this.host = host;
    for (const m of CATALOG) {
      this.records.set(m.id, newRecord(m));
    }
    this.host.onModelBroadcast((id, rec) => {
      this.records.set(id, rec);
      for (const fn of this.listeners) {
        try {
          fn(id, rec);
        } catch {
          // 忽略监听器异常
        }
      }
    });
    // 宿主关闭时，将仍处于下载/排队/校验中的模型记录标记为中断错误，防止界面一直停留在进行中状态
    this.host.onServiceState((state) => {
      if (state.state === "unloaded" && state.sessionVersion === -1) {
        const reason = state.reason || "Offscreen 宿主已关闭";
        for (const [id, rec] of this.records.entries()) {
          if (IN_PROGRESS.has(rec.state)) {
            const nextRec: ModelRecord = {
              ...rec,
              state: "error",
              error: `HOST_CLOSED: ${reason}`,
            };
            this.records.set(id, nextRec);
            for (const fn of this.listeners) {
              try {
                fn(id, nextRec);
              } catch {
                // 忽略异常
              }
            }
          }
        }
      }
    });
  }

  init(): Promise<void> {
    this.initPromise ??= this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const res = await this.host.request<
      Record<string, never>,
      { records: ModelRecord[]; mirror: Mirror }
    >({
      id: nextRpcId("model"),
      service: "model",
      method: "init",
      payload: {},
    });
    if (res.mirror) this.mirror = res.mirror;
    for (const rec of res.records ?? []) {
      this.records.set(rec.manifest.id, rec);
      for (const fn of this.listeners) {
        try {
          fn(rec.manifest.id, rec);
        } catch {
          // 忽略异常
        }
      }
    }
  }

  setMirror(mirror: Mirror): void {
    this.mirror = mirror;
    void this.host
      .request({
        id: nextRpcId("model"),
        service: "model",
        method: "setMirror",
        payload: { mirror },
      })
      .catch(() => undefined);
  }

  getMirror(): Mirror {
    return this.mirror;
  }

  subscribe(fn: ModelListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(): ModelRecord[] {
    return [...this.records.values()];
  }

  get(id: string): ModelRecord | undefined {
    return this.records.get(id);
  }

  async download(id: string): Promise<void> {
    const res = await this.host.request<
      { id: string },
      { started?: boolean; record?: ModelRecord }
    >({
      id: nextRpcId("model"),
      service: "model",
      method: "download",
      payload: { id },
    });
    if (res?.record) {
      this.records.set(id, res.record);
      for (const fn of this.listeners) {
        try {
          fn(id, res.record);
        } catch {
          // 忽略监听器异常
        }
      }
    }
  }

  async pause(id: string): Promise<void> {
    const res = await this.host.request<{ id: string }, { record?: ModelRecord }>({
      id: nextRpcId("model"),
      service: "model",
      method: "pause",
      payload: { id },
    });
    if (res?.record) this.records.set(id, res.record);
  }

  async cancel(id: string): Promise<void> {
    const res = await this.host.request<{ id: string }, { record?: ModelRecord }>({
      id: nextRpcId("model"),
      service: "model",
      method: "cancel",
      payload: { id },
    });
    if (res?.record) this.records.set(id, res.record);
  }

  async remove(id: string): Promise<void> {
    const res = await this.host.request<{ id: string }, { record?: ModelRecord }>({
      id: nextRpcId("model"),
      service: "model",
      method: "remove",
      payload: { id },
    });
    if (res?.record) this.records.set(id, res.record);
  }

  async importFiles(
    id: string,
    files: { name: string; file: File }[]
  ): Promise<number> {
    const taskId = nextRpcId("import-task");
    const waitTask = this.host.waitForImportTask(taskId, id);
    // 防止启动 RPC 报错时 waitTask 产生未捕获拒绝
    void waitTask.catch(() => undefined);

    try {
      const res = await this.host.request<
        { id: string; files: { name: string; file: File }[]; taskId: string },
        {
          started?: boolean;
          taskId?: string;
          imported?: number;
          record?: ModelRecord;
        }
      >({
        id: nextRpcId("model"),
        service: "model",
        method: "importFiles",
        payload: { id, files, taskId },
      });
      if (res?.record) {
        this.records.set(id, res.record);
        for (const fn of this.listeners) {
          try {
            fn(id, res.record);
          } catch {
            // 忽略监听器异常
          }
        }
      }
      if (typeof res?.imported === "number") {
        this.host.cancelImportWaiter(taskId);
        return res.imported;
      }
      const taskRes = await waitTask;
      if (taskRes.record) {
        this.records.set(id, taskRes.record);
        for (const fn of this.listeners) {
          try {
            fn(id, taskRes.record);
          } catch {
            // 忽略监听器异常
          }
        }
      }
      return taskRes.imported ?? 0;
    } catch (err) {
      this.host.cancelImportWaiter(taskId);
      const cur = this.records.get(id);
      if (cur && IN_PROGRESS.has(cur.state)) {
        const nextRec: ModelRecord = {
          ...cur,
          state: "error",
          error: err instanceof Error ? err.message : String(err),
        };
        this.records.set(id, nextRec);
        for (const fn of this.listeners) {
          try {
            fn(id, nextRec);
          } catch {
            // 忽略异常
          }
        }
      }
      throw err;
    }
  }

  async storageStats(): Promise<{ usage: number; quota: number }> {
    return this.host.request<Record<string, never>, { usage: number; quota: number }>({
      id: nextRpcId("model"),
      service: "model",
      method: "storageStats",
      payload: {},
    });
  }
}

// 全应用共享的单例：扩展模式下自动通过 runtimeHost 连接 offscreen.html 的 ModelManager。
export const sharedModelManager: LocalModelManager | RemoteModelManager =
  isExtensionContext
    ? new RemoteModelManager("hf-mirror")
    : new LocalModelManager("hf-mirror");
