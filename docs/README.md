# 文档目录（文档地图）

本页面汇总 `fishjar/kiss-translator` 的核心文档，按受众与用途分类导航。

## 贡献与社区规范

- [贡献指南（CONTRIBUTING.md）](../CONTRIBUTING.md)：分支策略（`dev` / `master`）、PR 流程、Commit 规范与 AI 辅助贡献准则。
- [行为准则（CODE_OF_CONDUCT.md）](../CODE_OF_CONDUCT.md)：Contributor Covenant v2.1 社区行为规范。
- [安全策略（SECURITY.md）](../SECURITY.md)：支持版本、漏洞私密报告渠道与安全边界说明。
- [更新日志（CHANGELOG.md）](../CHANGELOG.md)：各版本变更记录（发版工作流自动读取）。

## 工程开发与 AI 协作

- [开发者指南（DEVELOPER.md）](DEVELOPER.md)：本地环境搭建、目录架构、双构建体系（CRA + Vite）、环境变量、测试矩阵与浏览器调试技巧。
- [核心系统架构（architecture.md）](architecture.md)：多端运行拓扑、服务与插件宿主、Local AI、文件翻译、YouTube 字幕与同步架构详图。
- [AI 协作入口（AGENTS.md）](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md)：面向 AI Coding Agent 的精简工程红线、高频命令与按需索引。
- [代码与 PR 审查规范（review-kiss-translator）](../.agents/skills/review-kiss-translator/SKILL.md)：面向 AI Agent 与维护者的只读代码/PR 审查清单、高危雷区与标准报告模板。
- [版本号管理与发布指南（VERSION_MANAGEMENT.md）](../VERSION_MANAGEMENT.md)：版本号自动同步机制与合规发版流程（配套 Skill 见 [.agents/skills/release-kiss-translator/SKILL.md](../.agents/skills/release-kiss-translator/SKILL.md)）。

## 模块协议与契约（`docs/contracts/`）

- [提示词执行规则](contracts/prompt-template-contract.md)：显式占位符、空模板与兼容变化。
- [结构化图片解析协议（English）](contracts/image-parse-results.md)：`parseImage`、`includesTranslation` / `includesLayout` 与 `image-json` 协议说明。

## 插件生态与商店发布

- [插件市场多语言介绍文案（`docs/store/`）](store/README.md)：Chrome / Edge / Firefox 插件市场 11 语种纯文本介绍（自然 SEO 优化，零 Markdown，可直接复制粘贴）。
- [插件开发指南](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md)：当前插件契约与开发流程。
- [OpenAI 兼容协议插件](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md)：聊天、翻译、转写、语音与图片识别。
- [DeepSeek 插件](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md)：聊天、翻译与声明式协议规则。

插件源码、开发指引、供应商协议测试和发布流程统一维护在[官方插件项目](https://github.com/fishjar/kiss-translator-plugins)。该项目独立打包并发布版本化 ZIP 和目录索引；主项目仅使用通用测试样例验证 SDK，不保存官方发布包、目录或哈希快照。插件可从“接口插件 → 官方插件”联网安装，或下载独立 ZIP 后导入。

宿主支持插件 API 1 和 API 2，通过数字 `apiVersion` 判断兼容性。API 2 涵盖结构化图片解析和脚本 Worker 计时器。声明式规则使用 `format: "http"` 或 `format: "protocol"`。详见官方插件开发指南。

## 历史参考与阶段性验收记录（`docs/archive/`）

> 后续阶段性验收报告、调研快照与历史归档文档统一放入 `docs/archive/`，模块协议契约统一放入 `docs/contracts/`，保持 `docs/` 根目录仅保留现行总纲文档。

- [文件图片与 PDF 视觉解析接入验收记录](archive/file-visual-results-acceptance.md)：视觉解析接入边界与验收验证记录。
- [自定义接口说明及示例 V2](../custom-api_v2.md) / [V1（已过期）](../custom-api.md)：早期自定义接口钩子参考（新协议对接推荐优先使用外部接口插件）。

## 提交 PR 前的本地预检

安装依赖后，在仓库根目录运行：

```sh
pnpm check:pr
```

预检先执行现有的 `pnpm run format`，再以 `CI=true` 依次构建 Web（包含首页）、iOS 油猴脚本、规则 JSON 和 Chrome 扩展。CRA 生产构建会将警告视为错误，任一步失败都会停止后续步骤。完整构建可能需要数分钟。

格式化沿用 `.prettierignore`，排除 `node_modules`、`build`、`public`、`package.json`、生成图标文件和字幕测试样本目录。产生的源文件差异保留在工作区，即使后续构建失败也不会回滚；请检查差异后再提交。预检不会自动暂存、提交或推送。

此命令不包含 Firefox、Thunderbird、Safari 构建或真实浏览器功能验证。本地预检通过后，仍需确认远程 CI 的结果。
