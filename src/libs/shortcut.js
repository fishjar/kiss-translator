import { isSameSet } from "./utils";

/**
 * 键盘快捷键监听
 * @param {*} fn
 * @param {*} target
 * @param {*} timeout
 * @returns
 */
export const shortcutListener = (fn, target = document, timeout = 3000) => {
  const allkeys = new Set();
  const curkeys = new Set();
  let timer = null;

  const handleKeydown = (e) => {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      allkeys.clear();
      curkeys.clear();
      clearTimeout(timer);
      timer = null;
    }, timeout);

    if (e.code) {
      allkeys.add(e.code);
      curkeys.add(e.code);
      fn([...curkeys], [...allkeys]);
    }
  };

  const handleKeyup = (e) => {
    curkeys.delete(e.code);
    if (curkeys.size === 0) {
      fn([...curkeys], [...allkeys]);
      allkeys.clear();
    }
  };

  target.addEventListener("keydown", handleKeydown, true);
  target.addEventListener("keyup", handleKeyup, true);
  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    target.removeEventListener("keydown", handleKeydown);
    target.removeEventListener("keyup", handleKeyup);
  };
};

/**
 * 注册键盘快捷键
 * @param {*} targetKeys
 * @param {*} fn
 * @param {*} target
 * @returns
 */
export const shortcutRegister = (targetKeys = [], fn, target = document) => {
  return shortcutListener((curkeys) => {
    if (
      targetKeys.length > 0 &&
      isSameSet(new Set(targetKeys), new Set(curkeys))
    ) {
      fn();
    }
  }, target);
};

/**
 * 注册连续快捷键
 * @param {*} targetKeys
 * @param {*} fn
 * @param {*} step
 * @param {*} timeout
 * @param {*} target
 * @returns
 */
export const stepShortcutRegister = (
  targetKeys = [],
  fn,
  step = 3,
  timeout = 500,
  target = document
) => {
  let count = 0;
  let pre = Date.now();
  let timer;
  return shortcutListener((curkeys, allkeys) => {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      clearTimeout(timer);
      count = 0;
    }, timeout);

    if (targetKeys.length > 0 && curkeys.length === 0) {
      const now = Date.now();
      if (
        (count === 0 || now - pre < timeout) &&
        isSameSet(new Set(targetKeys), new Set(allkeys))
      ) {
        count++;
        if (count === step) {
          count = 0;
          fn();
        }
      } else {
        count = 0;
      }
      pre = now;
    }
  }, target);
};
