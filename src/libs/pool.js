import {
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT,
  OPT_TRANS_MICROSOFT,
} from "../config";
import { apiTranslate } from "../apis";
import { msAuth } from "./auth";

const _taskPool = (fn, preFn, _interval = 100, _limit = 100) => {
  const pool = [];
  const maxRetry = 2; // 最大重试次数
  let maxCount = _limit; // 最大数量
  let curCount = 0; // 当前数量
  let interval = _interval; // 间隔时间
  let timer;

  const handleTask = async (item, preArgs) => {
    curCount++;
    const { args, resolve, reject, retry } = item;
    try {
      const res = await fn(args, preArgs);
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

  (async function run() {
    // console.log("timer", timer);
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

    timer && clearTimeout(timer);
    timer = setTimeout(run, interval);
  })();

  return {
    push: async (args) => {
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
    },
  };
};

export const transPool = _taskPool(
  apiTranslate,
  async ({ translator }) => {
    if (translator === OPT_TRANS_MICROSOFT) {
      const [token] = await msAuth();
      return { token };
    }
    return {};
  },
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT
);
