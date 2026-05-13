# 流式渲染功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在页面内嵌翻译中支持流式渲染，让用户更快看到翻译结果，支持实时渲染、片段渲染、不启用三种模式。

**Architecture:** 通过 onStreamChunk 回调穿透 apiTranslate → BatchQueue → handleTranslateStreamInternal 链路，Translator 在回调中做增量 DOM 更新。实时模式用 createRealtimeStreamParser 追踪段落边界，片段模式复用现有解析器。RAF 缓冲保证性能。

**Tech Stack:** JavaScript (ES2020+), DOM API, requestAnimationFrame, @streamparser/json

---

### Task 1: 配置层 — 新增 streamRenderMode 字段

**Files:**
- Modify: `src/config/api.js:576-614` (defaultApi)

- [ ] **Step 1: 在 defaultApi 中新增 streamRenderMode 字段**

在 `src/config/api.js` 的 `defaultApi` 对象中，在 `useStream: false` 行之后新增：

```js
useStream: false, // 是否启用流式传输
streamRenderMode: "disabled", // 流式渲染模式：disabled/realtime/segment
```

- [ ] **Step 2: 验证改动**

Run: `grep -n "streamRenderMode" src/config/api.js`
Expected: 一行结果，显示在 defaultApi 对象内

- [ ] **Step 3: Commit**

```bash
git add src/config/api.js
git commit -m "feat: add streamRenderMode field to defaultApi config"
```

---

### Task 2: i18n — 新增翻译文本

**Files:**
- Modify: `src/config/i18n.js` (i18n 对象)

- [ ] **Step 1: 在 `use_stream` 条目之后新增三个 i18n key**

在 `src/config/i18n.js` 中找到 `use_stream:` 条目（约第 2083 行），在其后新增：

```js
stream_render_mode: {
  zh: `流式渲染模式`,
  en: `Stream render mode`,
  zh_TW: `串流渲染模式`,
  ja: `ストリーミングレンダリングモード`,
  ko: `스트리밍 렌더링 모드`,
},
stream_render_realtime: {
  zh: `实时渲染`,
  en: `Realtime render`,
  zh_TW: `即時渲染`,
  ja: `リアルタイムレンダリング`,
  ko: `실시간 렌더링`,
},
stream_render_segment: {
  zh: `片段渲染`,
  en: `Segment render`,
  zh_TW: `片段渲染`,
  ja: `セグメントレンダリング`,
  ko: `세그먼트 렌더링`,
},
```

- [ ] **Step 2: Commit**

```bash
git add src/config/i18n.js
git commit -m "feat: add i18n keys for stream render mode"
```

---

### Task 3: UI — Options 页面新增 streamRenderMode 下拉框

**Files:**
- Modify: `src/views/Options/Apis.js` (ApiFields 组件)

- [ ] **Step 1: 在解构中新增 streamRenderMode 变量**

在 `src/views/Options/Apis.js` 约第 225 行附近的解构赋值中，在 `useStream = false` 之后新增：

```js
useStream = false,
streamRenderMode = "disabled",
```

- [ ] **Step 2: 新增联动逻辑 — useStream 变为 false 时重置 streamRenderMode**

在约第 148 行附近的 `handleChange` 函数中，找到：
```js
if (name === "useBatchFetch" && value === false) {
  newData.useStream = false;
}
```
在其后新增：
```js
if (name === "useStream" && value === false) {
  newData.streamRenderMode = "disabled";
}
```

- [ ] **Step 3: 在 useStream 下拉框之后新增 streamRenderMode 下拉框**

找到 useStream 的 `</Grid>` 闭合标签和后续 `</Grid>` container（约第 627 行），在 useStream 的 `</Grid>` 之后新增：

```jsx
{API_SPE_TYPES.stream.has(api.apiType) && useBatchFetch && useStream && (
  <Grid item xs={12} sm={12} md={6} lg={3}>
    <TextField
      select
      fullWidth
      size="small"
      name="streamRenderMode"
      value={streamRenderMode}
      label={i18n("stream_render_mode")}
      onChange={handleChange}
    >
      <MenuItem value="disabled">{i18n("disable")}</MenuItem>
      <MenuItem value="realtime">{i18n("stream_render_realtime")}</MenuItem>
      <MenuItem value="segment">{i18n("stream_render_segment")}</MenuItem>
    </TextField>
  </Grid>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/views/Options/Apis.js
git commit -m "feat: add streamRenderMode dropdown in API settings UI"
```

