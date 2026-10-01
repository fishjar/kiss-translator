// textarea 拉伸手柄样式 key 的单一事实源：键集合与顺序一一对应组件内
// GRIP_SVGS 注册表（含 hidden），顺序即下拉选项展示顺序。本模块保持
// 零 React/MUI 依赖，供 config 层与视图层测试在无组件运行时的情况下
// 派生对账（grip_style_<key> i18n 键以 replace(/-/g, "_") 归一派生）。
export const TEXTAREA_GRIP_STYLE_KEYS = [
  "concentric-smooth",
  "concentric-triple",
  "corner-pill",
  "dotted-concentric",
  "dotted-single",
  "triple-chevrons",
  "diagonal-arrow",
  "dual-pills",
  "expanding-beads",
  "chevrons-star",
  "symmetric-division",
  "percent-style",
  "orbit-satellite",
  "hidden",
];
