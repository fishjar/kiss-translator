// RuntimePool（文档 §11 & §44）：
// 跟踪常驻/活跃的模型实例，支持 pin 保护（如 Laya/JEV 默认常驻、正在识别的 ASR / 播放中的 TTS），
// 以及在模型数量超限或 OOM 时按 LRU 淘汰权重（优先卸载空闲 LLM / OCR，保留 JEV）。

import type { AiRpcService } from "./rpc";

export interface RuntimeEntry {
  key: string;
  service: AiRpcService;
  modelId: string;
  state: "loading" | "ready" | "idle";
  lastUsed: number;
  pinned: boolean;
  memoryMB?: number;
}

interface ManagedEntry extends RuntimeEntry {
  unloadFn: () => Promise<void> | void;
}

const EVICTION_ORDER: Record<string, number> = {
  llm: 0, // 最优先被 LRU 淘汰
  ocr: 1,
  translation: 2,
  tts: 3,
  asr: 4,
  decision: 10, // JEV 常用于路由，最后才考虑卸载
};

export class RuntimePool {
  private entries = new Map<string, ManagedEntry>();
  private readonly maxResidentModels: number;

  constructor(maxResidentModels = 4) {
    this.maxResidentModels = Math.max(1, maxResidentModels);
  }

  register(
    entry: Omit<RuntimeEntry, "lastUsed"> & {
      lastUsed?: number;
      unloadFn: () => Promise<void> | void;
    }
  ): void {
    this.entries.set(entry.key, {
      ...entry,
      lastUsed: entry.lastUsed ?? Date.now(),
    });
  }

  markState(key: string, state: RuntimeEntry["state"]): void {
    const item = this.entries.get(key);
    if (!item) return;
    item.state = state;
    item.lastUsed = Date.now();
  }

  setPinned(key: string, pinned: boolean): void {
    const item = this.entries.get(key);
    if (item) item.pinned = pinned;
  }

  touch(key: string): void {
    const item = this.entries.get(key);
    if (item) item.lastUsed = Date.now();
  }

  async unload(key: string): Promise<boolean> {
    const item = this.entries.get(key);
    if (!item) return false;
    await item.unloadFn();
    this.entries.delete(key);
    return true;
  }

  forget(key: string): void {
    this.entries.delete(key);
  }

  /**
   * 当驻留模型数超过上限或显存不足时，淘汰 1 个未 pin 且处于 idle/ready 的模型。
   * 优先卸载 LLM / OCR，再按最久未使用（lastUsed 最小）排序。
   */
  async evictOne(excludeKey?: string): Promise<string | null> {
    const candidates = [...this.entries.values()].filter(
      (e) =>
        e.key !== excludeKey &&
        !e.pinned &&
        (e.state === "idle" || e.state === "ready")
    );
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const prioA = EVICTION_ORDER[a.service] ?? 5;
      const prioB = EVICTION_ORDER[b.service] ?? 5;
      if (prioA !== prioB) return prioA - prioB;
      return a.lastUsed - b.lastUsed;
    });

    const victim = candidates[0]!;
    await this.unload(victim.key);
    return victim.key;
  }

  async ensureCapacity(excludeKey?: string): Promise<void> {
    while (this.entries.size >= this.maxResidentModels) {
      const evicted = await this.evictOne(excludeKey);
      if (!evicted) break;
    }
  }

  list(): RuntimeEntry[] {
    return [...this.entries.values()].map(
      ({ unloadFn: _u, ...publicFields }) => ({ ...publicFields })
    );
  }
}