---

### Task 4: BatchQueue — 支持流式回调路由

**Files:**
- Modify: `src/libs/batchQueue.js` (processQueue 生成器消费循环)

- [ ] **Step 1: 修改生成器消费循环，支持 onStreamChunk 回调**

在 `src/libs/batchQueue.js` 中，找到约第 70-86 行的生成器消费循环：

```js
if (generator && typeof generator[Symbol.asyncIterator] === "function") {
  for await (const { id, result } of generator) {
    const taskItem = tasksToProcess[id];
    if (taskItem && !taskItem.resolved) {
      taskItem.resolved = true;
      taskItem.resolve(result);
    }
  }
  // 处理没有收到结果的 task
  ...
```

替换为：

```js
if (generator && typeof generator[Symbol.asyncIterator] === "function") {
  for await (const item of generator) {
    const id = item.id;
    const isComplete = item.isComplete !== false; // 缺省为 true
    const taskItem = tasksToProcess[id];

    if (taskItem) {
      // 流式中间态回调（实时模式）
      if (!isComplete && taskItem.args?.onStreamChunk) {
        taskItem.args.onStreamChunk({
          id,
          text: item.partialText,
          isComplete: false,
        });
      }
      // 段落完成时：回调 + resolve
      if (isComplete) {
        if (taskItem.args?.onStreamChunk) {
          taskItem.args.onStreamChunk({
            id,
            text: item.result,
            isComplete: true,
          });
        }
        if (!taskItem.resolved) {
          taskItem.resolved = true;
          taskItem.resolve(item.result);
        }
      }
    }
  }
  // 处理没有收到结果的 task
  ...
```

注意：只修改 `for await` 循环体，`// 处理没有收到结果的 task` 及后续代码保持不变。

- [ ] **Step 2: Commit**

```bash
git add src/libs/batchQueue.js
git commit -m "feat: support onStreamChunk callback routing in BatchQueue generator loop"
```

---

### Task 5: 实时流式解析器 — createRealtimeStreamParser

**Files:**
- Modify: `src/libs/stream.js` (新增导出函数)

- [ ] **Step 1: 在 stream.js 末尾新增 createRealtimeStreamParser 函数**

在 `src/libs/stream.js` 文件末尾（`detectStreamFormat` 函数之后）新增：

```js
/**
 * 创建实时流式解析器
 * 追踪段落边界，输出每个段落的实时文本累积
 * @returns {{ write: (delta: string) => Array<{id: number, partialText: string, isComplete: boolean}> }}
 */
export function createRealtimeStreamParser() {
  let format = null; // "xml" | "json" | "line" | null
  let buffer = "";
  let currentId = -1;
  let currentText = "";

  const detect = (content) => {
    const stripped = content.trim();
    if (stripped.search(/[{[]/) !== -1) return "json";
    if (stripped.search(/<(t|item|seg)\s/i) !== -1) return "xml";
    if (stripped.search(/^\d+\s*\|/m) !== -1) return "line";
    return null;
  };

  const parseXml = (content) => {
    const results = [];
    // 找所有已闭合的段落
    const closedRegex =
      /<(t|item|seg)\s+id="(\d+)"(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = closedRegex.exec(content)) !== null) {
      const id = parseInt(match[2], 10);
      results.push({ id, partialText: match[3], isComplete: true });
    }
    // 找最后一个未闭合的段落（当前正在流式输出的）
    const openRegex =
      /<(t|item|seg)\s+id="(\d+)"(?:\s[^>]*)?>([^]*)$/;
    // 先移除所有已闭合标签，检查尾部
    let remaining = content;
    remaining = remaining.replace(
      /<(t|item|seg)\s+id="\d+"(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,
      ""
    );
    const openMatch = remaining.match(openRegex);
    if (openMatch) {
      const id = parseInt(openMatch[2], 10);
      const partialText = openMatch[3].replace(/<\/[^>]*$/, ""); // 移除可能的半截闭合标签
      results.push({ id, partialText, isComplete: false });
    }
    return results;
  };

  const parseLine = (content) => {
    const results = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const pipeMatch = trimmed.match(/^(\d+)\s*\|\s*(.*)/);
      if (pipeMatch) {
        const id = parseInt(pipeMatch[1], 10);
        const text = pipeMatch[2].trim().replace(/<br\s*\/?>/gi, "\n");
        const isComplete = i < lines.length - 1; // 非最后一行视为完成
        results.push({ id, partialText: text, isComplete });
      }
    }
    return results;
  };

  return {
    write(delta) {
      buffer += delta;
      if (!format) {
        format = detect(buffer);
        if (!format) return [];
      }

      switch (format) {
        case "xml":
          return parseXml(buffer);
        case "line":
          return parseLine(buffer);
        case "json":
          // JSON 格式使用 @streamparser/json 逐对象解析
          // 这里只做简单的累积，由外部 createStreamingJsonParser 处理
          return [];
        default:
          return [];
      }
    },
    getFormat() {
      return format;
    },
    getBuffer() {
      return buffer;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/libs/stream.js
git commit -m "feat: add createRealtimeStreamParser for real-time paragraph boundary tracking"
```

