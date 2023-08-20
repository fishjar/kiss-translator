/**
 * 任务池
 * @param {*} fn
 * @param {*} preFn
 * @param {*} _interval
 * @param {*} _limit
 * @returns
 */
export const taskPool = (fn, preFn, _interval = 100, _limit = 100) => {
  const pool = [];
  const maxRetry = 2; // 最大重试次数
  let maxCount = _limit; // 最大数量
  let curCount = 0; // 当前数量
  let interval = _interval; // 间隔时间
  let timer = null;

  const handleTask = async (item, preArgs) => {
    curCount++;
    const { args, resolve, reject, retry } = item;
    try {
      const res = await fn({ ...args, ...preArgs });
      resolve(res);
    } catch (err) {
      if (retry < maxRetry) {
        pool.push({ args, resolve, reject, retry: retry + 1 });
      } else {
        reject(err);
      }
    } finally {
      curCount--;
    }
  };

  const run = async () => {
    // console.log("timer", timer);
    timer && clearTimeout(timer);
    timer = setTimeout(run, interval);

    if (curCount < maxCount) {
      const item = pool.shift();
      if (item) {
        try {
          const preArgs = await preFn(item.args);
          handleTask(item, preArgs);
        } catch (err) {
          console.log("[preFn]", err);
          pool.push(item);
        }
      }
    }
  };

  return {
    push: async (args) => {
      if (!timer) {
        run();
      }
      return new Promise((resolve, reject) => {
        pool.push({ args, resolve, reject, retry: 0 });
      });
    },
    update: (_interval = 100, _limit = 100) => {
      if (_interval >= 0 && _interval <= 5000 && _interval !== interval) {
        interval = _interval;
      }
      if (_limit >= 1 && _limit <= 100 && _limit !== maxCount) {
        maxCount = _limit;
      }
    },
    clear: () => {
      pool.length = 0;
      curCount = 0;
      timer && clearTimeout(timer);
      timer = null;
    },
  };
};
