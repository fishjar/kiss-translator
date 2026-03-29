# CEFR 原文单词标注设计

## 背景

Kiss Translator 目前已经支持整页双语翻译：保留原文内容，并在每组被翻译的节点后面插入译文 wrapper。仓库里也已经有 CEFR 词典资源、CEFR 设置页原型，以及一个针对“英文译文结果”做标注的草稿钩子。但这个原型和目标产品行为并不一致。

本次目标功能是：

- 内置常用 3 万英语单词 CEFR 词典
- 用户安装插件后，引导其完成一个内部 CEFR 等级测试，范围为 A1-C2
- 在整页双语翻译过程中，当网页原文是英文时，对高于用户当前等级的英文单词在其上方显示中文释义
- 不影响现有双语翻译功能
- 标注样式不进入正常文档流，不能因为释义而把原文行高或页面排版撑开

## 目标

- 保留现有整页双语翻译主链路，把 CEFR 标注作为增强层，而不是翻译依赖项。
- 只对整页翻译场景中的“英文原文”做单词级标注。
- 通过绝对定位把中文释义显示在生词上方，不扩大行盒，不改变周围文档流。
- 对首次安装用户提供 CEFR 测级引导，并在 popup 和设置页中保留持续可见的入口。
- 允许用户后续重新测级，或者手动覆盖自己的 CEFR 等级。
- 将 CEFR 测级流程控制在轻量、快速、低打扰的范围内，避免做成冗长繁琐的考试体验。

## 非目标

- 本阶段不支持划词翻译、字幕翻译、输入框翻译或鼠标悬停翻译场景。
- 不把该测试描述为官方 CEFR 认证考试；它只是插件内部的分级测试。
- 不做间隔重复记忆、词汇复习流程或个人生词学习面板。
- 不做用于解决 `overflow: hidden` 裁剪问题的全局浮层系统。
- 不做依赖上下文的多义词语义消歧，先只展示内置词典中的主释义。

## 产品决策

### 首装引导与入口

- 仅在浏览器扩展 `install` 安装场景触发 CEFR 首装引导，扩展升级时不自动打开 CEFR 页面。
- 插件在首次安装时直接打开 `options.html#/cefr`。
- 当用户尚未完成测级时，CEFR 设置页顶部展示专门的 onboarding 卡片，用于说明内置词典、测试目的以及“整页翻译后对高难度英文词显示中文释义”的功能行为。
- popup 和设置页都保留长期入口：
  - 未完成测级时，显示醒目的“去做 CEFR 测试”入口
  - 已完成测级时，显示当前等级，并提供“重新测试”和“手动调整”入口

### 测级体验约束

- 测级被定义为“插件内部的快速分级流程”，而不是完整考试。
- 第一版题量应保持精简，以少量高区分度题目快速得到近似等级，不要求追求学术测评精度。
- 单题交互应尽量直接，优先使用单选题，不引入复杂表单、长阅读、写作或多步骤答题。
- 用户应能在较短时间内完成首次测级，并立即拿到等级结果。
- 用户如果不想立即完成测试，也可以先跳过，之后再从 popup 或设置页重新进入。

### CEFR 设置模型

当前 CEFR 设置对象只有 `{ enabled, level }`，无法区分“功能是否开启”“用户是否完成测试”“当前等级来源”。建议扩展为如下状态模型：

```js
{
  enabled: false,
  level: 0,
  assessmentCompleted: false,
  levelSource: "unset", // "unset" | "quiz" | "manual"
  lastPromptFrom: "" // "" | "install" | "popup" | "settings"
}
```

该状态继续放在现有 settings 存储中，以保持和其他插件设置一致的持久化与同步行为。

### 标注范围

- 标注仅在整页翻译场景运行。
- 标注仅在当前被翻译节点组的原文语言被判定为英文时运行。
- 标注绝不修改译文 wrapper 的 DOM。
- 标注只作用在双语模式下仍保留在页面中的原文文本节点。
- 难度比较采用 `wordLevelScore > userLevelScore`，而不是 `>=`，因为需求是“高于用户等级的词才显示释义”。

## 技术设计

### 整体架构

当前 [src/libs/translator.js](/Users/kaen/Projects/kiss-translator/src/libs/translator.js) 中的整页翻译流程继续负责：

1. 收集文本节点并组成待翻译节点组
2. 序列化文本并发给翻译服务
3. 在原文后面插入译文 wrapper

