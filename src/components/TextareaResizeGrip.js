import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";

// 命中热区 24×24，大于 18×18 视觉弧线：按哪里能触发由代码定义，跨浏览器一致。
const HOT_ZONE_PX = 24;
// 拖动/键盘可调的最小目标高度（单行 23px + small 根节点纵向 padding 17px）。
// 导出供未锁定回落（fallbackHeight）与 aria-valuemin 播报下界共用。
export const MIN_TARGET_HEIGHT_PX = 40;
// 锁定/记忆口径的最小目标高度：在 40 的基础上叠加锁定态 textarea 的
// padding-bottom 24px（= HOT_ZONE_PX 热区内边距）。锁定 root 高度被钳到
// 该下限时，root 内容盒 = 64 − 17 = 47px，扣除 textarea 底部内边距 24px
// 后内容高度恰为单行 23px，保证锁定下限处文字不被手柄热区遮挡。
// 仅用于锁定/记忆钳制路径（clampGripMemoryHeight / clampHeight / 拖拽托底）；
// 未锁定口径继续使用 MIN_TARGET_HEIGHT_PX。
export const LOCKED_MIN_TARGET_HEIGHT_PX =
  MIN_TARGET_HEIGHT_PX + HOT_ZONE_PX;
// 方向键单次步进（Shift ×4）。
const KEYBOARD_STEP_PX = 12;
// 高度上界相对视口底部的安全留白。
// useTextareaHeightLock 的挂载后实测重钳效应复用同一留白口径。
export const VIEWPORT_GUTTER_PX = 8;
// 测量基准选择器单源：useTextareaHeightLock 的实测重钳与手柄 clampHeight
// 必须命中同一基线元素（InputBase root），避免与 textarea content-box 错位。
export const INPUT_BASE_ROOT_SELECTOR = ".MuiInputBase-root";

// 会话记忆高度（useTextareaHeightLock 的恢复与公开写入口）的双向钳制：
// 上界取当前视口高度，下界取最小目标高度，非有限数回落最小高度（供恢复
// 路径兜底；公开写入口 applyHeight 先行静默拒绝非有限数）。本 helper 是
// 无 DOM 的保守视口口径；挂载后由 hook 的布局效应按实测基线 top 重钳
// （视口 − 基线 top − 留白），滚动祖先各层上限仍只由手柄拖拽/键盘路径
// （clampHeight）承担。
export function clampGripMemoryHeight(
  height,
  viewportHeight = window.innerHeight
) {
  const rounded = Math.round(height);
  if (!Number.isFinite(rounded)) return LOCKED_MIN_TARGET_HEIGHT_PX;
  const max = Number.isFinite(viewportHeight)
    ? Math.max(LOCKED_MIN_TARGET_HEIGHT_PX, Math.round(viewportHeight))
    : LOCKED_MIN_TARGET_HEIGHT_PX;
  return Math.max(LOCKED_MIN_TARGET_HEIGHT_PX, Math.min(rounded, max));
}

