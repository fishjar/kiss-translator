const messages = {
  title: ["网站规则编辑器", "Site rule editor"],
  open: ["编辑网站规则", "Edit site rules"],
  move: ["拖动主面板（方向键可移动）", "Move editor (or use arrow keys)"],
  moveInspector: [
    "拖动副面板（方向键可移动）",
    "Move selector panel (or use arrow keys)",
  ],
  closeInspector: ["关闭副面板", "Close selector panel"],
  editSelector: ["编辑定位", "Edit selector"],
  manualAdd: ["手动添加", "Add manually"],
  element: ["当前元素 / 祖先元素", "Current element / ancestors"],
  entries: ["定位条目", "Selectors"],
  scope: ["仅当前主机 · 不含子域名", "This hostname only · no subdomains"],
  pick: ["选取元素", "Pick element"],
  picking: [
    "点击网页元素锁定；Esc 取消选取",
    "Click a page element to lock it; Esc cancels picking",
  ],
  exit: ["退出编辑", "Exit editor"],
  dock: ["切换停靠方向", "Switch dock side"],
  purpose: ["规则用途", "Rule purpose"],
  currentGroup: ["当前规则组", "Current rule group"],
  pagePreview: ["页面预览", "Page preview"],
  pagePreviewHelp: ["综合当前网站的全部规则", "Uses all rules for this site"],
  personal: ["个人规则", "Personal rule"],
  subscription: ["订阅规则", "Subscription rule"],
  global: ["全局规则", "Global rule"],
  none: ["未匹配", "None matched"],
  sourceHelp: [
    "首次保存将创建当前主机的个人规则，并保留现有个人规则的其他配置。",
    "The first save creates a personal hostname rule and retains the current personal rule's other settings.",
  ],
  empty: ["此组没有定位条目", "No selectors in this group"],
  candidates: ["比较定位方式", "Compare selectors"],
  candidateHelp: [
    "选择候选只预览；确认添加后才保存。",
    "Candidates preview immediately. Confirm to save.",
  ],
  id: ["按 ID 定位", "By ID"],
  attribute: ["按结构属性定位", "By structural attribute"],
  similar: ["同类元素", "Similar elements"],
  class: ["同类名元素", "Shared class"],
  container: ["容器内同类元素", "Similar elements in a container"],
  tag: ["页面同标签元素", "Same tag across the page"],
  position: ["仅此位置", "This position only"],
  fragile: [
    "位置或动态标识可能随页面变化",
    "Position or dynamic identifier may change",
  ],
  input: ["CSS 选择器", "CSS selector"],
  add: ["确认添加规则", "Add rule"],
  update: ["保存定位修改", "Save selector"],
  delete: ["删除定位条目", "Remove selector"],
  cancelEdit: ["取消替换", "Cancel replacement"],
  inherit: ["恢复此组继承", "Restore group inheritance"],
  clear: ["清空此组", "Clear group"],
  inheritHelp: [
    "恢复继承使用订阅／全局值；清空使用显式空范围。根容器清空时不扫描页面。",
    "Inheritance uses subscription/global values; clearing explicitly matches nothing. Empty scan roots disable page scanning.",
  ],
  undo: ["撤销", "Undo"],
  redo: ["重做", "Redo"],
  whole: ["预计翻译范围", "Estimated translation scope"],
  entry: ["当前条目匹配", "Current selector matches"],
  original: ["返回原文", "Show original"],
  translation: ["查看译文", "Show translation"],
  matches: ["个匹配", "matches"],
  excluded: ["个超出范围／被排除", "outside roots / excluded"],
  hidden: ["个无可见矩形", "without visible rectangles"],
  previous: ["上一个匹配", "Previous match"],
  next: ["下一个匹配", "Next match"],
  legend: [
    "实线：匹配范围　虚线：范围外／排除",
    "Solid: matches · dashed: outside roots / excluded",
  ],
  previewHelp: [
    "只统计当前已加载 DOM。边框表示候选容器；内部排除和保留项仍生效。语言、长度等过滤可能进一步缩小范围。",
    "Counts cover loaded DOM only. Borders mark candidate containers; internal exclusions and kept content still apply. Language and length filters may further reduce the scope.",
  ],
  boundary: [
    "本版支持普通 DOM；iframe、Shadow DOM 内部和 Canvas 文字暂不支持选取。",
    "This version supports ordinary DOM. Picking inside iframes, shadow roots and canvas text is not supported.",
  ],
  saved: ["已保存到本地并应用", "Saved locally and applied"],
  saving: ["正在保存…", "Saving…"],
  loading: ["正在读取网站规则…", "Loading site rules…"],
  "rule-conflict": [
    "规则已在其他页面修改或优先级已变化。编辑内容已保留，请重新读取后比较并保存。",
    "Rules changed in another page or their priority changed. Your input is preserved. Reload, compare and save again.",
  ],
  "save-failed": [
    "保存未完成，编辑内容已保留。",
    "Save did not complete. Your input is preserved.",
  ],
  "route-changed": [
    "网页地址已变化，已重新读取规则并清空撤销历史。",
    "Page address changed. Rules reloaded and undo history cleared.",
  ],
  "element-removed": [
    "选中元素已被网页移除，请重新选取。",
    "The page removed the selected element. Pick another element.",
  ],
  "unsupported-element": [
    "此元素属于不支持的 frame 或 Shadow DOM，请选择普通网页元素。",
    "This element belongs to an unsupported frame or shadow root. Pick an ordinary page element.",
  ],
  "unsupported-page": [
    "此页面不支持按网站编辑规则。",
    "Site rule editing is unavailable on this page.",
  ],
  "removed-coverage": [
    "已删除定位条目，但预计范围仍覆盖该区域：自动识别、其他目标或其祖先仍在生效。要停止翻译，可直接排除此区域。",
    "Selector removed, but the estimated scope still covers this area through automatic scanning, other targets or ancestors. Exclude it to prevent translation.",
  ],
  removed: [
    "已删除定位条目，当前预计范围未覆盖该区域。",
    "Selector removed. The estimated scope no longer covers this area.",
  ],
  exclude: ["排除此区域", "Exclude this area"],
  reload: ["重新读取规则", "Reload rules"],
  scanAll: [
    "当前开启强制扫描或纯文本模式，排除规则可能不生效；请先在设置中关闭这些模式。",
    "Scan-all or plain-text mode is enabled. Exclusions may not apply; disable these modes in settings first.",
  ],
};

// Newly introduced messages fall back to English until localized.
export const RULE_EDITOR_I18N = Object.fromEntries(
  Object.entries(messages).map(([key, [zh, en]]) => [
    `rule_editor_${key}`,
    { zh, en, zh_TW: en, ja: en, ko: en, tr: en, vi: en, ru: en },
  ])
);
