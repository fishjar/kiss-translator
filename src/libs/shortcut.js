import { isSameSet } from "./utils";

/**
 * 键盘快捷键监听
 * @param {*} fn
 * @param {*} target
 * @returns
 */
export const shortcutListener = (fn, target = document) => {
  // todo: let done = false;
  const allkeys = new Set();
  const curkeys = new Set();

  const handleKeydown = (e) => {
    if (e.code) {
      allkeys.add(e.key);
      curkeys.add(e.key);
    }
  };

  const handleKeyup = (e) => {
    curkeys.delete(e.key);
    if (curkeys.size === 0) {
      fn([...allkeys]);
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
export const shortcutRegister = (targetKeys, fn, target = document) => {
  return shortcutListener((keys) => {
    if (isSameSet(new Set(targetKeys), new Set(keys))) {
      fn();
    }
  }, target);
};
