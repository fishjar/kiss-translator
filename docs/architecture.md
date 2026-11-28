# KISS Translator 核心系统架构

本文档面向深入参与开发的工程师与 AI 编程助手，梳理 `fishjar/kiss-translator` 的多端运行拓扑、六大核心子系统职责边界与关键源码入口。

> 本地环境搭建、构建与测试命令请参阅 [DEVELOPER.md](DEVELOPER.md)；模块级协议细则请参阅 [prompt-template-contract.md](contracts/prompt-template-contract.md) 与 [image-parse-results.md](contracts/image-parse-results.md)。

---

## 1. 多端运行拓扑

本项目共用核心 React UI 与翻译调度逻辑，通过 `REACT_APP_CLIENT` 与 `config-overrides.js` 编译为三类运行形态：

```mermaid
flowchart LR
    subgraph Page["网页进程（Untrusted Page World）"]
        DOM["页面 DOM / Shadow DOM"]
        InjSub["injector-subtitle.js<br/>（YouTube 字幕拦截）"]
        InjShadow["injector-shadowroot.js<br/>（ShadowRoot 监听）"]
    end

    subgraph Content["扩展内容脚本（Isolated World）"]
        CS["content.js<br/>网页翻译 / 划词 / 悬停 / 规则编辑器"]
        FB["fileBridge.js<br/>文件页安全桥接"]
    end

    subgraph ExtPages["扩展页面"]
        Popup["popup.js"]
        Options["options.js"]
        FileUI["fileTranslate.js"]
    end

    subgraph BG["后台服务（MV3 Service Worker）"]
        SW["background.js<br/>消息路由 / 网络代理 / 插件宿主 / 缓存"]
    end

    subgraph Offscreen["端侧 AI 运行时（Offscreen Document）"]
        OS["src/localAi/offscreen.ts"]
        Workers["Dedicated Web Workers<br/>LLM / VLM / OCR / ASR / TTS / Doc / JEV"]
    end

    DOM <--> CS
    InjSub <--> CS
    InjShadow <--> CS
    CS <--> SW
    FileUI <--> FB
    FB <--> SW
    Popup <--> SW
    Options <--> SW
    SW <--> OS
    OS <--> Workers
```

### 运行形态边界对比

| 形态 | 主入口 | 网络与权限机制 | 能力范围 |
| :--- | :--- | :--- | :--- |
| **浏览器扩展（Chrome/Edge/Firefox/Thunderbird）** | `src/background.js`、`src/content.js`、`src/popup.js`、`src/options.js`、`src/fileTranslate.js` | MV3 Service Worker + `webextension-polyfill` | 全量能力：网页/输入/划词/独立窗、接口插件、Local AI、文件翻译、YouTube 字幕与 ASR |
| **油猴脚本（桌面 / iOS Safari）** | `src/userscript.js` + `src/libs/gm.js` | `GM_xmlhttpRequest`（受脚本管理器跨域弹窗约束） | 核心网页翻译、划词与规则同步；不含 Local AI、接口插件与文件翻译 |
| **Web / 首页与在线设置页** | `src/index.js`、`src/homepage/` | 浏览器标准 `fetch` | 项目首页、油猴在线设置页与文件翻译前端（需配合扩展桥接或云端服务） |

---

## 2. 统一服务与插件宿主架构

所有云端服务、内置模型、外部接口插件与端侧 Local AI 通过 `src/providers/` 统一抽象为**按能力（Capability）注册与调用**的运行时：

```mermaid
flowchart TD
    Scene["业务场景<br/>网页 / 词典 / 字幕 / 视觉 / 摘要"]
    Invoke["src/providers/sceneInvocation.js<br/>场景参数组装与提示词解析"]
    Registry["src/providers/registry.js & capabilities.js<br/>服务发现与能力匹配"]

    Scene --> Invoke --> Registry

    Registry --> Builtin["内置服务插件<br/>src/builtin-plugins/"]
    Registry --> External["外部接口插件<br/>src/providers/declarative.js<br/>src/providers/scriptWorker.js"]
    Registry --> Local["端侧 Local AI<br/>src/libs/localAiBackground.js"]

    External --> NetGuard["网络白名单与本机授权<br/>src/providers/packageNetwork.js<br/>src/providers/originRules.js"]
```

