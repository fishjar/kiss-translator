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
      allkeys.add(e.key);
      curkeys.add(e.key);
      fn([...curkeys], [...allkeys]);
    }
  };

  const handleKeyup = (e) => {
    curkeys.delete(e.key);
    if (curkeys.size === 0) {
      fn([...curkeys], [...allkeys]);
      allkeys.clear();
    }
  };

  target.addEventListener("keydown", handleKeydown);
  target.addEventListener("keyup", handleKeyup);
  return () => {
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