---

### Task 6: handleTranslateStreamInternal — 支持实时模式中间态 yield

**Files:**
- Modify: `src/apis/trans.js` (handleTranslateStreamInternal 函数)

- [ ] **Step 1: 修改函数签名，接收 streamRenderMode 参数**

在 `src/apis/trans.js` 中，`handleTranslateStreamInternal` 的参数解构（约第 1169-1173 行）改为：

```js
async function* handleTranslateStreamInternal(
  texts,
  input,
  init,
  { apiType, history, userMsg, usePool, fetchInterval, fetchLimit, httpTimeout, streamRenderMode }
) {
```

- [ ] **Step 2: 在函数内新增实时解析器初始化**

在 `handleTranslateStreamInternal` 函数体中，`const jsonParser = createStreamingJsonParser();` 之后（约第 1179 行后）新增：

```js
const realtimeParser =
  streamRenderMode === "realtime" ? createRealtimeStreamParser() : null;
```

并在文件顶部的 import 中新增（如果还没有的话）：

```js
import { createStreamingJsonParser, createRealtimeStreamParser, parseStreamingSegments, detectStreamFormat, getStreamDelta } from "../libs/stream";
```

注意：检查已有的 import，将 `createRealtimeStreamParser` 添加到已有的 stream.js import 语句中。

- [ ] **Step 3: 在 delta 处理循环中新增实时模式分支**

在 `for await (const rawData of fetchStream(...))` 循环内，`if (delta) {` 块的末尾（约第 1227 行的 `}` 之前），新增实时模式处理：

```js
// 实时渲染模式：yield 段落级中间态
if (realtimeParser && streamRenderMode === "realtime") {
  const items = realtimeParser.write(delta);
  for (const { id, partialText, isComplete } of items) {
    if (isComplete) {
      // 段落完成，由后续的 parseStreamingSegments/jsonParser 处理
    } else {
      yield { id, partialText, isComplete: false };
    }
  }
}
```

这段代码放在 `if (delta) { ... }` 块的最末尾（在 `fullContent += delta` 和格式检测/解析逻辑之后），这样实时模式的中间态 yield 不会干扰现有解析逻辑。

- [ ] **Step 4: 修改 handleTranslate 传参**

在 `handleTranslate` 函数中（约第 1124 行），将 `streamRenderMode` 传入 `handleTranslateStreamInternal`：

找到：
```js
if (enableStream) {
  yield* handleTranslateStreamInternal(texts, input, init, {
    apiType,
    history,
    userMsg,
    usePool,
    fetchInterval,
    fetchLimit,
    httpTimeout,
  });
}
```

改为：
```js
if (enableStream) {
  yield* handleTranslateStreamInternal(texts, input, init, {
    apiType,
    history,
    userMsg,
    usePool,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    streamRenderMode: apiSetting.streamRenderMode || "disabled",
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/apis/trans.js
git commit -m "feat: handleTranslateStreamInternal supports realtime mode intermediate yields"
```

---

### Task 7: apiTranslate — 传递 onStreamChunk 回调到 BatchQueue

**Files:**
- Modify: `src/apis/index.js` (apiTranslate 函数)

- [ ] **Step 1: 从 args 解构 onStreamChunk 并传递到 addTask**

