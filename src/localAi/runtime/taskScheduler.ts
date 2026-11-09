// GPU TaskScheduler（文档 §12）：
// 同一时间限制单个 heavy GPU inference 执行，按优先级 P0(Decision/JEV) ~ P5(Preload) 排队。
// 核心不变量：
// 1. 活跃任务取消或超时时，必须通知服务层停止底层执行（onCancel / AbortSignal）；
// 2. 绝不在旧任务（及其停止/清理钩子）彻底结束前释放并发槽位或启动下一项 GPU 任务。

export const TASK_PRIORITY = {
  DECISION: 0, // P0 Decision / JEV
  ASR: 1, // P1 Realtime ASR
  OCR: 2, // P2 用户主动 OCR / Translation
  TTS: 3, // P3 TTS
  LLM: 4, // P4 LLM
  PRELOAD: 5, // P5 preload / benchmark
} as const;

export interface ScheduledTaskOptions {
  id?: string;
  priority?: number;
  deadlineMs?: number;
  signal?: AbortSignal;
  onCancel?: (reason: string) => Promise<void> | void;
}

export interface ScheduledTaskResult<T> {
  value: T;
  queueMs: number;
  inferenceMs: number;
}

interface QueueEntry<T = unknown> {
  id: string;
  priority: number;
  enqueuedAt: number;
  deadlineMs?: number;
  signal?: AbortSignal;
  onCancel?: (reason: string) => Promise<void> | void;
  fn: (signal: AbortSignal) => Promise<T>;
  resolve: (res: ScheduledTaskResult<T>) => void;
  reject: (err: Error) => void;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  abortReason?: string;
  cancelPromise?: Promise<void>;
}

export class TaskScheduler {
  private readonly maxConcurrency: number;
  private activeCount = 0;
  private queue: QueueEntry<any>[] = [];
  private activeEntries = new Map<string, QueueEntry<any>>();

  constructor(maxConcurrency = 1) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
  }

  schedule<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    options: ScheduledTaskOptions = {}
  ): Promise<ScheduledTaskResult<T>> {
    const id = options.id ?? `task-${Date.now()}-${Math.random()}`;
    const priority = options.priority ?? TASK_PRIORITY.OCR;
    const enqueuedAt = performance.now();

    if (options.signal?.aborted) {
      return Promise.reject(new Error("REQUEST_CANCELLED: 任务已取消"));
    }

    return new Promise<ScheduledTaskResult<T>>((resolve, reject) => {
      const controller = new AbortController();
      const entry: QueueEntry<T> = {
        id,
        priority,
        enqueuedAt,
        deadlineMs: options.deadlineMs,
        signal: options.signal,
        onCancel: options.onCancel,
        fn,
        resolve,
        reject,
        controller,
      };

      const onAbort = () => {
        this.cancel(id, "REQUEST_CANCELLED: 任务已取消");
      };
      if (options.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      if (options.deadlineMs && options.deadlineMs > 0) {
        entry.timer = setTimeout(() => {
          this.cancel(
            id,
            `REQUEST_TIMEOUT: 任务超时 (${options.deadlineMs}ms)`
          );
        }, options.deadlineMs);
      }

      // 按 priority 升序插入（P0 最优先，同优先级保持 FIFO）
      let insertIdx = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i]!.priority > priority) {
          insertIdx = i;
          break;
        }
      }
      this.queue.splice(insertIdx, 0, entry);
      this.pump();
    });
  }

  cancel(id: string, reason = "REQUEST_CANCELLED: 任务已取消"): boolean {
    const idx = this.queue.findIndex((q) => q.id === id);
    if (idx !== -1) {
      const [entry] = this.queue.splice(idx, 1);
      if (entry) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.abortReason = reason;
        entry.controller.abort(reason);
        entry.reject(new Error(reason));
      }
      return true;
    }
    const active = this.activeEntries.get(id);
    if (active) {
      if (!active.abortReason) {
        if (active.timer) clearTimeout(active.timer);
        active.abortReason = reason;
        active.controller.abort(reason);
        if (active.onCancel) {
          active.cancelPromise = Promise.resolve()
            .then(() => active.onCancel!(reason))
            .catch(() => undefined);
        }
      }
      return true;
    }
    return false;
  }

  stats(): { active: number; queued: number } {
    return { active: this.activeCount, queued: this.queue.length };
  }

  private pump(): void {
    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      if (entry.controller.signal.aborted) continue;

      this.activeCount++;
      this.activeEntries.set(entry.id, entry);
      const startAt = performance.now();
      const queueMs = Math.max(
        0,
        Math.round((startAt - entry.enqueuedAt) * 10) / 10
      );

      Promise.resolve()
        .then(() => entry.fn(entry.controller.signal))
        .then(
          async (value) => {
            if (entry.timer) clearTimeout(entry.timer);
            if (entry.cancelPromise) await entry.cancelPromise;
            const inferenceMs = Math.max(
              0,
              Math.round((performance.now() - startAt) * 10) / 10
            );
            if (entry.abortReason || entry.controller.signal.aborted) {
              entry.reject(
                new Error(entry.abortReason ?? "REQUEST_CANCELLED: 任务已取消")
              );
            } else {
              entry.resolve({ value, queueMs, inferenceMs });
            }
          },
          async (err) => {
            if (entry.timer) clearTimeout(entry.timer);
            if (entry.cancelPromise) await entry.cancelPromise;
            if (entry.abortReason) {
              entry.reject(new Error(entry.abortReason));
            } else {
              entry.reject(err instanceof Error ? err : new Error(String(err)));
            }
          }
        )
        .finally(() => {
          // 仅在底层执行函数与取消钩子全部结算后，才释放并发槽位并推进下一项任务
          this.activeCount--;
          this.activeEntries.delete(entry.id);
          this.pump();
        });
    }
  }
}