- **核心模块与职责**：
  - `src/providers/registry.js` / `capabilities.js` / `sceneInvocation.js`：统一注册表、能力声明（翻译、词典、字幕断句、视觉解析、ASR、TTS 等）与场景调用入口。
  - `src/providers/defaultPrompts.js` / `sdk/template.js`：提示词占位符展开与空模板回退（契约见 [prompt-template-contract.md](contracts/prompt-template-contract.md)）。
  - `src/providers/packageStore.js` / `packageNetwork.js` / `scriptWorker.js`：外部插件安装、声明式规则（`http` / `protocol`）与独立 Worker 脚本执行；网络请求受插件声明的域名白名单限制，授权状态仅存本机。
  - `src/builtin-plugins/`：内置云端服务（OpenAI、Gemini、Claude、DeepSeek、Google、Microsoft、DeepL、Ollama、Qwen-MT 等）的标准适配器。
  - **仓库边界**：官方外部插件源码与目录索引维护在独立仓库 `fishjar/kiss-translator-plugins`，本仓库仅维护宿主运行时、SDK 与通用测试样例。

---

## 3. 端侧 Local AI 推理架构

Local AI 采用 **Vite 独立构建 + Offscreen Document + 专用 Web Workers** 架构，避免将庞大的 ONNX/WASM/WebGPU 运行时耦合进 CRA 主打包流程：

```mermaid
flowchart LR
    Host["Webpack 宿主<br/>src/libs/localAiBackground.js<br/>src/localAi/runtime/runtimeManager.webpack.js"]
    Offscreen["Offscreen Document<br/>src/localAi/offscreen.ts"]
    Pool["调度与运行时池<br/>src/localAi/runtime/runtimePool.ts<br/>src/localAi/runtime/taskScheduler.ts"]

    subgraph Workers["专用推理 Workers（Vite 产物 .local-ai-build/）"]
        W1["llm-worker.ts / llm-onnx-worker.ts"]
        W2["asr-worker.ts / tts-worker.ts"]
        W3["doc-worker.ts / jev-worker.ts"]
    end

    Storage["本地存储与缓存<br/>OPFS（模型权重） / IndexedDB（推理缓存）"]

    Host <-->|"Extension RPC"| Offscreen
    Offscreen --> Pool
    Pool --> W1
    Pool --> W2
    Pool --> W3
    W1 & W2 & W3 <--> Storage
```

- **双构建衔接**：`config-overrides.js` 将 `runtimeManager` 别名映射至 `src/localAi/runtime/runtimeManager.webpack.js`，实际推理产物由 `vite.config.local-ai.ts` 构建到 `.local-ai-build/`，并通过 `src/scripts/local-ai-cache.mjs` 做增量缓存。
- **关键源码入口**：
  - 模型目录与下载管理：`src/localAi/core/catalog.ts`、`downloadManager.ts`、`modelManager.ts`、`opfs.ts`
  - 硬件后端与内存调度：`src/localAi/core/deviceManager.ts`、`backendScheduler.ts`、`modelMemory.ts`
  - 推理结果缓存：`src/localAi/core/inferenceCache.ts`（缓存文本与结构化结果，不缓存二进制音视频/图片）

---

## 4. 文件与视觉翻译流水线

文件翻译模块支持 TXT、Markdown、PDF、EPUB 及图片（PNG/JPEG/WebP），将**前端解析/渲染**与**后台凭证/服务调用**严格隔离：