// 样式注册表：key → { fill, content }（18×18 viewBox，currentColor 着色）。
// root fill 随资产族而变：描边族 fill="none"，填充族（点阵/波点）
// root fill="currentColor" 供 circle/path 继承；混合族（星芒/除号/百分号/伴
// 星）root fill="none" 且各填充圆自带 fill="currentColor"。图形数据一律按
// 计划「SVG 资产索引表」从 .kilo/输入框拉伸手柄样式全集.md 逐条照抄，严禁重绘。
const GRIP_SVGS = {
  "concentric-smooth": {
    fill: "none",
    content: (
      <>
        <path
          d="M15 5V9C15 12.3137 12.3137 15 9 15H5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 6.5V9C12 10.6569 10.6569 12 9 12H6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </>
    ),
  },
  "concentric-triple": {
    fill: "none",
    content: (
      <>
        <path
          d="M15 6V9C15 12.3137 12.3137 15 9 15H6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12 7V8.5C12 10.433 10.433 12 8.5 12H7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M9 7.5V8C9 8.5523 8.5523 9 8 9H7.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  "corner-pill": {
    fill: "none",
    content: (
      <path
        d="M14 6V9.5C14 11.985 11.985 14 9.5 14H6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    ),
  },
  "dotted-concentric": {
    fill: "currentColor",
    content: (
      <>
        <circle cx="15" cy="5.8" r="1.15" />
        <circle cx="14.6" cy="9.2" r="1.15" />
        <circle cx="13.2" cy="13.2" r="1.15" />
        <circle cx="9.2" cy="14.6" r="1.15" />
        <circle cx="5.8" cy="15" r="1.15" />
        <circle cx="12" cy="7.2" r="1.15" />
        <circle cx="10.8" cy="10.8" r="1.15" />
        <circle cx="7.2" cy="12" r="1.15" />
      </>
    ),
  },
  "dotted-single": {
    fill: "currentColor",
    content: (
      <>
        <circle cx="15" cy="5.5" r="1.1" />
        <circle cx="15" cy="8.5" r="1.1" />
        <circle cx="14.2" cy="11.2" r="1.1" />
        <circle cx="12.8" cy="12.8" r="1.1" />
        <circle cx="11.2" cy="14.2" r="1.1" />
        <circle cx="8.5" cy="15" r="1.1" />
        <circle cx="5.5" cy="15" r="1.1" />
      </>
    ),
  },
  "triple-chevrons": {
    fill: "none",
    content: (
      <>
        <path
          d="M15 9V12.5C15 13.88 13.88 15 12.5 15H9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 6.5V9.8C12 11.02 11.02 12 9.8 12H6.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 4V7.1C9 8.15 8.15 9 7.1 9H4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  "diagonal-arrow": {
    fill: "none",
    content: (
      <>
        <line
          x1="6"
          y1="6"
          x2="14"
          y2="14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M9.5 14H14V9.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  "dual-pills": {
    fill: "none",
    content: (
      <>
        <line
          x1="14"
          y1="8"
          x2="8"
          y2="14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <line
          x1="14.5"
          y1="11.5"
          x2="11.5"
          y2="14.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </>
    ),
  },
  "expanding-beads": {
    fill: "currentColor",
    content: (
      <>
        <circle cx="7.5" cy="7.5" r="1.1" />
        <circle cx="11" cy="11" r="1.55" />
        <circle cx="14.5" cy="14.5" r="2.0" />
      </>
    ),
  },
  "chevrons-star": {
    fill: "none",
    content: (
      <>
        <path
          d="M15 9V12.5C15 13.88 13.88 15 12.5 15H9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 6.5V9.8C12 11.02 11.02 12 9.8 12H6.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8.2" cy="8.2" r="1.5" fill="currentColor" />
      </>
    ),
  },
  "symmetric-division": {
    fill: "none",
    content: (
      <>
        <line
          x1="14"
          y1="8"
          x2="8"
          y2="14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="13.8" cy="13.8" r="1.4" fill="currentColor" />
        <circle cx="8.2" cy="8.2" r="1.4" fill="currentColor" />
      </>
    ),
  },
  "percent-style": {
    fill: "none",
    content: (
      <>
        <line
          x1="8"
          y1="8"
          x2="14"
          y2="14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="13.8" cy="8.2" r="1.4" fill="currentColor" />
        <circle cx="8.2" cy="13.8" r="1.4" fill="currentColor" />
      </>
    ),
  },
  "orbit-satellite": {
    fill: "none",
    content: (
      <>
        <path
          d="M15 5.5V9C15 12.3137 12.3137 15 9 15H5.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="10" cy="10" r="1.8" fill="currentColor" />
      </>
    ),
  },
  // hidden 条目保留仅为两个用途：TEXTAREA_GRIP_STYLE_KEYS（config 层手写
  // 清单）须含 hidden（双向对账用例：清单与注册表 key 序列任一侧增/删/
  // 改名/调序失配必红），GripGlyph 以空 svg 占位（下拉图标）。手柄组件
  // 对 hidden 早退不渲染（B1 决策反转：旧「隐形热区」语义推翻——不可见
  // 却可拖是隐蔽交互面，textarea 回退原生 resize）。
  hidden: { fill: "none", content: null },
};

/**
 * 手柄样式 key 归一：注册表**自有属性**命中的 key 原样返回，其余值（未知值、
 * 已下线的存量设置值、以及 "constructor" / "toString" 之类的原型链键名）
 * 一律回落 "concentric-smooth"，保证消费方（GripGlyph 图标与
 * TextareaResizeGrip 手柄）不会拿到注册表里不存在的样式 key（该情形下查表
 * 回落会产出无 fill 的空图形）。用 hasOwnProperty 而非真值查表：GRIP_SVGS
 * 是对象字面量，真值查表会被 Object.prototype 上的键名穿透。
 *
 * @param {string|undefined} variant 待归一的手柄样式 key（源自设置项，可为缺省）。
 * @returns {string} 可安全渲染的样式 key。
 */
export function resolveGripStyle(variant) {
  return Object.prototype.hasOwnProperty.call(GRIP_SVGS, variant)
    ? variant
    : "concentric-smooth";
}

/**
 * 注册表 key 序列的只读访问器：返回 Object.keys(GRIP_SVGS) 的新副本。
 * 供测试侧与 TEXTAREA_GRIP_STYLE_KEYS 做反向对账（注册表侧增/删/改名/
 * 调序失配皆可判红）；只暴露键名，不导出注册表原始数据（SVG 资产），
 * 维持本模块既有「不导出注册表原始数据」契约。每次调用返回新数组，
 * 调用方无法经返回值改动注册表。
 *
 * @returns {string[]} 注册表 key 的有序序列（插入序，含 hidden）。
 */
export function getGripRegistryKeys() {
  return Object.keys(GRIP_SVGS);
}

/**
 * 手柄样式 key 的规范顺序清单（与 Object.keys(GRIP_SVGS) 有序恒等，
 * 含 hidden）。单一事实源在 src/config/textareaGripStyles.js（零 React
 * 依赖，供 config/视图层测试脱离组件运行时派生对账）；此处仅转发导出
 * 以保持既有 import 路径兼容。组件内查表仍以 GRIP_SVGS 为准，二者
 * 一致性由 TextareaResizeGrip.test.js 的双向对账（逐键 resolveGripStyle
 * 前向自检 + 注册表键序反向恒等断言）与 i18n.test.js 的派生 i18n 键
 * 守护共同锁定。
 */
export { TEXTAREA_GRIP_STYLE_KEYS } from "../config/textareaGripStyles";

/**
 * 纯展示手柄图形：复用 GRIP_SVGS 注册表与 svg 壳形态（width/height/
 * viewBox/fill/aria-hidden），供下拉选项等静态场景内嵌图标。无状态、
 * 无交互、aria-hidden。未知 key 回落 "concentric-smooth"（与组件渲染
 * 回落口径一致）；hidden 渲染空 svg 占位（与手柄 hidden 语义对齐）。
 * 仅导出本组件，不导出注册表原始数据。
 *
 * @param {Object} props
 * @param {string} props.variant 手柄样式 key（见 GRIP_SVGS）。
 * @param {number} [props.size] 渲染尺寸，缺省 18（viewBox 恒为 18×18）。
 * @returns {JSX.Element}
 */
export function GripGlyph({ variant, size = 18 }) {
  // 查表统一经 resolveGripStyle 的自有属性判定：真值查表会被
  // Object.prototype 键名（"constructor"/"toString"）穿透。
  const grip = GRIP_SVGS[resolveGripStyle(variant)];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill={grip.fill}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {grip.content}
    </svg>
  );
}

// 视觉为两条同心圆弧的内联 SVG（18×18 viewBox，外弧半径 6px、内弧半径
// 3px，层间恒定 3px 同心间距，stroke-width 1.8、round 端点）：弧线曲率
// 与 InputBase root 的大圆角同心内收，贴合圆角轮廓且不溢出输入框显示
// 范围；竖直排布的单向弧束与上下拖高语义一致。颜色由 currentColor 承
// 载，透明度基础 0.38、hover 0.9、active 1；SVG 样式统一经父级 Box 的
// "& svg" 选择器注入，保证 MUI sx 真实生效。

/**
 * 自绘 textarea 缩放手柄：24×24 命中热区 + 同心圆弧 SVG 视觉（InputBase
 * root 右下角；弧线 18×18 距输入框右/下边框各 4px，与容器圆角同心内收；
 * SVG 样式由父级 Box 的 "& svg" 选择器承载）。
 *
 * 测量基准恒为 closest(".MuiInputBase-root")：与 useTextareaHeightLock 的
 * 锁定写入对象同一口径，避免与 textarea 的 content-box 几何错位。
 *
 * Pointer Events 单路径：pointerdown 记起点并 setPointerCapture（capture
 * 不可用时不建立会话，与 capture 成功才可拖拽的语义一致），pointermove
 * 现测现算 clamp 后回调 onResize，pointerup/pointercancel/lostpointercapture
 * 闭合会话；会话记录 pointerId，异指针的按下/移动/收尾一律忽略。键盘
 * ArrowDown 增高、ArrowUp 减高（步进 12px，Shift ×4）。ARIA 语义为
 * slider：valuemax 取视口高度（渲染期求值的拖高上限保守上界），valuetext
 * 以像素值播报。高度状态与回写由 useTextareaHeightLock 负责，本组件只
 * 上报新高度；是否渲染由消费方按内容门控决定。
 *
 * @param {Object} props
 * @param {{current: HTMLTextAreaElement|null}} props.target 目标 textarea ref。
 * @param {(height: number) => void} props.onResize 高度变更回调。
 * @param {number|null} [props.value] 当前锁定高度（aria-valuenow）。未锁定
 *   时回落挂载后补测的基线元素实测高度（不可测时回落最小高度），播报值
 *   按 aria-valuemax 钳制，保证 role="slider" 恒携带落在规范区间内的
 *   aria-valuenow。
 * @param {string} props.label 无障碍名称（aria-label + title）。
 * @param {string} [props.variant] 手柄样式 key（见 GRIP_SVGS），缺省回落
 *   "concentric-smooth"；未知值同样回落，保证永不渲染空手柄。
 * @param {() => void} [props.onRelease] 显式解锁回调：双击或聚焦时按
 *   Escape 触发；消费方传入 hook 的 releaseHeight，未传时两条路径均
 *   为 no-op（Escape 路径仅锁定态才阻断默认行为与冒泡）。
 * @param {string} [props.unlockHint] 解锁提示文案（消费方经 i18n 传入；
 *   组件不引 i18n，维持现契约）。非空时与 label 无分隔符直连拼进 title，
 *   文案须自带前导空格与括号（括号全角/半角按语言本地化，见
 *   i18n.js 的 field_resize_unlock_hint 契约注释）。
 */
// 取节点所在文档片段（document 或 shadowRoot）的当前活动元素。Shadow DOM
// 宿主下 document.activeElement 只返回 shadow host，无法判定输入框与手柄
// 的真实焦点归属，故经 getRootNode 定位所属文档片段。
function activeElementOf(node) {
  const root =
    node && typeof node.getRootNode === "function"
      ? node.getRootNode()
      : document;
  return root?.activeElement ?? document.activeElement;
}

export default function TextareaResizeGrip({
  target,
  onResize,
  value,
  label,
  variant = "concentric-smooth",
  onRelease,
  unlockHint,
}) {
  const sessionRef = useRef(null);
  // 读屏播报上界：初始为视口保守值，随 clampHeight 现算出的真实钳制
  // 上界同步更新（仅在事件回调中 setState，无渲染回路）。病态视口
  // （innerHeight < 最小目标高度）下受最小高度托底，valuemax 恒不低于
  // valuemin。
  const [ariaValueMax, setAriaValueMax] = useState(() =>
    Math.max(MIN_TARGET_HEIGHT_PX, Math.round(window.innerHeight))
  );
  // 未锁定时 slider 值的回落：渲染期保持纯函数（不读 DOM），实测值由
  // 挂载后的布局效应补测写入（见 getBaselineEl 之后的 useLayoutEffect）。
  // 初始回落最小高度，与旧渲染期回落的最小高度口径一致。
  const [fallbackHeight, setFallbackHeight] = useState(MIN_TARGET_HEIGHT_PX);
  // 命中未知 key 回落默认双弧；hidden 命中自身后由组件早退（不渲染手柄，
  // textarea 回退原生 resize——早退分支见 fallback 补测效应之后）。
  // 查表统一经 resolveGripStyle 的自有属性判定（与 GripGlyph 同口径），
  // 真值查表会被 Object.prototype 键名（"constructor"/"toString"）穿透。
  const grip = GRIP_SVGS[resolveGripStyle(variant)];

  // 基线元素定位经 useCallback 稳定：fallback 补测效应按锁定态切换收敛
  // 依赖（B6），稳定引用避免效应被逐渲染重触发。
  const getBaselineEl = useCallback(() => {
    const el = target.current;
    if (!el) return null;
    return el.closest(INPUT_BASE_ROOT_SELECTOR);
  }, [target]);

  // 挂载后补测未锁定时的 slider 回落值：布局效应在 ref 挂载后、绘制前
  // 运行，实测基线元素高度写入 state（同值 setState 被 React Object.is
  // 判等豁免，测量收敛后无渲染回路）。依赖收敛为 [value, target]（经
  // useCallback 稳定的 getBaselineEl 一并列入以满足 exhaustive-deps，
  // 语义与 [value, target] 等价）：锁定态切换（value 数值 ↔ 非数值）或
  // 目标变更时补测一次，兜底播报值不滞留旧值；键入引起的内容高度变化
  // 不再逐渲染实测——fallbackHeight 仅作 slider 播报回落值，非布局数据，
  // 短暂过期可接受。
  useLayoutEffect(() => {
    // 仅有限数视为有效锁定：NaN/Infinity 不是可用的锁定高度，按未锁定
    // 口径继续补测回落值，与播报计算的 Number.isFinite 判定同口径。
    if (Number.isFinite(value)) return;
    setFallbackHeight(
      Math.max(
        MIN_TARGET_HEIGHT_PX,
        Math.round(getBaselineEl()?.offsetHeight || 0)
      )
    );
  }, [value, target, getBaselineEl]);

  // hidden 变体早退（B1 决策反转）：完全不渲染手柄，textarea 回退原生
  // resize。置于全部 hooks 之后满足 Rules of Hooks——hidden ↔ 其他样式
  // 切换重渲染时 hook 调用序列保持一致。GRIP_SVGS.hidden 条目保留
  // （TEXTAREA_GRIP_STYLE_KEYS 清单条目与 GripGlyph 占位依赖它，
  // 删注册表条目由双向对账判红），
  // resolveGripStyle("hidden") 归一化原样返回，早退分支对存量 hidden
  // 用户必然触发。
  if (resolveGripStyle(variant) === "hidden") {
    return null;
  }

  // 逐级上溯收集全部纵向可滚动祖先的上限：拖高不得把字段推出任何一层
  // 滚动容器的可见范围（多层嵌套滚动时各层上限取最小值），否则手柄随
  // 字段沉入折叠区不可达。overflow 无选择器可表达（closest 只匹配选择
  // 器串），故自字段根逐级向上读 computed overflowY。测量时机按路径区
  // 分：拖拽会话在 pointerdown 快照一次（会话内指针被 capture，用户无
  // 法同时滚动祖先容器，祖先几何不变）；键盘与重钳路径现测现算。
  const getScrollAncestorCapPx = (baselineEl, baselineTop) => {
    let cap = null;
    let container = baselineEl.parentElement;
    while (container) {
      const overflowY = window.getComputedStyle(container).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        const layerCap = Math.floor(
          container.getBoundingClientRect().bottom -
            baselineTop -
            VIEWPORT_GUTTER_PX
        );
        cap = cap == null ? layerCap : Math.min(cap, layerCap);
      }
      container = container.parentElement;
    }
    return cap;
  };

  // 视口 + 滚动祖先的全量上界实测：各层取最小者。pointerdown 会话快照
  // 与键盘 clampHeight 共用同一口径（留白与基线元素选择器同源）。
  const measureBoundsMaxPx = (baselineEl) => {
    const { top } = baselineEl.getBoundingClientRect();
    const viewportMax = Math.floor(
      window.innerHeight - top - VIEWPORT_GUTTER_PX
    );
    const scrollAncestorCap = getScrollAncestorCapPx(baselineEl, top);
    return scrollAncestorCap == null
      ? viewportMax
      : Math.min(viewportMax, scrollAncestorCap);
  };

  const clampHeight = (height) => {
    const rounded = Number.isFinite(height)
      ? Math.round(height)
      : LOCKED_MIN_TARGET_HEIGHT_PX;
    const baselineEl = getBaselineEl();
    if (!baselineEl) return Math.max(LOCKED_MIN_TARGET_HEIGHT_PX, rounded);
    // 非会话路径（键盘步进）现测现算：视口与全部纵向可滚动祖先各层取
    // 最小者。拖拽会话边界已在 pointerdown 快照（见 handlePointerDown），
    // pointermove 仅做纯算术钳制，不逐事件实测 DOM。
    const boundsMax = measureBoundsMaxPx(baselineEl);
    const max = Number.isFinite(boundsMax)
      ? Math.max(LOCKED_MIN_TARGET_HEIGHT_PX, boundsMax)
      : LOCKED_MIN_TARGET_HEIGHT_PX;
    // 播报上界与实际钳制上界同步：窗口 resize / 滚动祖先钳制后，
    // aria-valuemax 不再停留在初始视口保守值。
    setAriaValueMax(max);
    return Math.min(
      Math.max(rounded, LOCKED_MIN_TARGET_HEIGHT_PX),
      max
    );
  };

  // 会话终止共用路径：pointerup/cancel/lostpointercapture（经 endSession）
  // 与 Escape 解锁（handleKeyDown）都经本函数清会话、释放 pointer capture
  // 并归还焦点。异 pointerId 的多指防护留在 endSession 前置守卫，不进本
  // 函数（Escape 无指针身份，必须无条件终止）。
  const terminateSession = (event) => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    // pointerId 非有限时跳过 capture 释放（不抛错），与原 Escape 路径守卫同口径。
    if (Number.isFinite(session.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(session.pointerId);
      } catch (error) {
        // jsdom 与旧浏览器可能未实现 pointer capture，忽略即可。
      }
    }
    // 焦点归还兜底：某些平台在 preventDefault 下仍会把焦点转移到手柄。
    // 会话开始时 textarea 持有焦点、而此刻焦点仍滞留在手柄，则把焦点交还
    // textarea（preventScroll 避免归还引发滚动）；否则不扰动焦点归属，
    // 输入框光标/选区/输入法合成态全程不受影响。
    const textareaEl = target.current;
    if (
      session.hadTextareaFocus &&
      textareaEl &&
      activeElementOf(event.currentTarget) === event.currentTarget
    ) {
      textareaEl.focus({ preventScroll: true });
    }
  };

  const endSession = (event) => {
    const session = sessionRef.current;
    // 异 pointerId 的 up/cancel/lostpointercapture 不闭合会话（多指防护）。
    if (!session || event.pointerId !== session.pointerId) return;
    terminateSession(event);
  };

  const handlePointerDown = (event) => {
    // 防重入：活动会话期间的后续 pointerdown（多指/重复按下）不覆盖会话。
    if (sessionRef.current) return;
    const baselineEl = getBaselineEl();
    if (!baselineEl || event.button !== 0) return;
    // 焦点归属契约：鼠标 pointerdown 全程不抢 textarea 焦点。主动 focus
    // 手柄会立刻 blur 输入框——光标/选区消失、按键落到非文本宿主被静默
    // 吞掉、输入法合成态被打断、方向键改由 handleKeyDown 接管变成调高。
    // 键盘调高应经 Tab 聚焦手柄后由 handleKeyDown 承载（role="slider" 的
    // 标准无障碍路径），无需 pointerdown 抢焦点。记录按下瞬间 textarea
    // 是否持有焦点，供 endSession 在焦点被平台滞留到手柄时归还。
    const hadTextareaFocus =
      activeElementOf(event.currentTarget) === target.current;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (error) {
      // capture 不可用则不建立拖拽会话（与 onLostPointerCapture 的
      // 「capture 成功才可拖拽」语义一致）：无 capture 的会话会在指针
      // 移出热区后丢失全部事件，terminate 语义不制造该状态。
      return;
    }
    sessionRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: baselineEl.offsetHeight,
      hadTextareaFocus,
      // 会话边界快照：拖拽全程指针被 capture，用户无法同时滚动祖先容器，
      // 祖先几何在会话内不变——边界实测一次存入会话，pointermove 仅做
      // 纯算术钳制（O(祖先数×2) 次 DOM 读收敛为每会话 1 次）。快照口径
      // 与键盘 clampHeight 同源（measureBoundsMaxPx）。「禁止缓存」的原
      // 始顾虑（跨事件几何过期）由会话生命周期精确限定：缓存半径从
      // 「永久」缩到「单次拖拽会话」，非会话路径仍现测现算。
      boundsMax: (() => {
        const raw = measureBoundsMaxPx(baselineEl);
        return Number.isFinite(raw)
          ? Math.max(LOCKED_MIN_TARGET_HEIGHT_PX, raw)
          : LOCKED_MIN_TARGET_HEIGHT_PX;
      })(),
    };
    // 快照时刻同步播报上界：拖拽全程 aria-valuemax 与实际钳制上界一致。
    setAriaValueMax(sessionRef.current.boundsMax);
  };

  const handlePointerMove = (event) => {
    const session = sessionRef.current;
    // 异 pointerId 的 move 不改高度（多指防护）。
    if (!session || event.pointerId !== session.pointerId) return;
    // 边界取 pointerdown 快照（会话内祖先几何不变），仅做纯算术钳制。
    const rounded = Math.round(
      session.startHeight + (event.clientY - session.startY)
    );
    onResize(
      Math.min(
        Math.max(rounded, LOCKED_MIN_TARGET_HEIGHT_PX),
        session.boundsMax
      )
    );
  };

  const handleKeyDown = (event) => {
    // Escape 显式解锁：与双击路径（onDoubleClick）等价的键盘可达入口。
    // 事件阻断收窄到锁定态：仅当前锁定高度（Number.isFinite，与
    // useTextareaHeightLock 判定同口径）时才 preventDefault + stopPropagation，
    // 未锁定时祖先浮层（导航抽屉/弹窗壳）的 Esc 关闭语义保持可达。
    // stopPropagation 的保证作用域是 React 树内冒泡阶段的 Esc handler；
    // window 捕获阶段监听（如 shortcut.js、ruleEditorSession.js 的全局
    // 快捷键）不受其影响，也不应受影响。
    if (event.key === "Escape") {
      // 阻断条件并入会话态：pointerdown 建立会话但尚未 move 时 onResize
      // 未被调过、value 仍非有限数，此时 Esc 同样必须拦下——否则祖先浮层
      // （导航抽屉/弹窗壳）的 Esc 关闭语义被误触，「取消拖拽」呈现为
      // 「关闭浮层」。未锁定且无会话时祖先 Esc 语义保持可达。
      if (Number.isFinite(value) || sessionRef.current) {
        event.preventDefault();
        event.stopPropagation();
      }
      // 终止进行中指针会话并播报解锁：无论锁定与否都复用 endSession 的
      // 终止语义（含焦点归还），否则拖拽中按 Escape 后后续 pointermove
      // 继续触发 onResize，把刚解锁的高度重新锁回去，且焦点滞留 slider。
      terminateSession(event);
      onRelease?.();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const baselineEl = getBaselineEl();
    const baseHeight = baselineEl
      ? baselineEl.offsetHeight
      : MIN_TARGET_HEIGHT_PX;
    const step = KEYBOARD_STEP_PX * (event.shiftKey ? 4 : 1);
    const delta = event.key === "ArrowDown" ? step : -step;
    onResize(clampHeight(baseHeight + delta));
  };

  // slider 播报值：锁定时取锁定高度，未锁定时取挂载后补测的回落 state；
  // 再按 [valuemin, valuemax] 双向钳制——锁定高度经会话记忆恢复或窗口
  // 缩小后可能超出当前播报上界，非有限锁定值已按未锁定回落处理，ARIA
  // slider 规范要求 valuenow 落在 [valuemin, valuemax] 区间内。valuetext
  // 与 valuenow 同源同钳，读屏播报口径一致。
  const reportedHeight = Math.max(
    MIN_TARGET_HEIGHT_PX,
    Math.min(
      Number.isFinite(value) ? Math.round(value) : fallbackHeight,
      ariaValueMax
    )
  );

  return (
    <Box
      role="slider"
      // kt-resize-grip：焦点指示为 m3.js 显式规则（B7）——鼠标 :focus
      // 零指示，键盘 Tab 命中 :focus-visible 3px 主色环，不再静默依赖
      // 全局级联（Shadow DOM 或全局规则调整不会丢失焦点环）。
      className="kt-resize-grip"
      // 手柄仅响应 clientY 与 ArrowUp/ArrowDown 调整高度，slider 方向
      // 语义为 vertical（光标形态 cursor: "ns-resize" 同口径）。
      aria-orientation="vertical"
      aria-label={label}
      // Escape 为显式解锁快捷键（与双击等价），经 aria-keyshortcuts 向
      // 辅助技术播报该键盘可达入口。
      aria-keyshortcuts="Escape"
      title={unlockHint ? `${label}${unlockHint}` : label}
      tabIndex={0}
      aria-valuemin={MIN_TARGET_HEIGHT_PX}
      aria-valuemax={ariaValueMax}
      aria-valuenow={reportedHeight}
      aria-valuetext={`${reportedHeight}px`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endSession}
      onPointerCancel={endSession}
      onLostPointerCapture={endSession}
      onKeyDown={handleKeyDown}
      // 双击显式解锁（B3）：与拖拽单击互不干扰（dblclick 由两次 pointerup
      // 之后的独立事件承载）；未传 onRelease 时为 no-op。
      onDoubleClick={(event) => {
        event.preventDefault();
        onRelease?.();
      }}
      sx={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: HOT_ZONE_PX,
        height: HOT_ZONE_PX,
        // 禁用字段（如 preset 提示词）内保持手柄可交互。
        pointerEvents: "auto",
        cursor: "ns-resize",
        touchAction: "none",
        borderRadius: "4px",
        // 颜色经 currentColor 下传给 SVG 弧线：基础 onSurfaceVariant
        // 叠 68% 透明度融入，hover onSurface，active primary。
        color: "color-mix(in srgb, var(--kt-onv) 68%, transparent)",
        // SVG 全部视觉样式经父级 "& svg" 选择器承载（裸 svg 上的 sx
        // 无编译路径会静默失效）：定位右/下各 4px、基态透明度 0.38，
        // 过渡只作用于 opacity/transform，且不拦截指针与选区。
        "& svg": {
          position: "absolute",
          right: "4px",
          bottom: "4px",
          opacity: 0.38,
          transform: "scale(1)",
          transition:
            "opacity 0.2s cubic-bezier(0.2, 0, 0, 1), transform 0.2s cubic-bezier(0.2, 0, 0, 1)",
          pointerEvents: "none",
          userSelect: "none",
        },
        "&:hover": {
          color: "var(--kt-on)",
          "& svg": {
            opacity: 0.9,
            transform: "scale(1.08)",
          },
        },
        "&:active": {
          color: "var(--kt-pri)",
          "& svg": {
            opacity: 1,
            transform: "scale(0.95)",
          },
        },
      }}
    >
      {/* 定位/透明度/过渡等样式由父级 Box 的 "& svg" 选择器承载。 */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill={grip.fill}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {grip.content}
      </svg>
    </Box>
  );
}
