import {
  DEFAULT_BATCH_INTERVAL,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_LENGTH,
} from "../config";

/**
 * 批处理队列
 * @param {*} args
 * @param {*} param1
 * @returns
 */
const BatchQueue = (
  taskFn,
  {
    batchInterval = DEFAULT_BATCH_INTERVAL,
    batchSize = DEFAULT_BATCH_SIZE,
    batchLength = DEFAULT_BATCH_LENGTH,
  } = {}
) => {
  const queue = [];
  let isProcessing = false;
  let timer = null;

  const sendBatchRequest = async (payloads, batchArgs) => {
    return taskFn(payloads, batchArgs);
  };

  const processQueue = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (queue.length === 0 || isProcessing) {
      return;
    }

    isProcessing = true;

    let tasksToProcess = [];
    let currentBatchLength = 0;
    let endIndex = 0;

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
      const responses = await sendBatchRequest(payloads, batchArgs);
      if (!Array.isArray(responses)) {
        throw new Error("responses format error");
      }

      tasksToProcess.forEach((taskItem, index) => {
        const response = responses[index];
        if (response) {
          taskItem.resolve(response);
        } else {
          taskItem.reject(new Error(`No response for item at index ${index}`));
        }
      });
    } catch (error) {
      tasksToProcess.forEach((taskItem) => taskItem.reject(error));
    } finally {
      isProcessing = false;
      if (queue.length > 0) {
        if (queue.length >= batchSize) {
          setTimeout(processQueue, 0);
        } else {
          scheduleProcessing();
        }
      }
    }
  };

  const scheduleProcessing = () => {
    if (!isProcessing && !timer && queue.length > 0) {
      timer = setTimeout(processQueue, batchInterval);
    }
  };

  const addTask = (data, args) => {
    return new Promise((resolve, reject) => {
      const payload = data;
      queue.push({ payload, resolve, reject, args });

      if (queue.length >= batchSize) {
        processQueue();
      } else {
        scheduleProcessing();
      }
    });
  };

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

// 实例字典
const queueMap = new Map();

/**
 * 获取批处理实例
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
 * 清除所有任务
 */
export const clearAllBatchQueue = () => {
  for (const queue of queueMap.values()) {
    queue.destroy();
  }
};
