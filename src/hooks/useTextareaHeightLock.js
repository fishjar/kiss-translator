import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSetting } from "./Setting";
import {
  INPUT_BASE_ROOT_SELECTOR,
  LOCKED_MIN_TARGET_HEIGHT_PX,
  VIEWPORT_GUTTER_PX,
  clampGripMemoryHeight,
  resolveGripStyle,
} from "../components/TextareaResizeGrip";

// 全局 textarea 拉伸手柄样式读取：缺省回落 "concentric-smooth"；存量值先经
// resolveGripStyle 归一，已下线的样式 key 一律回落默认，避免设置页下拉匹配
// 不到选项而显示空值。5 个接入视图与设置页预览共用此入口。
export function useTextareaGripStyle() {
  const { setting } = useSetting();
  return resolveGripStyle(setting?.textareaGripStyle);
}

// 意见 A：grip 样式切到 hidden 的渲染轮自动释放对应高度锁。hidden 变体
// 下手柄组件早退不渲染、textarea 回退原生 resize，若会话记忆残留，锁定
// 类与内联高度仍会把字段钉死且无解锁入口。gripStyle 先经 resolveGripStyle
// 归一再判定（与 useTextareaGripStyle / 手柄组件同口径，未知 key 回落
// 默认样式、绝不误判为 hidden）；releaseHeight 在无记忆时为空操作，重复
// 调用安全。layout effect 保证释放与样式切换同一次提交落定，不闪锁定帧。
export function useReleaseOnGripHidden(gripStyle, releaseHeight) {
  useLayoutEffect(() => {
    if (resolveGripStyle(gripStyle) === "hidden") {
      releaseHeight();
    }
  }, [gripStyle, releaseHeight]);
}

// 会话内高度记忆：按 lockKey 保存拖拽/键盘调整后的像素高度。
// 只存在于当前页面会话（不写 localStorage/sessionStorage），组件重挂载后自动恢复。
const sessionHeightMap = new Map();

// 测试专用：清空会话高度记忆（模块级 Map 会跨用例存活，测试文件用它
// 隔离用例；生产代码不引用）。
export function __resetSessionHeightMapForTests() {
  sessionHeightMap.clear();
}

// 测试专用：只读暴露会话高度记忆，供断言「按 key 隔离写入口径」（如多
// 实例键改写互不串扰）；生产代码不引用。
export function __getSessionHeightMapForTests() {
  return sessionHeightMap;
}

// 挂载后实测的视口钳制上限：基线元素（textarea 所属 MuiInputBase root）
// getBoundingClientRect().top 与视口安全留白，与手柄 clampHeight 的视口
// 分支同口径；基线元素不可测或读数非有限时返回 null（调用方跳过重钳）。
// 滚动祖先各层上限不在此复现：本效应只在锁定事务后复核一次、不监听祖先
// 滚动，若在此取滚动祖先 cap，祖先滚动后锁定高度不会随之复核，反而制造
// 「看似全量、实则过期」的假口径；滚动祖先钳制仍由手柄交互路径承担。
function measureViewportCapPx(textareaEl) {
  if (!textareaEl || typeof textareaEl.closest !== "function") return null;
  const baselineEl = textareaEl.closest(INPUT_BASE_ROOT_SELECTOR);
  if (!baselineEl || typeof baselineEl.getBoundingClientRect !== "function") {
    return null;
  }
  const { top } = baselineEl.getBoundingClientRect();
  if (!Number.isFinite(top) || !Number.isFinite(window.innerHeight)) {
    return null;
  }
  return Math.floor(window.innerHeight - top - VIEWPORT_GUTTER_PX);
}

// 未锁定时的空 props：模块级常量保证引用恒等，宿主每次提交都不会因它
// 产生新的 style 对象。
const NO_ROOT_PROPS = {};

/**
 * textarea 高度锁：锁定态完全由 React 渲染承载。
 *
 * 锁定标记（kt-height-locked 类）与锁定高度（root 内联 height）经返回的
 * rootProps 由调用方展开进 TextField 的 InputProps，因此它们是 InputBase
 * root 的 React 受管属性。这解决了一类无法自愈的坏状态：InputBase 内置
 * focused state，聚焦/失焦时只重渲染 InputBase 自身子树，其 root
 * className 由 clsx(classes.root, rootProps.className, className, …)
 * 整串重写，命令式 classList.add 写入的类会被这次属性重写抹掉；而父视图
 * 不参与该次提交，命令式补写无从触发，类与内联高度就此失同步（类没了、
 * 高度还在）→ m3.js 的锁定态 CSS 全部失效 → textarea 退回 autosize 内联
 * 高并溢出 overflow:visible 的外框。改由 React 承载后，类与高度是同一次
 * 提交的受管属性，任何重渲染都只能重放出同一份锁定态。
 *
 * 锁定来源只有确定的拖拽/键盘会话，无需任何推断式判别机制；releaseHeight
 * 提供显式解锁（内容清空等场景调用：清除会话记忆并还原 root）。
 *
 * @param {string} lockKey 会话内记忆键（同一 key 跨重挂载共享高度）。
 * @param {{current: HTMLTextAreaElement|null}} [textareaRef] 调用方已有的
 *   textarea ref；缺省时使用内部 ref。
 * @returns {{
 *   textareaRef: {current: HTMLTextAreaElement|null},
 *   lockedHeight: number|null,
 *   applyHeight: (height: number) => void,
 *   releaseHeight: () => void,
 *   rootProps: {className?: string, style?: {height: string}},
 * }}
 */
