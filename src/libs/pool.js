// Used by the Offscreen Broker too: import pure constants, not the page configuration barrel.
import {
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT,
} from "../config/apiConstants";
import { logger } from "./log";

/**
 * 任务池（TaskPool）
 * 用于控制异步任务（如网络请求）的并发数、最小执行间隔和重试机制，防止请求过于密集被翻译服务封禁。
 */
export class TaskPool {
  #pool = []; // 待执行的任务队列

  #maxRetry = 2; // 最大重试次数
  #retryInterval = 1000; // 发生错误时的重试间隔时间（毫秒）
  #limit; // 最大并发限制数
  #interval; // 任务最小启动时间间隔（毫秒），防止请求过于高频

  #currentConcurrent = 0; // 当前正在执行的任务数
  #lastExecutionTime = 0; // 上一个任务的启动时间戳，用于计算延迟
  #schedulerTimer = null; // 用于调度下一个任务的延迟定时器
  #retrying = new Set();

  /**
   * 构造函数
   * @param {number} interval - 任务最小启动间隔
   * @param {number} limit - 最大并发数
   * @param {number} retryInterval - 失败重试间隔
   */
  constructor(
    interval = DEFAULT_FETCH_INTERVAL,
    limit = DEFAULT_FETCH_LIMIT,
    retryInterval = 1000
  ) {
    this.#interval = interval;
    this.#limit = limit;
    this.#retryInterval = retryInterval;
  }

  /**
   * 调度器
   * 负责从队列中取出任务，并在满足并发限制和时间间隔约束时执行它。
   */
  #scheduleNext() {
    // 如果已经有调度定时器正在等待，则不再重复调度
    if (this.#schedulerTimer) {
      return;
    }

    // 如果当前并发数已达上限，或者队列中已无任务，则无需调度
    if (this.#currentConcurrent >= this.#limit || this.#pool.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - this.#lastExecutionTime;
    // 计算距离上一次任务启动是否已满足最小间隔，如果不满足则计算所需延迟
    const delay = Math.max(0, this.#interval - timeSinceLast);

    this.#schedulerTimer = setTimeout(() => {
      this.#schedulerTimer = null;
      // 在定时器触发后，重新检查并发限制和队列状态
      if (this.#currentConcurrent < this.#limit && this.#pool.length > 0) {
        const task = this.#pool.shift();
        if (task) {
          this.#lastExecutionTime = Date.now();
          this.#execute(task);
        }
      }

      // 如果队列中还有任务，继续调度下一个
      if (this.#pool.length > 0) {
        this.#scheduleNext();
      }
    }, delay);
  }

  /**
   * 执行单个任务
   * @param {object} task - 任务对象，包含执行函数、参数、Promise的回调和当前重试次数
   */
  async #execute(task) {
    this.#currentConcurrent++;
    const { fn, args, resolve, reject, retry } = task;

    try {
      // 执行传入的异步任务函数
      const res = await fn(
        args && typeof args === "object" && args.opts
          ? {
              ...args,
              opts: {
                ...args.opts,
                diagnostic: { ...args.opts.diagnostic, attempt: retry + 1 },
              },
            }
          : args
      );
      resolve(res);
    } catch (err) {
      if (err?.name === "AbortError") {
        // Cancellation is final and must never start another request.
        reject(err);
      } else if (
        !task.settled &&
        retry < (task.options.maxRetries ?? this.#maxRetry)
      ) {
        logger
          .child("request-pool")
          .event(
            "warn",
            "request.retry",
            { ...args?.opts?.diagnostic, attempt: retry + 1 },
            err
          );
        this.#retrying.add(task);
        task.retryTimer = setTimeout(() => {
          this.#retrying.delete(task);
          if (task.settled) return;
          // 将重试的任务重新放入队列头部，以保证重试任务优先被执行
          task.retry = retry + 1;
          this.#pool.unshift(task);
          this.#scheduleNext();
        }, this.#retryInterval);
      } else {
        logger
          .child("request-pool")
          .event(
            args?.opts?.diagnostic?.taskId ? "warn" : "error",
            "request.exhausted",
            { ...args?.opts?.diagnostic, attempt: retry + 1 },
            err
          );
        // 达到最大重试次数后，抛出错误并拒绝 Promise
        reject(err);
      }
    } finally {
      // 任务结束，并发数递减，触发下一次调度
      this.#currentConcurrent--;
      this.#scheduleNext();
    }
  }

  /**
   * 向任务池中添加一个新任务
   * @param {Function} fn - 要执行的异步函数
   * @param {*} args - 函数的参数
   * @returns {Promise} 返回一个在任务完成后 resolve 的 Promise
   */
  push(fn, args, options = {}) {
    return new Promise((resolve, reject) => {
      const task = { fn, args, options, retry: 0, settled: false };
      const settle = (callback, value) => {
        if (task.settled) return;
        task.settled = true;
        clearTimeout(task.retryTimer);
        this.#retrying.delete(task);
        options.signal?.removeEventListener("abort", cancel);
        callback(value);
      };
      task.resolve = (value) => settle(resolve, value);
      task.reject = (error) => settle(reject, error);
      const cancel = () => {
        this.#pool = this.#pool.filter((entry) => entry !== task);
        task.reject(
          new DOMException("The operation was aborted.", "AbortError")
        );
      };
      options.signal?.addEventListener("abort", cancel, { once: true });
      if (options.signal?.aborted) {
        cancel();
        return;
      }
      this.#pool.push(task);
      this.#scheduleNext();
    });
  }

  /**
   * 动态更新任务池的配置参数
   * @param {number} interval - 新的最小任务间隔（毫秒）
   * @param {number} limit - 新的最大并发数
   */
  update(interval, limit) {
    if (interval >= 0) {
      this.#interval = interval;
    }
    if (limit >= 1) {
      this.#limit = limit;
    }

    this.#scheduleNext();
  }

  /**
   * 清空任务池
   */
  clear() {
    // 拒绝队列中所有等待执行的任务
    // Retry waits are pending tasks too; rejecting them prevents delayed replay after clear.
    for (const task of [...this.#pool, ...this.#retrying]) {
      task.reject(new DOMException("The task pool was cleared.", "AbortError"));
    }

    // 清空任务队列
    this.#pool.length = 0;
    // 取消挂起的调度定时器
    if (this.#schedulerTimer) {
      clearTimeout(this.#schedulerTimer);
      this.#schedulerTimer = null;
    }
  }
}

/**
 * 全局共享的请求池实例
 */
let fetchPool;

/**
 * 获取请求池实例（单例模式）
 * @param {number} [interval] - 任务最小启动间隔
 * @param {number} [limit] - 最大并发数
 * @returns {TaskPool}
 */
export const getFetchPool = (interval, limit) => {
  if (!fetchPool) {
    fetchPool = new TaskPool(
      interval ?? DEFAULT_FETCH_INTERVAL,
      limit ?? DEFAULT_FETCH_LIMIT
    );
  } else if (interval >= 0 && limit >= 1) {
    updateFetchPool(interval, limit);
  }
  return fetchPool;
};

/**
 * 更新全局请求池参数
 * @param {number} interval - 最小间隔（毫秒）
 * @param {number} limit - 并发限制数
 */
export const updateFetchPool = (interval, limit) => {
  fetchPool?.update(interval, limit);
};

/**
 * 清空全局请求池中的所有任务
 */
export const clearFetchPool = () => {
  fetchPool?.clear();
};
