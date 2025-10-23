import { isSameSet } from "./utils";

/**
 * 键盘快捷键监听器
 * @param {(pressedKeys: Set<string>, event: KeyboardEvent) => void} onKeyDown - Keydown 回调
 * @param {(pressedKeys: Set<string>, event: KeyboardEvent) => void} onKeyUp - Keyup 回调
 * @param {EventTarget} target - 监听的目标元素
 * @returns {() => void} - 用于注销监听的函数
 */
export const shortcutListener = (
  onKeyDown = () => {},
  onKeyUp = () => {},
  target = document
) => {
  const pressedKeys = new Set();

  const handleKeyDown = (e) => {
    if (!e.code) {
      return;
    }

    if (pressedKeys.has(e.code)) return;
    pressedKeys.add(e.code);
    onKeyDown(new Set(pressedKeys), e);
  };

  const handleKeyUp = (e) => {
    if (!e.code) {
      return;
    }

    // onKeyUp 应该在 key 从集合中移除前触发，以便判断组合键
    onKeyUp(new Set(pressedKeys), e);
    pressedKeys.delete(e.code);
  };

  const handleBlur = () => {
    pressedKeys.clear();
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);

  return () => {
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("blur", handleBlur);
    pressedKeys.clear();
  };
};

/**
 * 注册键盘快捷键
 * @param {string[]} targetKeys - 目标快捷键数组
 * @param {() => void} fn - 匹配成功后执行的回调
 * @param {EventTarget} target - 监听目标
 * @returns {() => void} - 注销函数
 */
export const shortcutRegister = (targetKeys = [], fn, target = document) => {
  if (targetKeys.length === 0) return () => {};

  const targetKeySet = new Set(targetKeys);
  const onKeyDown = (pressedKeys, event) => {
    if (isSameSet(targetKeySet, pressedKeys)) {
      // event.preventDefault(); // 阻止浏览器的默认行为
      // event.stopPropagation(); // 阻止事件继续（向父元素）冒泡
      fn();
    }
  };
  const onKeyUp = () => {};

  return shortcutListener(onKeyDown, onKeyUp, target);
};

/**
 * 高阶函数：为目标函数增加计次和超时重置功能
 * @param {() => void} fn - 需要被包装的函数
 * @param {number} step - 需要触发的次数
 * @param {number} timeout - 超时毫秒数
 * @returns {() => void} - 包装后的新函数
 */
const withStepCounter = (fn, step, timeout) => {
  let count = 0;
  let timer = null;

  return () => {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      count = 0;
    }, timeout);

    count++;
    if (count === step) {
      count = 0;
      clearTimeout(timer);
      fn();
    }
  };
};

/**
 * 注册连续快捷键
 * @param {string[]} targetKeys - 目标快捷键数组
 * @param {() => void} fn - 成功回调
 * @param {number} step - 连续触发次数
 * @param {number} timeout - 每次触发的间隔超时
 * @param {EventTarget} target - 监听目标
 * @returns {() => void} - 注销函数
 */
export const stepShortcutRegister = (
  targetKeys = [],
  fn,
  step = 2,
  timeout = 500,
  target = document
) => {
  const steppedFn = withStepCounter(fn, step, timeout);
  return shortcutRegister(targetKeys, steppedFn, target);
};
