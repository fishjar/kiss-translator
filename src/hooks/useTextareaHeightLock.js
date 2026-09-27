import { useCallback, useLayoutEffect, useRef, useState } from "react";

// 会话内高度记忆：按 lockKey 保存拖拽/键盘调整后的像素高度。
// 只存在于当前页面会话（不写 localStorage/sessionStorage），组件重挂载后自动恢复。
const sessionHeightMap = new Map();

// 测试专用：清空会话高度记忆（模块级 Map 会跨用例存活，测试文件用它
// 隔离用例；生产代码不引用）。
export function __resetSessionHeightMapForTests() {
  sessionHeightMap.clear();
}

// 锁定高度承载在 InputBase root 上：TextareaAutosize 经 React style prop
// 持续管理 textarea 的内联高度，写 textarea 必然与提交顺序竞态；root 的
// 内联样式不经 React 管理，配合 m3.js 的 .kt-height-locked 锁定态规则
// （!important 压制 textarea 的行数写高），锁定与提交顺序彻底解耦。
function getRootEl(textarea) {
  return textarea ? textarea.closest(".MuiInputBase-root") : null;
}

function applyLockToRoot(rootEl, height) {
  rootEl.style.height = `${height}px`;
  rootEl.classList.add("kt-height-locked");
}

/**
 * textarea 高度锁：与 TextareaAutosize 协作保持用户拖出的高度。
 *
 * 锁定高度与锁定标记（kt-height-locked 类）写在 InputBase root 上，由
 * m3.js 的锁定态 CSS 压制 autosize 对 textarea 的行数写高，与渲染提交
 * 顺序无关、零竞态。锁定来源只有确定的拖拽/键盘会话，无需任何推断式
 * 判别机制；不提供解锁 API（当前无解锁 UI）。
 *
 * @param {string} lockKey 会话内记忆键（同一 key 跨重挂载共享高度）。
 * @param {{current: HTMLTextAreaElement|null}} [textareaRef] 调用方已有的
 *   textarea ref；缺省时使用内部 ref。
 * @returns {{
 *   textareaRef: {current: HTMLTextAreaElement|null},
 *   lockedHeight: number|null,
 *   applyHeight: (height: number) => void,
 * }}
 */
export default function useTextareaHeightLock(lockKey, textareaRef) {
  const internalRef = useRef(null);
  const targetRef = textareaRef || internalRef;
  const [lockedHeight, setLockedHeight] = useState(
    () => sessionHeightMap.get(lockKey) ?? null
  );

  // 无依赖数组：宿主每次提交后声明性再断言一次（首次锁定与重挂载恢复
  // 都经此生效）。root 的内联高度不参与 React 的 style diff，重复写
  // 同一值幂等。
  useLayoutEffect(() => {
    if (lockedHeight == null) return;
    const rootEl = getRootEl(targetRef.current);
    if (rootEl) applyLockToRoot(rootEl, lockedHeight);
  });

  const applyHeight = useCallback(
    (height) => {
      const next = Math.round(height);
      if (!Number.isFinite(next) || next <= 0) return;
      sessionHeightMap.set(lockKey, next);
      setLockedHeight(next);
      const rootEl = getRootEl(targetRef.current);
      if (rootEl) applyLockToRoot(rootEl, next);
    },
    [lockKey, targetRef]
  );

  return { textareaRef: targetRef, lockedHeight, applyHeight };
}
