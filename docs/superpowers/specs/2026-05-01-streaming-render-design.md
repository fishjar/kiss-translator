# 流式渲染功能设计

## 概述

在页面内嵌翻译场景中，流式传输时支持渐进式 DOM 更新，让用户更快看到翻译结果。支持三种可配置模式。

## 需求

- 仅应用于**页面内嵌翻译**（Translator 类），不影响划词翻译框、Popup 等场景
- 配置粒度为**每个 API 单独配置**
- 三种模式：实时渲染（realtime）、片段渲染（segment）、不启用（disabled，默认）
- 前置条件：`useStream=true` 且 `useBatchFetch=true`

## 三种模式

| 模式 | 行为 | 更新频率 | 解析方式 |
|------|------|---------|---------|
| realtime | 逐 token 更新对应段落 DOM | 每帧（RAF 合并后 ~16ms） | 轻量级实时边界解析 |
| segment | 每完整段落更新 DOM | 每个段落完成 | 复用现有 parseStreamingSegments / createStreamingJsonParser |
| disabled | 等待全量结果后一次性渲染 | 一次 | 现有逻辑不变 |

## 配置层

### 新增字段

在 `defaultApi`（src/config/api.js）中新增：

```js
streamRenderMode: "disabled"  // "realtime" | "segment" | "disabled"
```

仅在 `useStream=true` 时生效。联动逻辑：`useStream` 变为 false 时，`streamRenderMode` 重置为 "disabled"。

### UI 变更

**Options 页面 Apis.js**：在 `useStream` 下拉框之后，当 `useStream=true` 时新增下拉框：

```
流式渲染模式:
  - 不启用 (disabled) — 默认
  - 实时渲染 (realtime)
  - 片段渲染 (segment)
```

### i18n 新增

- `stream_render_mode`: "流式渲染模式"
- `stream_render_realtime`: "实时渲染"
- `stream_render_segment`: "片段渲染"

## 数据流层

### onStreamChunk 回调

在 `apiTranslate` 的 `args` 中增加可选回调：

```js
onStreamChunk: (chunk: { id: number, text: string, isComplete: boolean }) => void
```

**传递路径**：

```
Translator.#translateNodeGroup
  → apiTranslate({ ..., onStreamChunk })
    → BatchQueue.addTask(data, args)
      → BatchQueue.processQueue
        → handleTranslate (生成器)
          → handleTranslateStreamInternal
            → 解析流式 delta，调用 onStreamChunk
```

### BatchQueue 改动

在 `processQueue` 的生成器消费循环（batchQueue.js:70-86）中，如果 args 包含 `onStreamChunk`：

1. 每次从生成器 yield 结果时，除了 resolve 对应 task，还调用 `onStreamChunk`
2. 对于片段模式：复用现有 `{ id, result }` 格式
3. 对于实时模式：需要 handleTranslateStreamInternal 额外 yield 中间态

### handleTranslateStreamInternal 改动

现有逻辑（trans.js:1169-1267）根据 streamRenderMode 分支：

**segment 模式**：现有 yield `{ id, result }` 已经是逐段落输出。无需改动 handleTranslateStreamInternal 本身，但 BatchQueue 需要在 resolve 时额外调用 onStreamChunk（见下方 BatchQueue 细化）。与当前行为的区别：当前段落 resolve 后 Translator 直接替换 innerHTML；segment 模式下，段落仍在流式中时即可显示已完成的段落（loading → textContent），并在全部完成后统一做占位符还原。

**realtime 模式**：在 yield 最终结果之前，额外 yield 中间态：

```js
// 每个 delta 到达时，解析出段落归属，yield 中间态
yield { id, partialText, isComplete: false }
// 段落完成时
yield { id, result, isComplete: true }
```

## 核心渲染层

### 新增：createRealtimeStreamParser（stream.js）

轻量级实时流式解析器，输入原始 delta 文本，输出段落级中间态：

```js
createRealtimeStreamParser(): {
  write(delta: string): Array<{ id: number, partialText: string, isComplete: boolean }>
}
```

**按格式的边界识别**：

| 格式 | 段落开始 | 段落内容 | 段落结束 |
|------|---------|---------|---------|
| XML | `<t id="N">` | 闭合标签前的文本 | `</t>` |
| JSON | `@streamparser/json` 流式解析 | 对象内 text 字段的增量 | 完整对象 emit |
| 行格式 | `N \| ` 前缀 | 前缀后的文本 | `\n` 或下一个 `N \| ` |