export default function useTextareaHeightLock(lockKey, textareaRef) {
  const internalRef = useRef(null);
  const targetRef = textareaRef || internalRef;
  const [lockedHeight, setLockedHeight] = useState(() => {
    const remembered = sessionHeightMap.get(lockKey);
    // 恢复口径按当前视口双向钳制：会话记忆可能来自更高视口，直接落
    // 内联高度会溢出实际元素（仅 ARIA 播报被截断不算修复）。
    return remembered == null ? null : clampGripMemoryHeight(remembered);
  });

  // lockKey 变更时从会话记忆重读：惰性初始化只在首挂载执行一次。重复写入
  // 同值由 React 的 Object.is 判等自然豁免。重读与惰性初始化同口径：按
  // 当前视口双向钳制后再落锁定态。
  useLayoutEffect(() => {
    const remembered = sessionHeightMap.get(lockKey);
    setLockedHeight(
      remembered == null ? null : clampGripMemoryHeight(remembered)
    );
  }, [lockKey]);

  // 挂载/锁定事务后的实测重钳：保守视口口径（上界用裸 innerHeight）可能
  // 仍高于「视口 − 基线 top − 留白」的真实上限，实测基线位置后把锁定高
  // 度收敛进真实上限。实测经 rAF 承载并带清理：同一提交内多次锁定值变更
  // 只做一次 getBoundingClientRect 同步布局读，绘制前完成重钳、无闪烁窗
  // 口。重钳输入源取当前 lockKey 的会话记忆而非 lockedHeight state——
  // lockKey 切换的同一次提交里 state 仍持旧 key 的闭包值，以它参与重钳
  // 会把旧高度写进本应未锁定的新 key；无有限记忆（未锁定/新 key）即跳
  // 过。cap 不可测或低于最小目标高度（基线整体在视口下缘之外）都不是可
  // 用上限：跳过重钳保留用户锁定高度，强行钳到最小高度会把首屏之下字段
  // 的锁定高度永久压扁且无自愈路径。lockedHeight 保留在依赖数组：
  // applyHeight 后记忆已同步更新，effect 复核语义不变；重钳结果与现值
  // 相同时被 Object.is 判等豁免，无渲染回路。拖拽安全：本效应只经
  // setLockedHeight 更新 root 受管属性（内联高度与类），不销毁/重建 DOM
  // 节点，pointer capture 与拖拽手势不受影响；拖拽中的 applyHeight 本就
  // 经手柄 clampHeight 取全量口径上限，实测重钳与其结果一致，不会回拉
  // 拖拽中的目标高度。会话记忆保持用户意图原值，不随重钳改写——恢复
  // 路径本就按当时视口重新钳制。
  useLayoutEffect(() => {
    const remembered = sessionHeightMap.get(lockKey);
    if (!Number.isFinite(remembered)) return;
    const raf = requestAnimationFrame(() => {
      const cap = measureViewportCapPx(targetRef.current);
      if (cap == null || cap < LOCKED_MIN_TARGET_HEIGHT_PX) return;
      const clamped = clampGripMemoryHeight(remembered, cap);
      if (clamped !== lockedHeight) setLockedHeight(clamped);
    });
    return () => cancelAnimationFrame(raf);
  }, [lockKey, lockedHeight, targetRef]);

  // 视口变化复核：锁定高度按当前记忆重钳（与挂载/事务后重钳同口径、同
  // 上述无效 cap 护栏）。rAF 合并同帧多次 resize（leading-edge 去重，
  // trailing 实测）；无有限记忆（未锁定/新 key）早退，无幽灵 setState；
  // setLockedHeight 同值豁免由 React Object.is 保证，无回路。滚动祖先
  // 层上限不在此复核——沿用 measureViewportCapPx 上方既有论证，仍由手
  // 柄交互路径承担。
  useEffect(() => {
    let raf = null;
    const onResize = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const remembered = sessionHeightMap.get(lockKey);
        if (!Number.isFinite(remembered)) return;
        const cap = measureViewportCapPx(targetRef.current);
        if (cap == null || cap < LOCKED_MIN_TARGET_HEIGHT_PX) return;
        setLockedHeight(clampGripMemoryHeight(remembered, cap));
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [lockKey, targetRef]);

  const applyHeight = useCallback(
    (height) => {
      // 公开写入口同样按视口口径双向钳制：消费方可能绕过手柄的
      // clampHeight（全量口径）直接调用本 API 程序化设高，边界责任由
      // hook 自持。非有限数（NaN/Infinity）不是可用高度：静默拒绝为
      // no-op，不写会话记忆也不落锁定态——把 no-op 失败收敛成最小高度
      // 会制造意外的锁定态；亚最小值仍收敛进规范区间。
      if (!Number.isFinite(height)) return;
      const next = clampGripMemoryHeight(height);
      sessionHeightMap.set(lockKey, next);
      setLockedHeight(next);
    },
    [lockKey]
  );

  // 解锁：清除会话记忆并还原锁定态（rootProps 回落空对象，类与内联高度
  // 由 React 一并撤销）。
  const releaseHeight = useCallback(() => {
    sessionHeightMap.delete(lockKey);
    setLockedHeight(null);
  }, [lockKey]);

  const rootProps = useMemo(() => {
    if (lockedHeight == null) return NO_ROOT_PROPS;
    return {
      className: "kt-height-locked",
      style: { height: `${lockedHeight}px` },
    };
  }, [lockedHeight]);

  return {
    textareaRef: targetRef,
    lockedHeight,
    applyHeight,
    releaseHeight,
    rootProps,
  };
}
