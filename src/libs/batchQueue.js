import { fetchTranslate } from "../apis/trans";

/**
 * 批处理队列
 * @param {*} translator
 * @param {*} param1
 * @returns
 */
const batchQueue = (
  { translator, from, to, docInfo, apiSetting, usePool },
  { batchInterval = 1000, batchSize = 10, batchLength = 10000 } = {}
) => {
  const queue = [];
  let isProcessing = false;
  let timer = null;

  const sendBatchRequest = async (payloads) => {
    const texts = payloads.map((item) => item.text);
    return fetchTranslate({
      translator,
      texts,
      from,
      to,
      docInfo,
      apiSetting,
      usePool,
    });
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
      const textLength = task.payload.text?.length || 0;
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
      const responses = await sendBatchRequest(payloads);

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

  const addTask = (data) => {
    return new Promise((resolve, reject) => {
      const payload = data;
      queue.push({ payload, resolve, reject });

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
 * @param {*} translator
 * @returns
 */
export const getBatchQueue = (args, opts) => {
  const { translator, from, to } = args;
  const key = `${translator}_${from}_${to}`;
  if (queueMap.has(key)) {
    return queueMap.get(key);
  }

  const queue = batchQueue(args, opts);
  queueMap.set(key, queue);
  return queue;
};

/**
 * 清除所有任务
 */
export const clearAllBatchQueue = () => {
  for (const queue of queueMap.entries()) {
    queue.destroy();
  }
};
