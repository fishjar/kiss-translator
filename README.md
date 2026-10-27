# KISS Translator 简约翻译

[English](README.en.md) | [中文](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

[![GitHub Release](https://img.shields.io/github/v/release/fishjar/kiss-translator?color=blue)](https://github.com/fishjar/kiss-translator/releases)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL_3.0-green.svg)](https://github.com/fishjar/kiss-translator/blob/master/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/fishjar/kiss-translator/pulls)

一个简约、开源的 [双语对照翻译扩展 & 油猴脚本](https://github.com/fishjar/kiss-translator)。

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 感谢以下赞助商对本项目的支持

<table>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/8c5f141d-9d13-46b0-832f-f6884db4e5d5" width="600" /></td>
    <td>
      <a href="https://go.apimart.ai/gh-gotranslatorrr" target="_blank">
        <b>APIMart</b> 是专注 AI 图片/视频生成的低价 API 平台，GPT-Image-2 低至 $0.006/张，1 美元可出图 160+ 张。图片、视频一套异步 API 通吃，提交任务拿 ID、回调取结果，跑批万张不超时、换模型不改代码。按量付费、无月费，通过此注册链接注册即可开用。
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="https://platform.ephone.ai/logo-e.png" width="96" /></td>
    <td>
      <a href="https://platform.ephone.ai/" target="_blank">
        <b>ePhone AI</b> 是一个面向开发者的 AI 模型 API 中转与聚合平台，支持 OpenAI、Claude、Gemini、DeepSeek、GLM 等多家大模型。
      </a>
    </td>
  </tr>
</table>

## 功能概览

> **提示**：本文档对应当前分支代码，新增功能（接口插件、本地 AI、文件翻译及剪贴板自动翻译等）目前面向 Chrome/Edge、Firefox 扩展版本提供，油猴脚本及其他客户端暂不包含这些入口。具体 AI 能力取决于所用浏览器、设备硬件及所选模型。

### 翻译场景与交互

- **多场景覆盖**：支持网页双语对照翻译、输入框即时翻译、划词查词与鼠标悬停翻译；完美支持富文本排版、自定义译文样式，并支持「仅显示译文（隐藏原文）」。
- **查词与对比面板**：提供翻译浮窗与独立对比窗口，支持多个翻译服务横向对照、柯林斯/内置英文词典查词与生词本收藏，支持可选的剪贴板自动翻译。
- **YouTube 双语字幕**：支持基础智能合并算法与 AI 语义断句，提供自定义字幕样式、完整对照列表、字幕悬停查词、生词收藏以及基于字幕的 AI 视频总结。

### 服务配置与接口插件

- **海量内置服务**：涵盖主流传统与 AI 翻译服务，包括 Google、Microsoft、Baidu、Tencent、Volcengine、DeepL/DeepLX，以及 OpenAI、Gemini、Claude、Ollama、DeepSeek、OpenRouter、OrcaRouter、Requesty、AzureAI、CloudflareAI，并支持 Chrome 浏览器内置 AI 与本地 AI。
- **按能力自由选用**：按文本翻译、词典查词、字幕断句、OCR 识别、语音合成等能力独立配置服务与模型参数；根据模型能力无缝支持批量聚合翻译、流式输出、上下文记忆对话、AI 专业术语及思考链（Reasoning）配置。
- **接口插件体系**：官方与外部插件分列表展示，点击联网安装；也可通过 ZIP、本地文件夹、GitHub 项目根地址或 HTTPS 链接导入。请求受声明的网络范围限制，支持手动更新及配置实例升级。
- **开放自定义协议**：任意非标准 API 均可通过插件实现对接。详细开发指引请参阅 [插件开发指南](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md)、[OpenAI 兼容协议插件](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md) 和 [DeepSeek 插件](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md)。

### 本地 AI（边缘端计算）

- **全流程端侧多模态**：内置模型中心，支持模型的下载、删除与设备环境选择（GPU/CPU）；提供涵盖 LLM 文本生成、VLM 图像理解、OCR 文字识别、ASR 语音识别、TTS 语音合成、JEV 判定和版面分析的独立功能测试页。
- **运行控制与缓存**：支持实时查看运行状态与调试日志、手动停止推理任务、卸载内存/显存中的已加载模型；支持文本与结构化推理结果缓存（二进制音频/图片暂不缓存）。
- **隐私与轻量纯离线**：模型下载完成后所有计算均在本机设备运行，保护数据隐私；云端服务保持原有网络请求逻辑。（可用性、推理速度与内存占用取决于具体硬件环境与模型大小）。

### 文件翻译

- **多格式支持与能力拆分**：支持 TXT、Markdown、PDF、EPUB 电子书，以及 PNG、JPEG、WebP 图片；各阶段可独立选用专用的翻译、OCR 识别、版面分析与表格/公式解析服务。
- **PDF 深度解析**：支持原文阅读、版面结构检测、文字识别、表格/公式解析与分阶段翻译及结果缓存；支持导出为 Markdown、单文件 HTML 或带资源的 ZIP 包（不还原 PDF 排版，不导出 PDF）。
- **EPUB 电子书翻译**：支持按章节阅读/单章翻译、整本图书批量翻译、自定义阅读排版样式；支持导出双语 EPUB、纯译文 EPUB 或当前章节 HTML。
- **纯文本与图片翻译**：TXT 支持下载双语对照或纯译文；Markdown 支持导出翻译后 Markdown/HTML；图片支持文字识别、选区翻译及译文图片（PNG）下载。

### 规则、设置与同步

- **智能与自定义规则**：支持网页内容自动识别扫描；提供可视化元素选取器，支持草稿编辑、撤销/重做、翻译范围高亮预览；支持规则订阅、导出分享及个人专业术语库。
- **配置管理与测试套件**：提供设置全局搜索、系统提示词模板管理、服务连通性测试工具、术语库与字幕断句调试工具。
- **多端数据同步**：支持通过 [KISS-Worker](https://github.com/fishjar/kiss-worker)（基于 Cloudflare Workers 或 Docker 自建）或标准 WebDAV 协议进行全量配置跨设备同步。
- **自定义全局快捷键**：
  - `Alt+Q`：开启/切换网页翻译
  - `Alt+D`：打开独立翻译窗口
  - `Alt+K`：打开设置浮窗
  - `Alt+S`：打开翻译弹窗 / 翻译选中文字
  - `Alt+O`：直接打开完整设置页
  - `Alt+I`：翻译当前光标所在输入框

## 快速上手

### 基础使用（3 步极速上手）

1. **添加翻译服务**：打开扩展设置中的「服务配置」，添加所需内置服务，填写 API 地址、API Key 和模型名称，点击「测试」确认可用后保存。
2. **场景关联服务**：在「场景设置」中（网页翻译、划词查词、输入框翻译或字幕翻译）勾选对应服务（仅具备对应能力的服务会出现在列表中）；可在「提示词管理」中定制 Prompt 模板。
3. **启动翻译体验**：点击网页浮动图标或使用快捷键 `Alt+Q` 启动网页翻译；使用 `Alt+D` 打开独立窗口可同时对比多个服务的翻译质量。

### 进阶功能上手

- **使用接口插件**：在「接口插件」页面导入 ZIP 文件、文件夹或 GitHub/HTTPS 仓库链接，完成权限检查并授权；随后在「服务配置 → 添加 → 外部插件」中创建服务实例并配置使用。（注：授权属于本机状态，同步到新设备后需重新授权）。
- **启用本地 AI**：打开「本地 AI」模块，先检测设备环境（WebGPU/WASM 等）；在「模型中心」下载所需任务模型，并在任务测试页调试；随后在「服务配置」中添加对应的本地 AI 服务并在各场景中选用。
- **文档与图片翻译**：打开「文件翻译」页面，上传文件并设定源语言与目标语言；分别选择识别与翻译服务后点击处理。PDF 支持逐步执行版面识别与翻译，EPUB 支持单章或全书翻译，处理完成后选择相应格式导出。

## 安装

> **建议优先使用浏览器扩展**：
>
> - 浏览器扩展提供更完整的能力（本地语言识别、独立窗口、文件翻译、本地 AI、右键菜单等）。
> - 油猴脚本受浏览器沙箱限制，缺少扩展专有 API，且可能遇到跨域或脚本管理器兼容性问题。

### 浏览器扩展

- **Chrome**：[Chrome 应用商店安装](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=zh-CN)（Android 端支持 Kiwi 浏览器，iOS 端支持 Orion 浏览器）
- **Edge**：[Edge 外接程序安装](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=zh-CN)
- **Firefox**：[Firefox 附加组件安装](https://addons.mozilla.org/zh-CN/firefox/addon/kiss-translator/)
- **Thunderbird**：[GitHub Releases 下载 xpi](https://github.com/fishjar/kiss-translator/releases)
- **Safari**：暂未支持（Mac / iOS 规划中）

### 油猴脚本

- **桌面端（Chrome / Edge / Firefox）**：安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 后点击安装：
  - [直接安装脚本（GitHub Pages）](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)
  - [Greasy Fork 脚本主页](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
- **iOS Safari**：安装 [Userscripts Safari](https://github.com/quoid/userscripts) 扩展后点击安装：
  - [直接安装 iOS 专用脚本](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)

## 关联项目

- **[KISS-Worker](https://github.com/fishjar/kiss-worker)**：自建跨设备数据同步服务，支持 Cloudflare Workers 无服务器部署或 Docker 私有化部署，兼顾数据私密性与私有规则分享。
- **[kiss-rules](https://github.com/fishjar/kiss-rules)**：社区维护的规则库，提供最新、最全的网站适配订阅规则，亦可交流和求助特定网站规则编写。

## 常见问题

### 如何设置自定义快捷键？

由于浏览器快捷键管理的限制，需要在浏览器内置的管理页中进行设置：

- **Chrome / Edge**：地址栏访问 `chrome://extensions/shortcuts`
- **Firefox**：地址栏访问 `about:addons`，点击右上角齿轮图标选择「管理扩展快捷键」

### 翻译规则的生效优先级是怎样的？

规则按照以下层级覆盖生效：
**个人规则 > 订阅规则 > 全局规则**（全局规则作为基础默认配置）。

### 如何在网页上可视化编辑规则？

1. 打开网页翻译面板，点击「编辑网站规则」，选择规则用途（如翻译目标、排除区域、保留原文等）。
2. 在网页上点击目标元素，或手动输入 CSS 选择器。支持调整祖先路径层级、对比定位候选并实时查看匹配元素数量。
3. **草稿机制**：所有的修改、删除与撤销/重做均仅保存在临时草稿中；点击「保存规则」后才会真正写入并触发数据同步。「预计翻译范围」仅对当前已加载的 DOM 节点进行高亮预览，不向翻译服务发送请求。
4. **继承与重置**：「恢复此组继承」将重新沿用订阅或全局规则；「清空此组」设置显式空值（清空根容器将不再扫描整页）。
5. _注：可视化选取目前支持桌面端标准 DOM 页面，暂不支持 iframe 内部嵌套、Shadow DOM 内部、Canvas 渲染文本及触屏手势。_

### 服务测试失败怎么办？

- **核对连接信息**：请仔细核对接口协议、API 地址、API Key 及模型名称是否匹配。若服务或模型不支持批量聚合或流式传输，请关闭对应开关。
- **Ollama 本地服务**：内置的 Ollama 适配使用 OpenAI 兼容协议（请确保路径正确，非 `/api/chat` 原生协议）；本机调用时需注意服务启动状态与跨域配置（如设置环境变量 `OLLAMA_ORIGINS=*`），详情参考 [Ollama 连接问题 #174](https://github.com/fishjar/kiss-translator/issues/174)。
- **外部插件服务**：请先在「接口插件」页面完成插件授权，再进行服务测试。若需调整协议或请求体，请在插件声明式规则或源码中调整并升级实例。

### 为什么在设置中找不到本地 AI、文件翻译或接口插件入口？

- 这些高级功能入口目前仅在 Chrome/Edge、Firefox 的桌面扩展版本中提供。
- 若使用商店已发布版本，可能因审核周期尚未同步当前代码分支的最新功能。
- 在部分设备上，若浏览器缺少必要特性（如 WebGPU 支持）或本地模型未下载完成，相关操作按钮可能会处于禁用或未就绪状态。

### 油猴脚本如何访问外部服务及进入设置页？

- **跨域授权**：油猴脚本发起网络请求时，必须在脚本管理器弹窗中允许对应域名的访问权限。
- **功能差异**：接口插件与本地 AI 目前仅限浏览器扩展使用，油猴脚本暂不支持。
- **设置页面**：可随时直接访问在线版 [油猴脚本设置页面](https://fishjar.github.io/kiss-translator/options.html)。

## 未来规划

本项目为业余开源项目，无严格发布时间表，非常欢迎社区共建与提交 PR！

- [x] **聚合发送文本**：优化请求策略，减少翻译接口调用次数，提升性能。
- [x] **增强富文本翻译**：支持复杂页面结构与富文本格式的准确翻译。
- [x] **强化自定义/AI 接口**：支持流式传输、上下文记忆、多轮对话等高级 AI 功能。
- [x] **英文词典备灾机制**：当翻译服务失效时，可切换其他词典或 fallback 到本地词典查询。
- [x] **优化 YouTube 字幕支持**：改进流式字幕的合并与翻译体验，减少断句。
- [x] **支持边缘 AI 计算**：本地轻量 LLM、VLM、ASR、OCR、TTS、JEV 和版面分析辅助翻译。
- [x] **支持文档与图片翻译**：支持 TXT、Markdown、PDF、EPUB 和 PNG/JPEG/WebP 图片翻译。
- [ ] **分布式共享平台**：引入分布式共享机制，用于便捷分享字幕、规则等。
- [ ] **翻译 Agent**：自研智能翻译 Agent，实现深层语境理解与上下文决策。
- [ ] **项目架构现代化**：重新规划整理功能模块，使用现代技术栈重构项目架构。

如果你对上述方向感兴趣，欢迎在 [Issues](https://github.com/fishjar/kiss-translator/issues) 中讨论或提交 PR！

## 开发指引

### 本地编译

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
git checkout dev # 提交 PR 建议基于 dev 分支
pnpm install
pnpm build
```

插件开发请阅读 [插件开发指南](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md)，并参考 [OpenAI 兼容协议插件](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md) 或 [DeepSeek 插件](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md)。

### 外部触发示例

网页脚本可通过触发自定义事件控制翻译器：

```js
// `toggle_translate`   切换网页翻译
// `toggle_styles`      切换译文样式
// `toggle_popup`       打开/关闭控制面板
// `toggle_transbox`    打开/关闭独立翻译弹窗
// `toggle_hover_node`  翻译鼠标悬停段落
// `input_translate`    翻译当前输入框
window.dispatchEvent(
  new CustomEvent("kiss_translator", { detail: { action: "toggle_translate" } })
);
```

## 交流

- 加入 [Telegram 群组](https://t.me/+RRCu_4oNwrM2NmFl)

## 赞赏

如果您觉得 KISS Translator 对您有所帮助，欢迎赞赏支持作者继续维护！

![appreciate](https://github.com/fishjar/kiss-translator/assets/1157624/ebaecabe-2934-4172-8085-af236f5ee399)