CEFR 标注作为“翻译成功后的增强步骤”插入到该流程之后，仅在译文 wrapper 成功创建后才运行。这样翻译正确性和 CEFR 呈现完全解耦：即使 CEFR 失败，用户也仍然拿到和今天一样的双语翻译结果。

### 标注流程

对每个成功翻译的节点组，执行以下流程：

1. 复用该节点组已有的原文语言检测结果。
2. 如果不满足以下任一条件，则立即退出：
   - CEFR 功能已启用
   - 用户已完成测级
   - 当前节点组原文语言为英文
   - 原文内容当前仍保留在 DOM 中
3. 遍历该节点组中的原文文本节点。
4. 第一版仅使用低风险规则对简单英文单词分词：`/\\b[a-zA-Z]+\\b/g`
5. 将归一化后的单词到 CEFR 词典中查级别。
6. 仅对 `单词等级 > 用户等级` 的词执行标注。
7. 将命中的文本片段替换为包装后的 DOM：英文原词保持不变，额外挂一个位于其上方的中文释义层。

### 标注 DOM 结构

每个被标注的单词应渲染为：

```html
<span class="kiss-cefr-word" data-kiss-cefr="1" data-word="ubiquitous">
  ubiquitous
  <span class="kiss-cefr-gloss" aria-hidden="true">普遍的</span>
</span>
```

关键样式要求：

- `kiss-cefr-word` 使用 `position: relative` 和 `display: inline-block`
- `kiss-cefr-gloss` 使用 `position: absolute`，定位在单词上方
- 释义层使用 `pointer-events: none`
- 释义层使用 `white-space: nowrap`
- 释义层有小幅偏移和适度 `z-index`，保证可读但不过度遮挡周边内容
- 第一版中英文原词本身保持可选中，视觉上不做额外强调

实现中不得使用 `<ruby>` 和 `<rt>`，因为它们会参与布局并拉高行高，这与“不能影响原文文档流”的要求直接冲突。

### 与 Translator 的集成

[src/libs/cefr.js](/Users/kaen/Projects/kiss-translator/src/libs/cefr.js) 中现有的 `maybeAnnotateTranslatedText(...)` 是围绕“英文译文输出”设计的，不再适合作为本功能的主实现。CEFR 模块应改为面向原文 DOM 标注的辅助能力，例如：

- 加载并缓存 CEFR 词典
- 将 CEFR 等级映射为数值分数
- 判断某个单词是否高于用户等级
- 将文本节点或片段改写成带释义层的 DOM 包装
- 可靠地移除或还原 CEFR 包装节点

[src/libs/translator.js](/Users/kaen/Projects/kiss-translator/src/libs/translator.js) 在翻译成功后调用新的 DOM 标注辅助函数，并登记足够的清理信息，以便在译文被重建或移除时同步清理 CEFR 标注。

### 清理与生命周期

CEFR 标注必须作为翻译生命周期的一部分来管理：

- 当整页翻译关闭时，CEFR 包装节点要和译文 wrapper 一起被移除。
- 当某个节点组被重新翻译或刷新时，必须先还原已有 CEFR 标注，再重新应用新一轮标注。
- 清理时要恢复纯文本节点，并对父节点执行 `normalize()`，避免 DOM 中残留碎片化的 text node。
- 标注逻辑必须是幂等的；对同一节点组重复运行不能出现重复包裹同一个词的情况。

最稳妥的做法是把 CEFR 包装节点的清理信息和 translator 当前已有的译文清理机制挂在同一套生命周期里，而不是单独维护一条松散的清理逻辑。

## UI 设计

### 设置页

[src/views/Options/CEFRSetting.js](/Users/kaen/Projects/kiss-translator/src/views/Options/CEFRSetting.js) 需要从当前原型演进成完整的 CEFR 工作流页面，并覆盖 3 个状态：

1. onboarding 状态
   - 首次安装后或从未完成测级时显示
   - 说明功能目标，并明确提示“测试较短，可快速完成”
   - 提供主要按钮开始测试
2. 已配置状态
   - 展示当前 CEFR 等级
   - 允许重新测试
   - 允许手动覆盖等级
   - 允许开启或关闭原文生词标注功能
3. 跳过但未设置状态
   - 用户关闭过引导但没有完成测试
   - 页面继续保留醒目的提醒卡片和开始测试入口

### Popup

[src/views/Popup/PopupCont.js](/Users/kaen/Projects/kiss-translator/src/views/Popup/PopupCont.js) 顶部加入一个紧凑型 CEFR 卡片：

