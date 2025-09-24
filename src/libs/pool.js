import { DEFAULT_FETCH_INTERVAL, DEFAULT_FETCH_LIMIT } from "../config";
import { kissLog } from "./log";

/**
 * 任务池
 */
class TaskPool {
  #pool = [];

  #maxRetry = 2; // 最大重试次数
  #retryInterval = 1000; // 重试间隔时间
  #limit; // 最大并发数
  #interval; // 任务最小启动间隔

  #currentConcurrent = 0; // 当前正在执行的任务数
  #lastExecutionTime = 0; // 上一个任务的启动时间
  #schedulerTimer = null; // 用于调度下一个任务的定时器

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
   */
  #scheduleNext() {
    if (this.#schedulerTimer) {
      return;
    }

    if (this.#currentConcurrent >= this.#limit || this.#pool.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - this.#lastExecutionTime;
    const delay = Math.max(0, this.#interval - timeSinceLast);

    this.#schedulerTimer = setTimeout(() => {
      this.#schedulerTimer = null;
      if (this.#currentConcurrent < this.#limit && this.#pool.length > 0) {
        const task = this.#pool.shift();
        if (task) {
          this.#lastExecutionTime = Date.now();
          this.#execute(task);
        }
      }

      if (this.#pool.length > 0) {
        this.#scheduleNext();
      }
    }, delay);
  }

  /**
   * 执行单个任务
   * @param {object} task - 任务对象
   */
  async #execute(task) {
    this.#currentConcurrent++;
    const { fn, args, resolve, reject, retry } = task;

    try {
      const res = await fn(args);
      resolve(res);
    } catch (err) {
      kissLog("task pool", err);
      if (retry < this.#maxRetry) {
        setTimeout(() => {
          this.#pool.unshift({ ...task, retry: retry + 1 }); // unshift 保证重试任务优先
          this.#scheduleNext();
        }, this.#retryInterval);
      } else {
        reject(err);
      }
    } finally {
      this.#currentConcurrent--;
      this.#scheduleNext();
    }
  }

  /**
   * 向任务池中添加一个新任务
   * @param {Function} fn - 要执行的异步函数
   * @param {*} args - 函数的参数
   * @returns {Promise}
   */
  push(fn, args) {
    return new Promise((resolve, reject) => {
      this.#pool.push({ fn, args, resolve, reject, retry: 0 });
      this.#scheduleNext();
    });
  }

  /**
   * 更新任务池的配置
   * @param {number} interval - 新的最小任务间隔
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
    for (const task of this.#pool) {
      task.reject("the task pool was cleared");
    }

    this.#pool.length = 0;
    if (this.#schedulerTimer) {
      clearTimeout(this.#schedulerTimer);
      this.#schedulerTimer = null;
    }
  }
}

/**
 * 请求池实例
 */
let fetchPool;

/**
 * 获取请求池实例
 * @param interval
 * @param limit
 * @returns
 */
export const getFetchPool = (interval, limit) => {
  if (!fetchPool) {
    fetchPool = new TaskPool(
      interval ?? DEFAULT_FETCH_INTERVAL,
      limit ?? DEFAULT_FETCH_LIMIT
    );
  } else if (interval && limit) {
    updateFetchPool(interval, limit);
  }
  return fetchPool;
};

/**
 * 更新请求池参数
 * @param {*} interval
 * @param {*} limit
 */
export const updateFetchPool = (interval, limit) => {
  fetchPool?.update(interval, limit);
};

/**
 * 清空请求池
 */
export const clearFetchPool = () => {
  fetchPool?.clear();
};
