import { isSameSet } from "./utils";

/**
 * 键盘快捷键状态监听器。
 * 跟踪当前页面上按下并保持的所有物理按键，支持高精度组合键状态监听。
 * @param {(pressedKeys: Set<string>, event: KeyboardEvent) => void} onKeyDown - 任意物理键按下（非重复）时的回调
 * @param {(pressedKeys: Set<string>, event: KeyboardEvent) => void} onKeyUp - 任意物理键松开时的回调
 * @param {EventTarget} target - 事件监听的目标 DOM 节点，默认为 window
 * @returns {() => void} - 用于注销事件监听和清空内存状态的清理函数
 */
export const shortcutListener = (
  onKeyDown = () => {},
  onKeyUp = () => {},
  target = window
) => {
  const pressedKeys = new Set(); // 用于缓存当前所有正被按下的按键 (e.code)

  const handleKeyDown = (e) => {
    // 忽略没有物理按键 code 的异常事件
    if (!e.code) {
      return;
    }

    // 屏蔽操作系统级别的 keydown 自动连续重复触发机制
    if (pressedKeys.has(e.code)) return;
    pressedKeys.add(e.code);
    onKeyDown(new Set(pressedKeys), e);
  };

  const handleKeyUp = (e) => {
    if (!e.code) {
      return;
    }

    // REVIEW: 必须在将 key 从 pressedKeys 移除前先触发 onKeyUp，
    // 以便在回调执行时，pressedKeys 内部依然能保持松开瞬间的完整多键组合状态。
    onKeyUp(new Set(pressedKeys), e);
    pressedKeys.delete(e.code);
  };

  // REVIEW: 极具鲁棒性的设计。当窗口失焦时，浏览器可能无法捕获到后续的 keyup 事件，
  // 导致某些按键状态被永久卡死在 pressedKeys 中。通过监听 blur 及时清除可完美规避该 Bug。
  const handleBlur = () => {
    pressedKeys.clear();
  };

  // 使用事件捕获机制 (true) 确保能优先拦截快捷键，而不受页面表单、动态组件阻止冒泡的影响
  target.addEventListener("keydown", handleKeyDown, true);
  target.addEventListener("keyup", handleKeyUp, true);
  window.addEventListener("blur", handleBlur);

  return () => {
    target.removeEventListener("keydown", handleKeyDown, true);
    target.removeEventListener("keyup", handleKeyUp, true);
    window.removeEventListener("blur", handleBlur);
    pressedKeys.clear();
  };
};

/**
 * 注册特定的组合物理快捷键。
 * @param {string[]} targetKeys - 目标快捷键名称数组 (e.g. ['ControlLeft', 'KeyC'])
 * @param {() => void} fn - 快捷键匹配触发成功后的回调函数
 * @param {EventTarget} target - 监听目标，默认为 window
 * @returns {() => void} - 销毁注销函数
 */
export const shortcutRegister = (targetKeys = [], fn, target = window) => {
  if (targetKeys.length === 0) return () => {};

  const targetKeySet = new Set(targetKeys);
  let hasInterference = false; // 抗干扰标志，标识本次按键过程中是否混入了非目标按键

  const onKeyDown = (pressedKeys, event) => {
    // REVIEW: 若按下了任何不属于目标快捷键集合的其它干扰按键，则立刻将干扰状态置为 true，
    // 防止用户乱按一气或输入普通文本时误触发快捷动作。
    if (!targetKeySet.has(event.code)) {
      hasInterference = true;
    }
  };

  const onKeyUp = (pressedKeys, event) => {
    // 只有在按下组合完全一致，且中途没有任何其它按键干扰时才判定成功触发
    if (isSameSet(targetKeySet, pressedKeys) && !hasInterference) {
      fn();
    }
    // 当所有按键陆续松开到只剩最后一个按键时，重置抗干扰标志，准备下一轮按键判定
    if (pressedKeys.size === 1) {
      hasInterference = false;
    }
  };

  return shortcutListener(onKeyDown, onKeyUp, target);
};

/**
 * 高阶包装函数：为目标函数提供连击次数限制与连击超时重置功能。
 * @param {() => void} fn - 被包装的目标回调函数
 * @param {number} step - 需要连续触发的次数 (如双击为 2)
 * @param {number} timeout - 连击间隔的最大超时时间 (毫秒)
 * @returns {() => void} - 具备连击计数拦截能力的新函数
 */
const withStepCounter = (fn, step, timeout) => {
  let count = 0;
  let timer = null;

  return () => {
    // 每次点击都更新超时重置定时器
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      count = 0; // 超时未完成连击则重置计数为 0
    }, timeout);

    count++;
    if (count === step) {
      count = 0;
      clearTimeout(timer);
      fn(); // 达到连续触发阈值，执行真实业务回调
    }
  };
};

/**
 * 注册连击快捷键 (例如双击 Alt/Option 键)。
 * @param {string[]} targetKeys - 目标连击的按键组合数组 (通常为单个控制物理键如 ['AltLeft'])
 * @param {() => void} fn - 成功连击后的回调函数
 * @param {number} step - 连击的次数，默认 2 次
 * @param {number} timeout - 每次连击间许的最大超时，默认 500ms
 * @param {EventTarget} target - 监听目标对象
 * @returns {() => void} - 销毁注销函数
 */
export const stepShortcutRegister = (
  targetKeys = [],
  fn,
  step = 2,
  timeout = 500,
  target = window
) => {
  const steppedFn = withStepCounter(fn, step, timeout);
  return shortcutRegister(targetKeys, steppedFn, target);
};
