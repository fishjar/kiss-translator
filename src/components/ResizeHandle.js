import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Box from "@mui/material/Box";
import DragIndicator from "@mui/icons-material/DragIndicator";
import { isMobile } from "../libs/mobile";
import {
  MIN_RESIZE_HEIGHT,
  KEYBOARD_RESIZE_STEP,
  VIEWPORT_SAFE_GUTTER,
  normalizeResizeHeight,
  resolveResizeMaxHeight,
  toFiniteNumber,
} from "./resizeBounds";

// 再导出保持既有 import 兼容，常量值单一真源
export {
  MIN_RESIZE_HEIGHT,
  MIN_RESIZE_HEIGHT_MEDIUM,
  KEYBOARD_RESIZE_STEP,
  VIEWPORT_SAFE_GUTTER,
} from "./resizeBounds";

// 控件嵌入边框的共享定位常量
export const CONTROL_HEIGHT = 28; // 小 IconButton ≈ 28px
export const CONTROL_CENTER_FROM_RIGHT = 12; // 共享中心轴距离右边缘的距离（px）
export const NOTCH_STRIP_HEIGHT = 4; // 默认 notch 遮罩条高度（遮盖 2px 聚焦边框 + 各 1px anti-aliasing）
export const NOTCH_HORIZONTAL_PAD = 4; // 遮罩条水平方向超出控件两侧的宽度

const START_THRESHOLD = 6; // 6px 启动阈值
const CLIPPING_OVERFLOW = new Set(["hidden", "auto", "scroll", "clip"]);

/**
 * 检测用户系统是否启用了"减少动态效果"偏好设置，
 * 并在偏好变化时自动更新，确保在运行时层面完全禁用非必要动画。
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      const handler = (e) => setReduced(e.matches);
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    } catch {
      return undefined;
    }
  }, []);

  return reduced;
}

/**
 * 自定义纵向缩放手柄（右下角六点手柄，渲染 `DragIndicator` 图标）。
 *
 * 视觉手柄保持小巧，实际命中热区向文本框内部扩展；只调整高度、不调整宽度。
 *
 * 事件模型：
 * - Pointer 主路径：元素级回调（onPointerMove/Up/Cancel/LostPointerCapture）+
 *   setPointerCapture；匹配 lostpointercapture 终止会话（不续拖）；
 * - Pointer capture 失败/缺失降级：同步激活 window 临时监听，move/up/cancel 均按
 *   活动 pointerId 匹配；gotpointercapture 成功后撤除降级监听并置 element 接管；
 * - Touch 路径（已声明的 iOS Safari Userscripts 兼容路径，README.md:89）：
 *   handleTouchStart 按 changedTouches[0] → targetTouches[0] → touches[0]
 *   绑定发起触点，move 全程按 Touch.identifier 跟踪，不受多指顺序干扰；
 * - 模式隔离：同一时刻仅一个活动会话，双向闭合，第二指针/第二手指既不接管
 *   也不提前终止会话。
 *
 * 键盘可达性（W3C Window Splitter 模式，WCAG 2.1.1）：
 * - role="separator" + tabIndex=0 参与 Tab 序；
 * - aria-orientation="horizontal"（底边横向分隔条）；
 * - ArrowDown 增加高度、ArrowUp 减少高度（步进 12px）；
 * - aria-valuemin、aria-valuemax、aria-valuenow：
 *   受控态输出 clamped 值；未受控态输出实测自动高度（ARIA 1.2 focusable
 *   separator 对作者为 MUST；缺失时 user agent 才按规范回退值近似处理，
 *   因此必须显式提供真实值）。
 *   offsetHeight 为 0 或非有限时省略（硬红线，宁缺勿造）；
 * - 增加明确 :focus-visible 焦点环。
 *
 * 集中测量与动态上界：
 * - 单一 useLayoutEffect 订阅 root 与视口变化，计算最近裁剪祖先与 visualViewport
 *   双重候选上界；受控高度超界时一次性重 clamp（记录 lastNormalized 引用防重复提交）；
 * - 视口恢复后不自动复活被截断的旧高度。
 */
