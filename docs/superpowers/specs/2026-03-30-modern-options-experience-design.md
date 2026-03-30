# 设置页默认中文与现代化改版设计

## 背景

当前设置页存在两个明显问题：

- 新安装时界面语言默认是英文，不符合当前主要使用场景
- 设置页整体仍然是较早期的 MUI 表单与侧边栏组合，功能齐全，但视觉层次、空间组织和整体气质偏旧

这会直接影响两个关键体验：

- 用户第一次打开设置页时，会先看到英文界面，理解成本更高
- 即使功能很强，设置页看起来也不像一个现代、清晰、可信赖的控制台

用户已经明确选择了更偏“明显焕新”的方向，但同时要求保持克制，不能为了视觉而牺牲可用性。

## 目标

- 将设置页默认语言改成中文。
- 将设置页整体升级为更现代的控制台风格。
- 保留当前左侧导航与主要信息架构，避免用户重新学习。
- 通过更清晰的视觉层次，让设置页看起来更专业、更轻盈、更容易浏览。
- 保证移动端和桌面端都能正常使用。

## 非目标

- 本阶段不调整具体设置项的功能逻辑。
- 本阶段不重构整套信息架构，不做菜单大换血。
- 本阶段不引入激进动画、花哨插画或过强品牌化视觉。
- 本阶段不逐页重写所有设置子页面的内容结构。

## 产品决策

### 默认语言

- 将新的默认 `uiLang` 从 `en` 改为 `zh`。
- 该改动只影响新安装用户，或旧设置中缺失 `uiLang` 的情况。
- 已经设置过英文、日文、繁体等界面语言的老用户，不被强制改回中文。

### 视觉方向

整体视觉采用“现代控制台”风格，而不是传统后台表单页：

- 页面背景从纯平白色升级为柔和的暖色层次背景
- 内容主体改为带悬浮感的浅色卡片容器
- 左侧导航改成更轻、更清晰的分组导航样式
- 顶部区域加入更明显的页面身份感和摘要信息
- 表单输入区采用更统一的圆角、边框、间距和卡片分组

风格关键词：

- 现代
- 干净
- 专业
- 轻暖
- 克制

### 信息架构

保留当前信息架构与路由：

- 左侧继续是导航
- 右侧继续是当前页面内容
- 各子页路径和入口名称保持稳定

但会重新组织设置页壳层，让“导航、头部、正文”三层关系更清楚。

### 改版范围

本次优先改“设置页外壳”和若干高频页面的展示质感：

- `Layout`
- `Header`
- `Navigator`
- `Setting`
- `Apis`
- `CEFRSetting`
- `About`

其他页面即使暂时没有逐页精修，也应自动受益于新的壳层、卡片容器、间距体系和主题样式。

## 技术设计

### 默认语言改动

在 [src/config/setting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/config/setting.js) 中将：

```js
uiLang: "en"
```

改为：

```js
uiLang: "zh"
```

由于设置归一化当前是“已有值保留、缺省值补默认”，这个改动天然只会影响：

- 新初始化设置
- 缺少 `uiLang` 的历史设置

不会覆盖已有用户选择。

### 主题升级

在 [src/hooks/Theme.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/hooks/Theme.js) 中扩展主题，而不仅仅设置 `palette.mode`：

- 为浅色模式定义更有层次的背景色
- 为卡片、边框、主色、文本层级定义更完整的 token
- 调整圆角、阴影和表单控件默认样式
- 为设置页引入一组更一致的组件级 override

但仍保持与现有 MUI 体系兼容，不引入额外 UI 框架。

### 设置页壳层

在 [src/views/Options/Layout.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Layout.js) 中重做页面壳层：

- 页面整体增加背景层
- 主体区域限制最大宽度，避免超宽屏幕上内容过散
- 导航与正文之间增加更明确的空间分隔
- 正文区改为更像内容面板，而不是直接裸露在页面上

### 顶部头部

在 [src/views/Options/Header.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Header.js) 中把现在的单条 `AppBar` 升级为更现代的顶部区域：

- 保留品牌链接和深浅色切换
- 增加更好的留白和层次
- 弱化传统深色工具栏感
- 与正文背景、导航卡片形成统一视觉系统

### 左侧导航

在 [src/views/Options/Navigator.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Navigator.js) 中调整导航表现：

- 把当前纯列表按钮风格升级为更轻的导航胶囊/卡片风格
- 当前选中项更明确，但不要太重
- 图标和文字对齐更整洁
- 桌面端导航像固定面板，移动端保持抽屉

### 内容页面分组

当前很多页面是单层 `Stack + Grid + TextField` 平铺。改版后应把这些内容整理成更清楚的组：

- 关键操作区域优先显示
- 配置项放入卡片分组
- 危险或次要操作视觉上降级

本次会抽一个轻量的共用展示层容器，形式可以是：

- `OptionsPageShell`
- `OptionsSectionCard`
- `OptionsHero`

这些组件只解决展示层问题，不承担业务逻辑。

### 首屏页面重点

基础设置页 [src/views/Options/Setting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Setting.js) 应成为新的视觉样板页：

- 顶部先展示页面标题与一句简短说明
- 导入/导出等操作做成工具按钮区
- 高频基础设置放到第一组卡片
- 低频或高级设置放到后续分组

API 页和 CEFR 页也应跟随同一套节奏：

- 先是解释和主要操作
- 再是具体配置

## 交互与动效

动效保持克制，只做少量增强：

- 页面进入时轻微淡入
- 卡片 hover 有非常轻的阴影或边框变化
- 导航选中态有平滑过渡

不做大幅位移动画，不做复杂视差。

## 可访问性与兼容性

- 保持当前表单控件语义不变
- 保证文本与背景对比度足够
- 不依赖 hover 才能完成关键操作
- 移动端抽屉导航继续保留
- 高度较长的设置页仍应顺畅滚动

## 测试策略

### 单元/行为测试

补充至少以下验证：

- `DEFAULT_SETTING.uiLang` 变为 `zh`
- 旧设置若已有 `uiLang`，归一化后保持原值
- 设置页核心壳层在渲染时不报错

### 手工验证

重点验证：

- 新安装后设置页默认显示中文
- 桌面端导航、头部、正文卡片层次正确
- 移动端抽屉可正常打开关闭
- `Apis`、`CEFRSetting`、`Setting` 页面在新样式下无布局错乱
- 深色模式和浅色模式都可用

## 风险与接受的权衡

- 如果一次性逐页深度重做所有设置子页，范围会过大，因此本次优先重做壳层和高频页面，其他页面先共享新壳层样式。
- 视觉升级如果过度，会削弱“配置工具”的稳定感，因此需要控制颜色和阴影强度。
- 由于仓库当前大量页面直接写了 `Grid + TextField`，完全统一到新组件体系需要渐进推进，本次不追求一步到位。

## 主要影响范围

- [src/config/setting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/config/setting.js)：默认语言改为中文
- [src/hooks/Theme.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/hooks/Theme.js)：扩展现代化主题 token 与组件样式
- [src/views/Options/Layout.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Layout.js)：重做设置页壳层
- [src/views/Options/Header.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Header.js)：升级顶部头部样式
- [src/views/Options/Navigator.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Navigator.js)：升级左侧导航视觉
- [src/views/Options/Setting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Setting.js)：做为基础样板页整理内容分组
- [src/views/Options/Apis.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Apis.js)：对齐新的页面结构和卡片节奏
- [src/views/Options/CEFRSetting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/CEFRSetting.js)：对齐新的页面结构和视觉语言
- [src/views/Options/About.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/About.js)：让说明页也适配新的内容面板风格