在 `src/apis/index.js` 中，`apiTranslate` 函数内，找到约第 526 行的 `useBatchFetch` 分支：

```js
translation = await queue.addTask(text, {
  from,
  to,
  fromLang,
  toLang,
  langMap,
  glossary,
  apiSetting,
  usePool,
});
```

改为：

```js
translation = await queue.addTask(text, {
  from,
  to,
  fromLang,
  toLang,
  langMap,
  glossary,
  apiSetting,
  usePool,
  onStreamChunk,
});
```

然后在 `apiTranslate` 函数的参数解构处（找到 `const { text, fromLang, toLang, apiSetting, glossary } = args;`），新增 `onStreamChunk`：

```js
const { text, fromLang, toLang, apiSetting, glossary, onStreamChunk } = args;
```

- [ ] **Step 2: Commit**

```bash
git add src/apis/index.js
git commit -m "feat: pass onStreamChunk callback through apiTranslate to BatchQueue"
```

---

### Task 8: Translator — #translateFetch 传递 onStreamChunk 和 streamRenderMode

**Files:**
- Modify: `src/libs/translator.js` (#translateFetch 方法)

- [ ] **Step 1: 修改 #translateFetch 以支持流式渲染回调**

在 `src/libs/translator.js` 中，找到 `#translateFetch` 方法（约第 1590 行）。

修改方法签名和参数传递。找到：

```js
#translateFetch(text, deLang = "") {
  const { toLang, transStartHook } = this.#rule;
  const fromLang = deLang || this.#rule.fromLang;
  const apiSetting = { ...this.#apiSetting };
  const glossary = { ...this.#glossary };
  const apisMap = this.#apisMap;

  const args = {
    text,
    fromLang,
    toLang,
    apiSetting,
    glossary,
  };
```

改为：

```js
#translateFetch(text, deLang = "", onStreamChunk = null) {
  const { toLang, transStartHook } = this.#rule;
  const fromLang = deLang || this.#rule.fromLang;
  const apiSetting = { ...this.#apiSetting };
  const glossary = { ...this.#glossary };
  const apisMap = this.#apisMap;

  const args = {
    text,
    fromLang,
    toLang,
    apiSetting,
    glossary,
    onStreamChunk,
  };
```

- [ ] **Step 2: Commit**

```bash
git add src/libs/translator.js
git commit -m "feat: #translateFetch accepts onStreamChunk callback parameter"
```

---

### Task 9: Translator — #translateNodeGroup 流式渲染逻辑

**Files:**
- Modify: `src/libs/translator.js` (#translateNodeGroup 方法)

这是最核心的改动。需要在 `#translateNodeGroup` 中根据 `streamRenderMode` 分流：disabled 走现有逻辑，realtime/segment 走流式渲染。

- [ ] **Step 1: 在 #translateNodeGroup 中读取 streamRenderMode 并构建流式回调**

在 `#translateNodeGroup` 方法中，找到约第 1302 行：

```js
const currentRunId = this.#runId;
const { trText: translatedText, isSame: isSameLang } =
  await this.#translateFetch(processedString, deLang);
```

在 `const currentRunId = this.#runId;` 之后，新增流式渲染逻辑：

```js
const currentRunId = this.#runId;

// 流式渲染模式
const streamRenderMode = this.#apiSetting.streamRenderMode || "disabled";
const isStreamRender = streamRenderMode !== "disabled" && this.#apiSetting.useStream && this.#apiSetting.useBatchFetch;

// RAF 缓冲
let rafId = null;
let pendingText = "";
let hasFirstChunk = false;
const innerRef = inner; // 闭包引用

const flushPendingText = () => {
  if (!hasFirstChunk) {
    // 首次 delta：移除 loading，创建文本节点
    innerRef.textContent = "";
    innerRef.appendChild(document.createTextNode(pendingText));
    hasFirstChunk = true;
  } else {
    // 后续 delta：更新文本节点
    const textNode = innerRef.firstChild;
    if (textNode) {
      textNode.nodeValue = pendingText;
    }
  }
  rafId = null;
};

const onStreamChunk = isStreamRender
  ? (chunk) => {
      if (this.#runId !== currentRunId) return;
      const { text, isComplete } = chunk;
      if (!text) return;

      if (isComplete) {
        // 段落完成：立即刷新缓冲
        pendingText = Array.isArray(text) ? text[0] : text;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        flushPendingText();
      } else {
        // 实时中间态：RAF 缓冲合并
        pendingText = text;
        if (!rafId) {
          rafId = requestAnimationFrame(flushPendingText);
        }
      }
    }
  : null;
```

- [ ] **Step 2: 修改 translateFetch 调用，传入 onStreamChunk**

将：
```js
const { trText: translatedText, isSame: isSameLang } =
  await this.#translateFetch(processedString, deLang);
```

改为：
```js
const { trText: translatedText, isSame: isSameLang } =
  await this.#translateFetch(processedString, deLang, onStreamChunk);
```

- [ ] **Step 3: 在 translateFetch 完成后清理 RAF**

在 `await this.#translateFetch(...)` 之后，runId 检查之前，新增 RAF 清理：

```js
// 清理 RAF 缓冲
if (rafId) {
  cancelAnimationFrame(rafId);
  rafId = null;
}
```

- [ ] **Step 4: 验证完整流程**

最终的 `#translateNodeGroup` 核心流程（约第 1302-1330 行区域）变为：

```js
const currentRunId = this.#runId;

// 流式渲染模式
const streamRenderMode = this.#apiSetting.streamRenderMode || "disabled";
const isStreamRender = streamRenderMode !== "disabled" && this.#apiSetting.useStream && this.#apiSetting.useBatchFetch;

// RAF 缓冲
let rafId = null;
let pendingText = "";
let hasFirstChunk = false;
const innerRef = inner;

const flushPendingText = () => {
  if (!hasFirstChunk) {
    innerRef.textContent = "";
    innerRef.appendChild(document.createTextNode(pendingText));
    hasFirstChunk = true;
  } else {
    const textNode = innerRef.firstChild;
    if (textNode) {
      textNode.nodeValue = pendingText;
    }
  }
  rafId = null;
};

const onStreamChunk = isStreamRender
  ? (chunk) => {
      if (this.#runId !== currentRunId) return;
      const { text, isComplete } = chunk;
      if (!text) return;

      if (isComplete) {
        pendingText = Array.isArray(text) ? text[0] : text;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        flushPendingText();
      } else {
        pendingText = text;
        if (!rafId) {
          rafId = requestAnimationFrame(flushPendingText);
        }
      }
    }
  : null;

const { trText: translatedText, isSame: isSameLang } =
  await this.#translateFetch(processedString, deLang, onStreamChunk);

// 清理 RAF 缓冲
if (rafId) {
  cancelAnimationFrame(rafId);
  rafId = null;
}

if (this.#runId !== currentRunId) {
  throw new Error("Request terminated");
}
```

后续的 `inner.innerHTML = trustedHTML` 和翻译节点注册逻辑**保持不变**。流式渲染中的 textContent 是中间态，最终的 innerHTML 赋值会完成正式渲染。

- [ ] **Step 5: Commit**

```bash
git add src/libs/translator.js
git commit -m "feat: #translateNodeGroup supports streaming render with RAF buffer"
```

---

### Task 10: 集成验证

**Files:**
- All modified files

- [ ] **Step 1: 检查构建是否通过**

Run: `cd /Users/mac/Code/kiss-translator && npm run build 2>&1 | head -30`
Expected: 无错误

- [ ] **Step 2: 检查所有修改文件的语法**

Run: `node -e "require('./src/config/api.js')" 2>&1 || echo "api.js check done"`
Expected: 无严重错误（可能有 export 相关的 module 错误，这在非 ESM 环境下正常）

- [ ] **Step 3: 用 grep 确认所有新增代码引用的变量/函数都已定义**

Run:
```bash
grep -rn "streamRenderMode" src/ --include="*.js"
grep -rn "onStreamChunk" src/ --include="*.js"
grep -rn "createRealtimeStreamParser" src/ --include="*.js"
```

Expected:
- `streamRenderMode` 出现在 api.js, Apis.js, translator.js, trans.js
- `onStreamChunk` 出现在 index.js, batchQueue.js, translator.js, trans.js
- `createRealtimeStreamParser` 出现在 stream.js (定义) 和 trans.js (引用)

- [ ] **Step 4: Final commit (if any fixes)**

```bash
git add -A
git commit -m "chore: integration verification for streaming render feature"
```