export function ResizeHandle({
  visible,
  closing,
  height,
  containerRef,
  onHeightChange,
  title,
  ariaLabel,
  testId,
  notchTestId,
  notchStripHeight = NOTCH_STRIP_HEIGHT,
  prefersReducedMotion = false,
  controlsId,
  minHeight = MIN_RESIZE_HEIGHT,
}) {
  // 活动会话记录：{ mode, pointerId, identifier, startY, startHeight, moved, eventOwner }
  const sessionRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  // 未受控态（height == null）的实测自动高度（像素）：供 aria-valuenow 播报
  // 真实值（ARIA 1.2 focusable separator MUST）。写入点钉死在测量 effect 的
  // applyMeasured 内，resize/RO 回调经 schedule() 汇聚后在同一处重测。
  const [autoHeightPx, setAutoHeightPx] = useState(null);

  // 动态上界（像素）：由集中测量 layoutEffect 维护
  const [maxHeight, setMaxHeight] = useState(null);
  const maxHeightRef = useRef(null);
  maxHeightRef.current = maxHeight;
  const lastNormalizedRef = useRef(null);

  // 当前会话的 window 监听清理函数（pointer fallback 或 touch 二选一：beginSession
  // 保证同一时刻仅一个活动会话，两类清理互斥共存于同一引用）
  const sessionCleanupRef = useRef(null);

  // 最新 props 的 ref 视图，供异步/DOM 回调读取最新值
  const propsRef = useRef({ onHeightChange, height, visible });
  propsRef.current.onHeightChange = onHeightChange;
  propsRef.current.height = height;
  propsRef.current.visible = visible;

  const endSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    if (sessionCleanupRef.current) {
      sessionCleanupRef.current();
    }
    setDragging(false);
  }, []);

  // 挂载期间只装一次 window blur 监听器，失焦时无条件结束拖动会话
  useLayoutEffect(() => {
    const onBlur = () => {
      if (sessionRef.current) {
        endSession();
      }
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
    };
  }, [endSession]);

  // 组件卸载时确保清理全部会话与监听器
  useEffect(() => {
    return () => {
      sessionRef.current = null;
      if (sessionCleanupRef.current) {
        sessionCleanupRef.current();
      }
    };
  }, []);

  // 集中测量与视口订阅：维护动态上界并在视口收缩时一次性重 clamp。
  // 容器 ref 挂载时序：React 提交阶段先执行子组件 layout effect、后挂祖先
  // host 元素的 ref——常显手柄（如 Playground）挂载即 visible=true 且本效应
  // 只跑一次，若此刻容器 ref 尚未就绪，测量订阅会永久失效；故经微任务重试
  // （提交完成后祖先 ref 已挂载）。Selection 的手柄挂载时 visible=false，
  // 靠焦点门控翻转重跑本效应，不经此路径。
  useLayoutEffect(() => {
    if (!visible) return;

    let cancelled = false;
    let cleanup = null;

    const activate = () => {
      if (cancelled) return;
      const root = containerRef.current;
      if (!root) {
        Promise.resolve().then(activate);
        return;
      }

      const measure = () => {
        const rootRect = root.getBoundingClientRect?.() ?? { top: 0, height: 0 };
        const rootTop = toFiniteNumber(rootRect.top, 0);

        // 上界候选 1: 最近裁剪祖先 bottom（相对 root 顶部）。
        // jsdom 的 getBoundingClientRect 一律返回 0 矩形，height/bottom 为 0；
        // 若裁剪祖先的布局未真实生效（0 矩形），跳过该候选，避免把上界压成
        // 负数导致拖动无法增长。
        let ancestorMax = null;
        for (let el = root.parentElement; el; el = el.parentElement) {
          let overflowY = null;
          try {
            overflowY = window.getComputedStyle?.(el)?.overflowY;
          } catch {
            overflowY = null;
          }
          if (overflowY && CLIPPING_OVERFLOW.has(overflowY)) {
            const r = el.getBoundingClientRect?.() ?? { bottom: 0, height: 0 };
            if (
              !Number.isFinite(r.bottom) ||
              (r.bottom === 0 && r.height === 0)
            ) {
              break;
            }
            const candidate = r.bottom - rootTop - VIEWPORT_SAFE_GUTTER;
            ancestorMax = Number.isFinite(candidate) ? candidate : null;
            break;
          }
        }

        // 上界候选 2: 布局视口 bottom（visualViewport 优先，否则 innerHeight）
        const vv = typeof window !== "undefined" ? window.visualViewport : null;
        const viewportBottom =
          vv && Number.isFinite(vv.offsetTop) && Number.isFinite(vv.height)
            ? vv.offsetTop + vv.height
            : toFiniteNumber(window?.innerHeight, null);
        const viewportMax =
          viewportBottom != null
            ? viewportBottom - rootTop - VIEWPORT_SAFE_GUTTER
            : null;

        // 取最小有限候选
        const candidates = [ancestorMax, viewportMax].filter(
          (c) => c != null && Number.isFinite(c)
        );
        let upper;
        if (candidates.length > 0) {
          upper = Math.min(...candidates);
        } else {
          upper = toFiniteNumber(rootRect.height, MIN_RESIZE_HEIGHT);
        }
        return resolveResizeMaxHeight(upper, MIN_RESIZE_HEIGHT, minHeight);
      };

      const applyMeasured = () => {
        const upper = measure();
        setMaxHeight((prev) => (prev === upper ? prev : upper));
        // 受控高度超界时一次性重 clamp（记录 lastNormalized 引用，防 observer 回调重复提交）
        const current = propsRef.current.height;
        if (current != null) {
          const normalized = normalizeResizeHeight(current, upper, upper, minHeight);
          if (
            normalized !== current &&
            lastNormalizedRef.current !== normalized
          ) {
            lastNormalizedRef.current = normalized;
            propsRef.current.onHeightChange(normalized);
          }
          if (current === normalized) {
            lastNormalizedRef.current = null;
          }
        } else {
          // 未受控态：实测 .MuiInputBase-root 自动高度，供 aria-valuenow 播报。
          // 浏览器中若挂载时 offsetHeight 为 0（面板尚未完成布局），真实
          // ResizeObserver 会在布局后回调 schedule() 补测；jsdom 无 RO 且本套件
          // 未 mock，只能靠显式 window resize 触发——两条是不同的覆盖路径，
          // 测试触发不等于生产保障。
          const inputBase = root.querySelector(".MuiInputBase-root");
          const autoHeight = inputBase?.offsetHeight;
          if (Number.isFinite(autoHeight) && autoHeight > 0) {
            setAutoHeightPx((prev) => (prev === autoHeight ? prev : autoHeight));
          }
        }
      };

      // 布局阶段同步执行一次测量
      applyMeasured();

      // ResizeObserver / window resize / visualViewport resize 订阅，经单一可取消
      // 微任务合并：把一帧内的高频回调折叠为一次测量。用微任务（而非
      // requestAnimationFrame）避免与 Jest fake timers 的 native-timer 冲突，
      // cleanup 时通过 cancelled 标志取消未决回调。
      let scheduled = false;
      const schedule = () => {
        if (cancelled || scheduled) return;
        scheduled = true;
        Promise.resolve().then(() => {
          scheduled = false;
          if (!cancelled) {
            applyMeasured();
          }
        });
      };

      let ro = null;
      if (typeof ResizeObserver === "function") {
        ro = new ResizeObserver(schedule);
        ro.observe(root);
        const visibleArea = root.querySelector(
          'textarea:not([aria-hidden="true"])'
        );
        if (visibleArea) {
          ro.observe(visibleArea);
        }
      }

      window.addEventListener("resize", schedule);
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      vv?.addEventListener?.("resize", schedule);

      cleanup = () => {
        cancelled = true;
        ro?.disconnect();
        window.removeEventListener("resize", schedule);
        vv?.removeEventListener?.("resize", schedule);
      };
    };

    activate();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [visible, containerRef, minHeight]);

  const getCurrentMax = () => {
    if (Number.isFinite(maxHeightRef.current)) {
      return maxHeightRef.current;
    }
    const inner = typeof window !== "undefined" ? window.innerHeight : null;
    return Number.isFinite(inner) ? inner : null;
  };

  const applyMove = (clientY, mode) => {
    const session = sessionRef.current;
    if (!session || session.mode !== mode) return;
    const dy = clientY - session.startY;
    if (!session.moved && Math.abs(dy) <= START_THRESHOLD) {
      return;
    }
    session.moved = true;
    const next = normalizeResizeHeight(
      session.startHeight + dy,
      getCurrentMax(),
      session.startHeight,
      minHeight
    );
    if (next !== propsRef.current.height) {
      propsRef.current.onHeightChange(next);
    }
  };

  const beginSession = (clientY, mode, identifier, pointerId) => {
    if (sessionRef.current) {
      return false;
    }
    const inputBase = containerRef.current?.querySelector(".MuiInputBase-root");
    const measuredHeight =
      height ??
      inputBase?.offsetHeight ??
      containerRef.current?.offsetHeight ??
      minHeight;
    sessionRef.current = {
      startY: clientY,
      startHeight: measuredHeight,
      mode,
      moved: false,
      identifier,
      pointerId,
      eventOwner: null,
    };
    setDragging(true);
    return true;
  };

  // 激活 capture 失败时的 window fallback 监听
  const activateWindowPointerFallback = (pointerId) => {
    const session = sessionRef.current;
    if (!session) return;
    session.eventOwner = "window";

    const onWinPointerMove = (e) => {
      const current = sessionRef.current;
      if (current?.mode !== "pointer" || current.eventOwner !== "window")
        return;
      if (e.pointerId !== current.pointerId) return;
      applyMove(e.clientY, "pointer");
    };

    const onWinPointerEnd = (e) => {
      const current = sessionRef.current;
      if (current?.mode !== "pointer" || current.eventOwner !== "window")
        return;
      if (e.pointerId !== current.pointerId) return;
      endSession();
    };

    sessionCleanupRef.current = () => {
      window.removeEventListener("pointermove", onWinPointerMove);
      window.removeEventListener("pointerup", onWinPointerEnd);
      window.removeEventListener("pointercancel", onWinPointerEnd);
      sessionCleanupRef.current = null;
    };

    window.addEventListener("pointermove", onWinPointerMove);
    window.addEventListener("pointerup", onWinPointerEnd);
    window.addEventListener("pointercancel", onWinPointerEnd);
  };

  const handlePointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const pointerId = e.pointerId;
    const created = beginSession(e.clientY, "pointer", undefined, pointerId);
    if (!created) return;

    const el = e.currentTarget;
    let captureSuccess = false;

    if (typeof el?.setPointerCapture === "function") {
      try {
        el.setPointerCapture(pointerId);
        if (typeof el.hasPointerCapture === "function") {
          captureSuccess = Boolean(el.hasPointerCapture(pointerId));
        } else {
          captureSuccess = true;
        }
      } catch {
        captureSuccess = false;
      }
    }

    if (captureSuccess) {
      const session = sessionRef.current;
      if (session) {
        session.eventOwner = "element";
      }
    } else {
      activateWindowPointerFallback(pointerId);
    }
  };

  const handleGotPointerCapture = (e) => {
    const session = sessionRef.current;
    if (!session || session.mode !== "pointer") return;
    if (e.pointerId !== session.pointerId) return;
    // gotpointercapture 成功确认：撤除 window fallback，确认由元素自身处理
    if (sessionCleanupRef.current) {
      sessionCleanupRef.current();
    }
    session.eventOwner = "element";
  };

  const handlePointerMove = (e) => {
    const session = sessionRef.current;
    if (!session || session.mode !== "pointer") return;
    if (session.eventOwner === "window") return;
    if (e.pointerId !== session.pointerId) return;
    applyMove(e.clientY, "pointer");
  };

  const handlePointerEnd = (e) => {
    const session = sessionRef.current;
    if (!session || session.mode !== "pointer") return;
    if (session.eventOwner === "window") return;
    if (e.pointerId !== session.pointerId) return;
    endSession();
  };

  const handleLostPointerCapture = (e) => {
    const session = sessionRef.current;
    if (!session || session.mode !== "pointer") return;
    if (session.eventOwner === "window") return;
    if (e.pointerId !== session.pointerId) return;
    // 元素会话中的匹配 lostpointercapture 终止会话（不续拖）
    endSession();
  };

  const handleTouchStart = (e) => {
    // React 18 根容器委托的 touchstart 为 passive 注册（本仓库
    // node_modules/react-dom/cjs/react-dom.development.js:9165-9174），
    // 合成 preventDefault 在真实浏览器为 no-op 且触发 intervention 告警；
    // 防滚由下方 window 非 passive touchmove 监听（onWinTouchMove）承载。
    e.stopPropagation();
    const native = e.nativeEvent || e;
    const touch =
      native.changedTouches?.[0] ||
      native.targetTouches?.[0] ||
      native.touches?.[0];
    if (!touch) return;

    const created = beginSession(touch.clientY, "touch", touch.identifier);
    if (!created) return;

    const onWinTouchMove = (evt) => {
      const current = sessionRef.current;
      if (current?.mode !== "touch") return;
      const n = evt.nativeEvent || evt;
      const touches = n.touches || n.targetTouches;
      if (!touches) return;
      const t = Array.from(touches).find(
        (item) => item.identifier === current.identifier
      );
      if (t) {
        // 本监听以 { passive: false } 挂载，preventDefault 真实生效：命中
        // 发起触点的拖动必须阻止页面滚动；非发起触点的 touchmove 不
        // preventDefault、不改高度（保留其余手指滚动页面的能力）。
        evt.preventDefault?.();
        applyMove(t.clientY, "touch");
      }
    };

    const onWinTouchEnd = (evt) => {
      const current = sessionRef.current;
      if (current?.mode !== "touch") return;
      const n = evt.nativeEvent || evt;
      const id = current.identifier;
      const includes = (list) =>
        list && Array.from(list).some((item) => item.identifier === id);
      if (includes(n.changedTouches)) {
        endSession();
        return;
      }
      const stillActive = includes(n.touches) || includes(n.targetTouches);
      if (!stillActive) {
        endSession();
      }
    };

    sessionCleanupRef.current = () => {
      window.removeEventListener("touchmove", onWinTouchMove);
      window.removeEventListener("touchend", onWinTouchEnd);
      window.removeEventListener("touchcancel", onWinTouchEnd);
      sessionCleanupRef.current = null;
    };

    window.addEventListener("touchmove", onWinTouchMove, { passive: false });
    window.addEventListener("touchend", onWinTouchEnd);
    window.addEventListener("touchcancel", onWinTouchEnd);
  };

  const handleMouseDown = (e) => {
    // 阻止兼容 mousedown 的焦点转移，避免点击手柄导致所属文本框失焦
    e.preventDefault();
  };

  // 键盘可达性（W3C Splitter）：ArrowDown 增高、ArrowUp 减高（步进 12px）
  const handleKeyDown = (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
      return;
    }
    e.preventDefault();
    const inputBase = containerRef.current?.querySelector(".MuiInputBase-root");
    // baseHeight 末位兜底为防御性死路径：仅 containerRef.current === null 时可触达，
    // 而手柄 DOM 嵌于 ref 容器内，容器脱挂后键盘事件不可投递；jsdom offsetHeight=0
    // 会被 ?? 保留（走 normalize(±12, …, minHeight) 钳制），与 beginSession 的
    // ?? minHeight 兜底无可观察差异。min 下界已经由本函数 normalize 第 4 参真实穿入。
    const baseHeight =
      height ??
      inputBase?.offsetHeight ??
      containerRef.current?.offsetHeight ??
      MIN_RESIZE_HEIGHT;
    const delta =
      e.key === "ArrowDown" ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
    const next = normalizeResizeHeight(
      baseHeight + delta,
      getCurrentMax(),
      baseHeight,
      minHeight
    );
    if (next !== propsRef.current.height) {
      propsRef.current.onHeightChange(next);
    }
  };

  // 渲染门控：无活动会话时跟随 visible 显隐；拖动中即使失焦也保持挂载
  if (!visible && !sessionRef.current) {
    return null;
  }

  const hitSize = isMobile ? 28 : 16;
  const resolvedMax =
    maxHeight != null
      ? maxHeight
      : Math.max(
          minHeight,
          toFiniteNumber(window?.innerHeight, minHeight)
        );

  return (
    <>
      <Box
        data-testid={testId}
        role="separator"
        aria-orientation="horizontal"
        aria-label={ariaLabel}
        title={title}
        tabIndex={0}
        aria-controls={controlsId}
        aria-valuemin={minHeight}
        aria-valuemax={resolvedMax}
        aria-valuenow={
          height != null
            ? normalizeResizeHeight(
                height,
                resolvedMax,
                MIN_RESIZE_HEIGHT,
                minHeight
              )
            : Number.isFinite(autoHeightPx) && autoHeightPx > 0
              ? autoHeightPx
              : undefined
        }
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onGotPointerCapture={handleGotPointerCapture}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handleLostPointerCapture}
        onTouchStart={handleTouchStart}
        onMouseDown={handleMouseDown}
        style={{
          position: "absolute",
          right: CONTROL_CENTER_FROM_RIGHT - hitSize / 2,
          bottom: -Math.round(hitSize / 2),
          width: hitSize,
          height: hitSize,
          pointerEvents: closing && !dragging ? "none" : "auto",
          cursor: "row-resize",
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "none",
          userSelect: "none",
          zIndex: 2,
          color: "action.active",
          opacity: closing ? 0 : 1,
          visibility: closing ? "hidden" : "visible",
          transition: prefersReducedMotion
            ? "none"
            : "color 120ms ease, opacity 120ms ease, visibility 120ms ease",
          "&:hover": { color: "primary.main" },
          "&:focus-visible": {
            outline: (theme) => `2px solid ${theme.palette.primary.main}`,
            outlineOffset: "2px",
            borderRadius: "2px",
          },
          ...(dragging && { color: "primary.main" }),
        }}
      >
        <DragIndicator
          fontSize="small"
          sx={{
            opacity: 0.6,
            ...(!prefersReducedMotion && {
              transition: "opacity 120ms ease",
            }),
            "&:hover": { opacity: 1 },
            ...(dragging && { opacity: 1 }),
          }}
        />
      </Box>
      <Box
        data-testid={notchTestId}
        style={{
          position: "absolute",
          right:
            CONTROL_CENTER_FROM_RIGHT -
            CONTROL_HEIGHT / 2 -
            NOTCH_HORIZONTAL_PAD,
          bottom: -Math.round(notchStripHeight / 2),
          width: CONTROL_HEIGHT + NOTCH_HORIZONTAL_PAD * 2,
          height: notchStripHeight,
        }}
        sx={{
          backgroundColor: "background.paper",
          zIndex: 1,
          opacity: closing ? 0 : 1,
          visibility: closing ? "hidden" : "visible",
          transition: prefersReducedMotion
            ? "none"
            : "opacity 120ms ease, visibility 120ms ease",
        }}
      />
    </>
  );
}
