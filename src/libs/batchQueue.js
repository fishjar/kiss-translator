import {
  DEFAULT_BATCH_INTERVAL,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_LENGTH,
} from "../config";

const abortError = () =>
  new DOMException("The operation was aborted.", "AbortError");
const destroyedError = () => new Error("Queue instance was destroyed.");

/** Batch requests while keeping each caller's cancellation independent. */
const BatchQueue = (
  taskFn,
  {
    batchInterval = DEFAULT_BATCH_INTERVAL,
    batchSize = DEFAULT_BATCH_SIZE,
    batchLength = DEFAULT_BATCH_LENGTH,
    batchConcurrency = 1,
  } = {}
) => {
  const queue = [];
  const activeBatches = new Set();
  const configuredConcurrency = Number(batchConcurrency);
  const concurrency =
    Number.isFinite(configuredConcurrency) && configuredConcurrency >= 1
      ? Math.floor(configuredConcurrency)
      : 1;
  let timer = null;
  let destroyed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const settle = (task, method, value) => {
    if (task.settled) return;
    task.settled = true;
    if (task.onAbort) {
      task.args.signal.removeEventListener("abort", task.onAbort);
      task.onAbort = null;
    }
    task[method](value);
  };

  const cancelTask = (task) => {
    if (task.settled) return;
    settle(task, "reject", abortError());

    if (task.batch) {
      // Never change dispatched indexes: other results still use those IDs.
      if (task.batch.tasks.every((item) => item.settled)) {
        task.batch.controller.abort();
      }
    } else {
      const index = queue.indexOf(task);
      if (index !== -1) queue.splice(index, 1);
      if (queue.length === 0) clearTimer();
    }
  };

  const scheduleProcessing = (delay = batchInterval) => {
    if (
      destroyed ||
      timer !== null ||
      activeBatches.size >= concurrency ||
      queue.length === 0
    ) {
      return;
    }
    timer = setTimeout(processQueue, delay);
  };

  const processQueue = async () => {
    clearTimer();
    if (destroyed || queue.length === 0 || activeBatches.size >= concurrency) {
      return;
    }

    let length = 0;
    let count = 0;
    for (const task of queue) {
      const textLength = task.payload?.length || 0;
      if (
        count >= batchSize ||
        (length + textLength > batchLength && count > 0)
      ) {
        break;
      }
      length += textLength;
      count++;
    }
    if (count === 0) return;

    const tasks = queue.splice(0, count);
    const batch = { tasks, controller: new AbortController() };
    activeBatches.add(batch);
    tasks.forEach((task) => {
      task.batch = batch;
    });

    try {
      const firstArgs = tasks[0].args;
      // Preserve the generic no-arguments API when nobody supplies a signal.
      const batchArgs =
        firstArgs || tasks.some((task) => task.args?.signal)
          ? { ...firstArgs, signal: batch.controller.signal }
          : firstArgs;
      const result = taskFn(
        tasks.map((task) => task.payload),
        batchArgs
      );

      if (result && typeof result[Symbol.asyncIterator] === "function") {
        for await (const item of result) {
          const task = tasks[item.id];
          if (!task || task.settled) continue;
          const isComplete = item.isComplete !== false;
          task.args?.onStreamChunk?.({
            id: item.id,
            text: isComplete ? item.result : item.partialText,
            isComplete,
          });
          // A callback can synchronously cancel its own request.
          if (isComplete) settle(task, "resolve", item.result);
        }
        tasks.forEach((task, index) => {
          settle(
            task,
            "reject",
            new Error("No response for item at index " + index)
          );
        });
      } else {
        const responses = await result;
        if (!Array.isArray(responses)) {
          throw new Error("responses format error");
        }
        tasks.forEach((task, index) => {
          if (responses[index]) {
            settle(task, "resolve", responses[index]);
          } else {
            settle(
              task,
              "reject",
              new Error("No response for item at index " + index)
            );
          }
        });
      }
    } catch (error) {
      tasks.forEach((task) => settle(task, "reject", error));
    } finally {
      tasks.forEach((task) => {
        task.batch = null;
      });
      // Cancellation settles callers immediately, but only completion of the
      // task function/iterator releases this batch's concurrency slot.
      activeBatches.delete(batch);
      scheduleProcessing(queue.length >= batchSize ? 0 : batchInterval);
    }
  };

  const addTask = (payload, args) => {
    if (destroyed) return Promise.reject(destroyedError());
    if (args?.signal?.aborted) return Promise.reject(abortError());

    return new Promise((resolve, reject) => {
      const task = {
        payload,
        args,
        resolve,
        reject,
        settled: false,
        batch: null,
        onAbort: null,
      };
      queue.push(task);
      if (args?.signal) {
        task.onAbort = () => cancelTask(task);
        args.signal.addEventListener("abort", task.onAbort, { once: true });
        if (args.signal.aborted) cancelTask(task);
      }
      if (task.settled) return;

      if (queue.length >= batchSize) {
        void processQueue();
      } else {
        scheduleProcessing();
      }
    });
  };

  const destroy = () => {
    destroyed = true;
    clearTimer();
    queue.splice(0).forEach((task) => settle(task, "reject", destroyedError()));
    for (const batch of activeBatches) {
      batch.tasks.forEach((task) => settle(task, "reject", destroyedError()));
      batch.controller.abort();
    }
  };

  return { addTask, destroy };
};

const queueMap = new Map();

/** Reuse a queue for a provider, language pair, and request configuration. */
export const getBatchQueue = (key, taskFn, options) => {
  if (queueMap.has(key)) return queueMap.get(key);
  const queue = BatchQueue(taskFn, options);
  queueMap.set(key, queue);
  return queue;
};

/** Cancel all outstanding work and allow subsequent calls to create new queues. */
export const clearAllBatchQueue = () => {
  const queues = [...queueMap.values()];
  queueMap.clear();
  queues.forEach((queue) => queue.destroy());
};
