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
  vlm: 0,
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
  private memoryBudgetMB = 0;
  private reservations = new Map<string, number>();

  setMemoryBudget(memoryMB: number): void { this.memoryBudgetMB = memoryMB; }

  async reserve(key: string, memoryMB: number): Promise<void> {
    await this.ensureCapacity(key, memoryMB);
    this.reservations.set(key, memoryMB);
  }

  async trimToBudget(memoryMB: number): Promise<void> {
    while (memoryMB > 0 && this.list().reduce((n, e) => n + (e.memoryMB ?? 0), 0) > memoryMB) {
      if (!await this.evictOne()) throw new Error("RESOURCE_BUDGET_EXCEEDED: 没有可淘汰的空闲模型");
    }
  }

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
      memoryMB: entry.memoryMB ?? this.reservations.get(entry.key),
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
    this.reservations.delete(key);
    return true;
  }

  forget(key: string): void {
    this.entries.delete(key);
    this.reservations.delete(key);
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

  async ensureCapacity(excludeKey?: string, incomingMB = 0): Promise<void> {
    const exceeds = () => {
      const remaining = this.list().filter(e => e.key !== excludeKey);
      return remaining.length >= this.maxResidentModels ||
        (this.memoryBudgetMB > 0 && remaining.reduce((n, e) => n + (e.memoryMB ?? 0), incomingMB) > this.memoryBudgetMB);
    };
    // 单个模型已经超过预算时，保留现有模型，直接拒绝新加载。
    if (this.memoryBudgetMB > 0 && incomingMB > this.memoryBudgetMB)
      throw new Error("RESOURCE_BUDGET_EXCEEDED: 目标模型估算占用超过驻留预算");
    while (exceeds()) {
      if (!await this.evictOne(excludeKey))
        throw new Error("RESOURCE_BUDGET_EXCEEDED: 没有可淘汰的空闲模型");
    }
  }

  list(): RuntimeEntry[] {
    return [...this.entries.values()].map(
      ({ unloadFn: _u, ...publicFields }) => ({ ...publicFields })
    );
  }
}
