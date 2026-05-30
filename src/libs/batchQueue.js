import {
  DEFAULT_BATCH_INTERVAL,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_LENGTH,
} from "../config";

/**
 * 批处理队列工厂函数
 * 支持生成器模式：当 taskFn 是一个异步生成器时，它会 yield {id, result} 逐个异步返回结果；
 * 同时也支持传统的普通 Promise 模式，期待 taskFn 返回一个包含所有结果的数组。
 *
 * @param {Function} taskFn - 执行批处理翻译的函数
 * @param {object} options - 批处理配置项
 * @param {number} [options.batchInterval] - 触发批处理的最大延迟等待时间（毫秒）
 * @param {number} [options.batchSize] - 触发批处理的最大任务条数上限
 * @param {number} [options.batchLength] - 整个批次中所有文本内容的最大字符长度上限，防止超长报错
 * @returns {object} 返回具有 addTask 和 destroy 方法的实例对象
 */
const BatchQueue = (
  taskFn,
  {
    batchInterval = DEFAULT_BATCH_INTERVAL,
    batchSize = DEFAULT_BATCH_SIZE,
    batchLength = DEFAULT_BATCH_LENGTH,
  } = {}
) => {
  const queue = []; // 存储待处理翻译任务的队列
  let isProcessing = false; // 当前队列是否正在处理中
  let timer = null; // 用于延迟处理任务的定时器

  /**
   * 处理当前队列中的任务
   * // REVIEW: 1. 异步生成器中断与对齐隐患。这里强依赖底层 taskFn 异步生成器产出的每一项 item.id 能与 tasksToProcess 数组的索引精确对应。
   * // 如果翻译源 API 在内部产生错误、提前 break 退出或返回了错误的 id（越界或不合法），会导致部分段落无法 resolve。
   * // 并且如果流式迭代器由于任意异常（如超时）意外中断，在 catch 块中，所有未被 resolve 的任务都会被统一 reject 报错。
   */
  const processQueue = async () => {
    // 每次开始处理，清除延迟定时器
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    // 如果队列为空或已经在处理中，则直接返回
    if (queue.length === 0 || isProcessing) {
      return;
    }

    isProcessing = true;

    let tasksToProcess = [];
    let currentBatchLength = 0;
    let endIndex = 0;

    // 贪心策略：根据 batchSize 和字符长度 batchLength 计算本批次可以打包执行的任务范围
    for (const task of queue) {
      const textLength = task.payload?.length || 0;
      if (
        endIndex >= batchSize ||
        (currentBatchLength + textLength > batchLength && endIndex > 0)
      ) {
        break;
      }
      currentBatchLength += textLength;
      endIndex++;
    }

    // 从全局队列中截取要处理的任务
    if (endIndex > 0) {
      tasksToProcess = queue.splice(0, endIndex);
    }

    if (tasksToProcess.length === 0) {
      isProcessing = false;
      return;
    }

    try {
      const payloads = tasksToProcess.map((item) => item.payload);
      const batchArgs = tasksToProcess[0].args;

      // 调用具体的翻译函数（可能返回 AsyncGenerator 或 Promise）
      const generator = taskFn(payloads, batchArgs);

      // 检查是否是异步生成器（用于流式逐句返回结果的翻译源，如 OpenAI/Gemini）
      if (generator && typeof generator[Symbol.asyncIterator] === "function") {
        for await (const item of generator) {
          const id = item.id;
          const isComplete = item.isComplete !== false; // 默认完成状态为 true
          const taskItem = tasksToProcess[id];

          if (taskItem) {
            // 流式渲染的中间状态回调（当 isComplete 为 false 且有分块回调时）
            if (!isComplete && taskItem.args?.onStreamChunk) {
              taskItem.args.onStreamChunk({
                id,
                text: item.partialText,
                isComplete: false,
              });
            }
            // 单个段落完全翻译结束：触发回调并 resolve 对应任务的 Promise
            if (isComplete) {
              if (taskItem.args?.onStreamChunk) {
                taskItem.args.onStreamChunk({
                  id,
                  text: item.result,
                  isComplete: true,
                });
              }
              if (!taskItem.resolved) {
                taskItem.resolved = true;
                taskItem.resolve(item.result);
              }
            }
          }
        }

        // 兜底：处理生成器执行完毕后，仍未收到翻译结果的任务（标注异常）
        tasksToProcess.forEach((taskItem, index) => {
          if (!taskItem.resolved) {
            taskItem.reject(
              new Error(`No response for item at index ${index}`)
            );
          }
        });
      } else {
        // 非生成器模式（兼容旧的 Promise 模式，一次性返回所有翻译结果）
        const responses = await generator;
        if (!Array.isArray(responses)) {
          throw new Error("responses format error");
        }

        tasksToProcess.forEach((taskItem, index) => {
          const response = responses[index];
          if (response) {
            taskItem.resolve(response);
          } else {
            taskItem.reject(
              new Error(`No response for item at index ${index}`)
            );
          }
        });
      }
    } catch (error) {
      // 捕获异常，确保把这一批次尚未 resolved 的任务全部以 reject 异常形式结束
      tasksToProcess.forEach((taskItem) => {
        if (!taskItem.resolved) {
          taskItem.resolved = true;
          taskItem.reject(error);
        }
      });
    } finally {
      isProcessing = false;
      // 如果队列中还有残留任务，判断是否立即继续处理还是延迟等待
      if (queue.length > 0) {
        if (queue.length >= batchSize) {
          setTimeout(processQueue, 0); // 达到批尺寸，立即起新的事件循环继续处理
        } else {
          scheduleProcessing(); // 未达批尺寸，安排延迟防抖执行
        }
      }
    }
  };

  /**
   * 安排下一次队列的延迟防抖执行
   */
  const scheduleProcessing = () => {
    if (!isProcessing && !timer && queue.length > 0) {
      timer = setTimeout(processQueue, batchInterval);
    }
  };

  /**
   * 向批处理队列添加一个新的翻译任务
   * @param {string} data - 需要翻译的原文本内容
   * @param {object} args - 附加参数（如流式回调等）
   * @returns {Promise<string>}
   */
  const addTask = (data, args) => {
    return new Promise((resolve, reject) => {
      const payload = data;
      queue.push({ payload, resolve, reject, args });

      // 如果当前积压的任务量已达批处理阈值，则立即开始处理
      if (queue.length >= batchSize) {
        processQueue();
      } else {
        scheduleProcessing();
      }
    });
  };

  /**
   * 销毁队列实例，拒绝所有队列中未决的任务并清理定时器
   */
  const destroy = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    queue.forEach((task) =>
      task.reject(new Error("Queue instance was destroyed."))
    );
    queue.length = 0;
  };

  return { addTask, destroy };
};

