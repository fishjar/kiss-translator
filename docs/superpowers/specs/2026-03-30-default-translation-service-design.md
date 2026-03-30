# 默认翻译服务设计

## 背景

Kiss Translator 当前在多个入口各自保存翻译服务：

- 整页翻译的全局规则 `*` 使用 `apiSlug`
- 输入框翻译使用 `inputRule.apiSlug`
- 划词翻译使用 `tranboxSetting.apiSlugs`
- 字幕翻译使用 `subtitleSetting.apiSlug`

这些默认值目前都直接写死为 `Microsoft`。这会带来两个问题：

- 用户即使主要使用自己的 OpenAI 兼容服务，也需要到多个入口分别改一遍
- “默认服务”这个概念没有被显式建模，导致新安装、恢复默认值、后续新增入口时都只能继续依赖硬编码

本次需求是在不破坏现有行为的前提下，引入一个可配置的“默认翻译服务”，让用户能明确把自己常用的服务设为默认值，同时不影响已经单独配置过的各个翻译入口。

## 目标

- 新增一个全局设置项，表示用户偏好的默认翻译服务。
- 在设置页提供一个直观入口，让用户可以把默认服务设为任意已存在的翻译服务，例如 OpenAI。
- 提供一个显式操作，将默认服务同步到当前几个主要翻译入口。
- 新生成的默认配置优先使用该默认服务，而不是继续硬编码 Microsoft。
- 不影响已有用户已经单独改过的整页、输入框、划词、字幕配置。

## 非目标

- 本阶段不做“修改默认服务后立即自动改写所有入口”的隐式联动。
- 本阶段不做“每个入口都跟随默认服务实时变化”的动态绑定模型。
- 本阶段不增加新的服务类型，只复用现有 API 列表与 `apiSlug`。
- 本阶段不改动每个入口自己单独选择服务的能力。

## 产品决策

### 默认服务的语义

新增全局字段：

```js
{
  defaultApiSlug: "Microsoft"
}
```

其含义是：

- 这是“用户偏好的默认翻译服务”
- 它用于生成新的默认配置
- 它可以被用户一键应用到当前几个翻译入口
- 它不是对现有入口配置的强绑定引用

也就是说，默认服务是“默认值来源”，不是“运行时单一真值”。

### 用户界面

在 API 设置页新增一个“默认服务”区域，包含：

- 一个下拉框，用于选择默认服务
- 一个说明文字，明确告诉用户这不会自动覆盖当前各入口配置
- 一个“应用到当前翻译入口”按钮
- 当用户通过“添加”新建一个 API 配置时，自动弹出一次轻量确认，询问是否将这个新 API 设为默认服务

交互规则：

- 修改下拉框并保存后，仅更新 `defaultApiSlug`
- 点击“应用到当前翻译入口”后，才会把该服务同步到：
  - 整页翻译全局规则 `*`
  - 输入框翻译
  - 划词翻译
  - 字幕翻译
- 用户新建 API 并确认“设为默认服务”时，只更新 `defaultApiSlug`，不自动覆盖当前几个入口配置

这样可以满足两类用户：

- 想把 OpenAI 设成今后的默认值，但暂时不动现有入口配置的人
- 想一次性把几个主要入口都切到同一个服务的人

### 迁移策略

老用户升级时：

- 如果设置里还没有 `defaultApiSlug`，则补齐为当前系统默认值
- 不主动改写 `rules`、`inputRule`、`tranboxSetting`、`subtitleSetting`
- 不改变用户已经设置好的 API 项

新用户或重置为默认配置时：

- 新生成的默认配置应优先使用 `defaultApiSlug`
- 如果 `defaultApiSlug` 缺失、无效或对应 API 不存在，则回退到当前系统内置默认值

### 默认服务的合法性

`defaultApiSlug` 必须满足以下条件之一：

- 是当前 `transApis` 中存在的 `apiSlug`
- 或者在设置归一化阶段被回退为内置默认值

如果用户删除了一个曾被设为默认服务的自定义 API：

- 不立即破坏现有设置结构
- 在读取或归一化时，将 `defaultApiSlug` 回退到系统内置默认值

## 技术设计

### 设置模型

在 [src/config/setting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/config/setting.js) 中扩展 `DEFAULT_SETTING`，新增 `defaultApiSlug`。

同时补充一个小型归一化工具，用于：

- 给旧设置补默认值
- 确保 `defaultApiSlug` 至少是一个字符串
- 在需要时回退到内置默认值

### 默认值来源

当前仓库的多个默认值分散在：