```mermaid
flowchart LR
    UI["src/views/FileTranslate/<br/>src/fileTranslate.js"]
    Bridge["src/fileBridge.js<br/>隔离桥接（不透传凭证）"]
    BG["src/background.js<br/>读取已保存场景配置与服务调用"]

    UI <--> Bridge <--> BG

    subgraph Parsers["格式解析与导出引擎"]
        TXT["src/fileTranslation/textSections.js"]
        PDF["src/libs/pdf/<br/>pdfParser / structure / formula / nativeTables"]
        EPUB["src/libs/epub/<br/>epubParser / epubStreamExport / epubPacker"]
        IMG["src/fileTranslation/imageParsing.js<br/>src/libs/imageTranslate/"]
    end

    UI --> Parsers
```

- **核心设计要点**：
  - `src/fileBridge.js` 与 `src/fileTranslation/protocol.js` 定义桥接协议：前端页面只声明任务类型与内容，不接触 API Key；由后台按当前保存的场景配置执行服务调用。
  - **视觉解析统一协议**：文件图片、网页图片、截图与 PDF 文字区域共享结构化视觉结果校验与译文复用逻辑（详见 [image-parse-results.md](contracts/image-parse-results.md)）。
  - **大文件与流式导出**：`src/fileTranslation/resultCache.js` 与 `src/libs/epub/epubStreamExport.js` 支持分阶段缓存与流式打包导出，避免大文档内存溢出。

---

## 5. YouTube 双语字幕与 ASR 流水线

YouTube 字幕模块横跨页面上下文与扩展隔离环境，支持原生字幕抓取、AI 语义断句以及可选的端侧/云端 ASR 语音转写：

- **字幕获取**：`src/injector-subtitle.js`（Firefox 辅以 `src/subtitleBootstrap.js`）在页面上下文拦截字幕轨道数据，交由 `src/subtitle/YouTubeCaptionProvider.js` 与 `src/subtitle/youtubeAcquisition.js` 解析（含 VTT 与 SABR 协议处理）。
- **合并与断句**：`src/subtitle/sentenceBreaker.js` 执行基础启发式合并，`src/subtitle/youtubeAiSegmentation.js` 与 `subtitleBoundaryProtocol.js` 负责 AI 语义断句与上下文衔接。
- **可选 ASR 管线**：`src/subtitle/asr/` 负责音频分片拉取（`sabrProtocol.js`、`aacDecoder.js`、`pcmPipeline.js`）、重采样（`resample.js`）、分片转写（`transcribeChunk.js`）与缓存恢复。
- **渲染与交互**：`src/subtitle/BilingualSubtitleManager.js`、`youtubePlayerUi.js`、`YouTubeSubtitleList.js` 与 `wordHover.js` 负责双语字幕叠加、字幕列表、悬停查词与生词收藏。

---

## 6. 存储、规则引擎与多端同步

- **网页翻译与规则引擎**：
  - `src/libs/translatorManager.js` / `translator.js` / `domManager.js`：负责 DOM 扫描、批量聚合队列（`batchQueue.js`）、视口交叉观察与富文本/Shadow DOM 渲染。
  - `src/libs/rules.js` & `src/libs/subRules.js`：实现三层规则覆盖优先级 **个人规则 > 订阅规则 > 全局规则**。
  - `src/libs/ruleEditor*.js`：可视化元素选择器，所有编辑在草稿态完成，保存后才落盘并触发同步。
- **存储协调与多端同步**：
  - `src/libs/storage.js` / `storageCoordination.js` / `storageSyncController.js`：统一封装扩展存储与状态一致性协调。
  - `src/libs/sync.js` & `src/libs/syncCrypto.js`：支持通过 `KISS-Worker` 或 WebDAV 进行全量配置同步与可选端到端加密。
- **诊断与隐私保护**：
  - `src/libs/diagnostics/`：统一日志采集与导出，`privacy.js` 负责对敏感凭据与令牌进行脱敏处理。
