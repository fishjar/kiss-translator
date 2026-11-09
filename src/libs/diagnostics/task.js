import { logger } from "../log";

export function startLogTask(module, context = {}) {
  const log = logger.child(module);
  const started = Date.now();
  const metadata = {
    taskId:
      globalThis.crypto?.randomUUID?.() ||
      `task-${started}-${Math.random().toString(36).slice(2)}`,
    ...context,
  };
  const stages = new Set();
  let finished = false;
  log.event("info", "task.started", metadata);
  return {
    context: metadata,
    stage(stage) {
      if (finished || stages.has(stage)) return;
      stages.add(stage);
      log.event("info", "task.stage", { ...metadata, stage });
    },
    finish(error, extra = {}) {
      if (finished) return;
      finished = true;
      const cancelled =
        error?.name === "AbortError" || error?.code === "REQUEST_CANCELLED";
      log.event(
        error && !cancelled ? "error" : "info",
        cancelled ? "task.cancelled" : error ? "task.failed" : "task.completed",
        {
          ...metadata,
          ...extra,
          elapsedMs: Date.now() - started,
          ...(error?.code && { code: error.code }),
        },
        error
      );
    },
  };
}