- [src/config/rules.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/config/rules.js)
- [src/config/setting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/config/setting.js)

这些位置今天都直接写死为 `OPT_TRANS_MICROSOFT`。本次不把所有常量直接改成读取运行时 setting，因为配置常量定义阶段并拿不到用户设置。

更稳妥的方案是：

- 保留静态常量作为兜底默认值
- 在“生成用户默认配置”或“应用默认服务到各入口”时，使用 `defaultApiSlug`
- 通过一个集中 helper，把“把某个 apiSlug 应用到各入口”的逻辑统一起来

这样可以避免把运行时用户设置强行塞回静态配置模块。

### 应用到当前翻译入口

新增一个 helper，负责把给定 `apiSlug` 应用到当前几个主入口：

- 全局规则 `*` 的 `apiSlug`
- `inputRule.apiSlug`
- `tranboxSetting.apiSlugs`
- `subtitleSetting.apiSlug`

行为约束：

- 划词翻译当前是数组，因此同步时直接写成 `[apiSlug]`
- 只更新服务字段，不顺带改动源语言、目标语言、批处理等其他设置
- 如果 `rules` 中不存在全局规则 `*`，则先确保有这一项，再更新它的 `apiSlug`

### API 设置页

在 [src/views/Options/Apis.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Apis.js) 中新增默认服务设置区。

默认服务下拉框复用现有入口的选择规则，只允许选择当前已启用的 `apiSlug`：

- 内置 API 可选
- 用户自定义 API 也可选
- 已禁用 API 不出现在可选项里；如果历史设置值刚好落在已禁用或已删除的 API 上，则在归一化阶段回退到系统默认值

“应用到当前翻译入口”按钮触发后：

- 更新 settings 中的相关子配置
- 更新 rules 中全局规则的 `apiSlug`
- 给出成功提示

### 与现有入口配置的关系

整页、输入框、划词、字幕这几个入口仍然保留各自独立的配置页面和独立的服务选择能力。

新增默认服务后，入口配置和默认服务的关系是：

- 默认服务只负责提供“初始值”和“一键同步值”
- 入口被单独修改后，不会再被默认服务自动拉回
- 用户随时可以再次点击“应用到当前翻译入口”，重新覆盖这些入口的服务字段

这能保证行为简单、可预期，而且不会让用户产生“为什么我只是改了默认服务，现有配置全被改了”的困惑。

## 错误处理与降级

- 如果 `defaultApiSlug` 指向的 API 已不存在，读取设置时自动回退到系统默认值。
- 如果“应用到当前翻译入口”时目标 `apiSlug` 无效，则阻止写入并提示错误。
- 如果某个入口配置对象缺失，则在更新时基于对应默认结构补齐后再写入。

核心原则是：默认服务配置失败，不能影响已有翻译入口继续工作。

## 测试策略

### 单元测试

补充 [src/config/setting.test.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/config/setting.test.js)，覆盖：

- 旧设置缺少 `defaultApiSlug` 时会被补默认值
- 已存在 `defaultApiSlug` 时保持原值
- 非法值会回退到系统默认值

如果抽出独立 helper，则为 helper 补单测，覆盖：

- 将某个 `apiSlug` 应用到输入框、划词、字幕设置
- 将某个 `apiSlug` 应用到全局规则 `*`
- 当全局规则缺失时正确补齐

### UI 测试

为 API 设置页新增测试，覆盖：

- 页面能展示“默认服务”下拉框
- 修改默认服务只会更新 `defaultApiSlug`
- 点击“应用到当前翻译入口”后，会更新相关入口配置并展示成功反馈

## 风险与接受的权衡

- 默认服务与入口配置分离，意味着用户需要多点一次“应用到当前翻译入口”按钮；这是刻意接受的交互成本，用来换取低风险和可预期行为。
- 如果用户把默认服务设为一个配置不完整的 API，例如未填 key 的 OpenAI，自然仍然可能在实际翻译时失败；这不是默认服务功能单独要解决的问题。

## 主要影响范围

- [src/config/setting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/config/setting.js)：新增 `defaultApiSlug` 与归一化逻辑
- [src/views/Options/Apis.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/views/Options/Apis.js)：新增“默认服务”设置区与一键应用入口
- [src/hooks/Setting.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/hooks/Setting.js)：补老设置回填
- [src/hooks/Rules.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/hooks/Rules.js)：用于更新全局规则
- [src/config/i18n.js](/Users/kaen/Projects/kiss-translator/.worktrees/cefr-original-word-annotation/src/config/i18n.js)：新增默认服务文案