// 全局注册的队列字典，key 通常是翻译服务标识 (apiSlug)，实现多引擎队列隔离
const queueMap = new Map();

/**
 * 获取指定 Key 的批处理队列实例（单例模式）
 * @param {string} key - 队列标识
 * @param {Function} taskFn - 执行函数
 * @param {object} options - 配置参数
 * @returns {object} BatchQueue 实例
 */
export const getBatchQueue = (key, taskFn, options) => {
  if (queueMap.has(key)) {
    return queueMap.get(key);
  }

  const queue = BatchQueue(taskFn, options);
  queueMap.set(key, queue);
  return queue;
};

/**
 * 销毁并清除所有活跃的批处理队列
 * // REVIEW: queueMap 内存泄漏隐患。本方法遍历了 queueMap 的所有 value 并调用了 queue.destroy()，
 * // 但并没有调用 `queueMap.clear()` 或从 Map 中删除这些被销毁的 queue 引用。
 * // 导致这些已被 destroy 的 BatchQueue 实例依然驻留在 Map 中，这不仅会产生内存泄漏，
 * // 还可能导致后续相同 key 再次调用 getBatchQueue(key) 时，返回一个已被 destroy 无法正常工作的死实例。
 */
export const clearAllBatchQueue = () => {
  for (const queue of queueMap.values()) {
    queue.destroy();
  }
};