### Translator.#translateNodeGroup 改动

现有流程（translator.js:1283-1407）：

```
创建 wrapper + inner(loading) → await translateFetch → inner.innerHTML = 完整结果
```

流式渲染流程：

```
创建 wrapper + inner(loading)
  → translateFetch + onStreamChunk 回调
    → onStreamChunk 中：
       1. 首次 delta：移除 loading SVG，创建 TextNode
       2. 后续 delta：通过 RAF 缓冲合并，更新 TextNode.nodeValue
       3. 段落完成：标记该段落完成
    → translateFetch 完成：
       1. 对所有段落执行 #restoreFromTranslation 占位符还原
       2. inner.innerHTML = 最终 HTML
       3. 后续逻辑（翻译节点注册、样式附加、钩子函数等）不变
```

**但注意**：`#translateNodeGroup` 每次处理的是一组 nodes（一个段落），而 `apiTranslate` 在 BatchQueue 中批量处理多个段落。因此 `onStreamChunk` 需要通过 BatchQueue 分发到各个 task 的回调。

简化方案：每个 `addTask` 的 `args` 中携带 `onStreamChunk` 回调。BatchQueue 在消费生成器时，根据 yield 的 `id` 找到对应 task，调用其 `args.onStreamChunk`。

### BatchQueue 细化

```js
// 改动 batchQueue.js processQueue 中的生成器消费循环
for await (const item of generator) {
  const { id, result, partialText, isComplete } = item;
  const taskItem = tasksToProcess[id];
  if (taskItem) {
    // 流式中间态回调（实时模式专用）
    if (!isComplete && taskItem.args?.onStreamChunk) {
      taskItem.args.onStreamChunk({ id, text: partialText, isComplete: false });
    }
    // 段落完成时：调用回调 + resolve Promise
    if (isComplete) {
      if (taskItem.args?.onStreamChunk) {
        taskItem.args.onStreamChunk({ id, text: result, isComplete: true });
      }
      if (!taskItem.resolved) {
        taskItem.resolved = true;
        taskItem.resolve(result);
      }
    }
  }
}
```

**注意**：现有代码中 yield 的格式是 `{ id, result }`（无 isComplete/partialText 字段）。改动需要统一 yield 格式为 `{ id, result, partialText?, isComplete }`：
- 现有段落完成时：`{ id, result, isComplete: true }`
- 实时模式中间态：`{ id, partialText, isComplete: false }`
- `isComplete` 缺省时视为 `true`，保持向后兼容

## 性能优化

### 1. RAF 缓冲

```
delta 到达 → 写入缓冲 → requestAnimationFrame 回调中统一刷新到 DOM
```

多个 delta 在同一帧（~16ms）内合并为一次 DOM 更新。

### 2. textContent 替代 innerHTML

- 流式过程中用 `textContent`（或 TextNode.nodeValue）显示原始文本
- 无 HTML 解析、无 Trusted Types 检查开销
- 流结束后切换为 `innerHTML = restoreFromTranslation(...)` 做最终 HTML 渲染

### 3. 最小化 DOM 操作

- 每个段落对应一个 TextNode，流式中只更新 nodeValue
- 不创建/销毁中间 DOM 元素
- 完成后做一次性 DOM 结构替换

## 错误处理

- **流式中断**：保持已渲染内容，不回退到 loading 状态
- **runId 变化**：中止流式更新，保留已有内容
- **格式解析失败**：实时模式 fallback 到纯文本累积
- **兼容性**：streamRenderMode=disabled 时完全不影响现有代码路径，所有新逻辑通过条件分支隔离

## 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| src/config/api.js | 修改 | defaultApi 新增 streamRenderMode 字段 |
| src/libs/stream.js | 新增 | createRealtimeStreamParser 实时流式解析器 |
| src/libs/translator.js | 修改 | #translateNodeGroup 支持流式渲染、RAF 缓冲 |
| src/libs/batchQueue.js | 修改 | 生成器消费循环支持 onStreamChunk 回调路由 |
| src/apis/trans.js | 修改 | handleTranslateStreamInternal 支持中间态 yield |
| src/views/Options/Apis.js | 修改 | 新增 streamRenderMode 下拉框 UI |
| src/config/i18n.js | 修改 | 新增 i18n key |