- 如果尚未完成测试，显示跳转到 CEFR 设置页的 CTA
- 如果已完成测试，显示当前等级，并提供去设置页重新测试或调整的入口

这样即使用户错过了一次性的首装自动引导，后续也仍然能在 popup 中发现并进入该功能。

## 错误处理与降级

- 如果 CEFR 词典资源加载失败，则静默跳过标注，翻译功能照常工作。
- 如果用户等级未设置或值非法，则跳过标注。
- 如果原文语言检测结果不是英文，则跳过标注。
- 如果某个节点无法被安全分词或改写，则仅跳过该节点，不影响其他节点。
- 如果首次安装自动打开 CEFR 页面失败，插件仍然正常安装，用户仍可以通过 popup 或设置页入口进入 CEFR 页面。

核心原则很简单：CEFR 失败绝不能阻塞、污染或回归现有翻译结果。

## 性能考虑

- 复用当前“按节点组翻译”的流程，不新增一轮独立的整页扫描。
- 复用 CEFR 模块现有的词典懒加载与内存缓存能力。
- 第一版只处理简单 ASCII 英文单词，降低解析复杂度与 DOM 改写成本。
- 对于过短、非英文、或已经被 translator 现有保护条件过滤掉的节点组，直接跳过 CEFR 标注。

这样可以让 CEFR 处理量和已翻译内容成正比，避免新增第二套整页观察器或扫描通道。

## 测试策略

### 单元测试

补充或改造 [src/libs/cefr.test.js](/Users/kaen/Projects/kiss-translator/src/libs/cefr.test.js)，覆盖以下行为：

- 非英文原文时跳过标注
- 小于或等于用户等级的词不标注
- 高于用户等级的词会被标注
- 生成的 DOM 使用绝对定位释义层，而不是 ruby 标签
- 清理逻辑能够正确恢复原始文本

### Translator 集成测试

增加围绕 [src/libs/translator.js](/Users/kaen/Projects/kiss-translator/src/libs/translator.js) 的集成覆盖，确认：

- 译文 wrapper 仍然正常生成
- 满足条件时，英文原文单词会收到 CEFR 释义包装
- 关闭翻译后，译文 wrapper 和 CEFR 标注都会一起被移除
- 重跑翻译时，不会重复包裹同一个单词

### UI 测试

补充以下 UI 行为测试：

- 首装 onboarding 标记与自动引导行为
- CEFR 设置页在 onboarding 状态和已配置状态之间的切换
- popup 中提醒卡片在“未设置”和“已设置”两种情况下的显示
- 重新测试与手动覆盖等级后，设置值被正确写入存储
- 测级流程在少量步骤内可完成，不出现冗长的多段式交互

## 风险与接受的权衡

- 某些站点的祖先容器可能设置了 `overflow: hidden`，导致上方释义被裁切。第一版接受这一残余风险，以换取实现简单和低风险。
- 单词级中文释义有时可能不够贴合上下文，因为它本质上是词汇提示，不是上下文精确翻译。
- 第一版只处理简单英文单词，意味着缩写、含撇号单词、连字符词和专有名词可能被跳过。这是为了先保证稳定性和正确性。

## 主要影响范围

预计主要改动点如下：

- [src/background.js](/Users/kaen/Projects/kiss-translator/src/background.js)：处理首次安装时的 CEFR 引导
- [src/config/setting.js](/Users/kaen/Projects/kiss-translator/src/config/setting.js)：扩展 CEFR 状态模型
- [src/views/Options/CEFRSetting.js](/Users/kaen/Projects/kiss-translator/src/views/Options/CEFRSetting.js)：实现 onboarding、重测和手动改级 UI
- [src/views/Popup/PopupCont.js](/Users/kaen/Projects/kiss-translator/src/views/Popup/PopupCont.js)：增加持久提醒入口
- [src/libs/cefr.js](/Users/kaen/Projects/kiss-translator/src/libs/cefr.js)：提供面向原文 DOM 的标注与清理辅助函数
- [src/libs/translator.js](/Users/kaen/Projects/kiss-translator/src/libs/translator.js)：在翻译成功后接入 CEFR 原文标注，并纳入现有清理生命周期

这个设计方案的核心是：复用仓库中已经存在的 CEFR 原型基础，但把方向从“标注英文译文”调整为“增强英文原文 DOM”，并严格满足“不影响现有双语翻译”和“不影响原文文档流”这两个关键约束。
