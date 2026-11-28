# AGENTS.md

本文件为 AI 编程助手（Antigravity、Claude Code、Codex、Cursor、Copilot 等）提供 `fishjar/kiss-translator` 仓库的高信噪比工程约束与导航索引。

## 项目概览

- **定位**：开源双语对照翻译浏览器扩展（Chrome/Edge/Firefox/Thunderbird）、油猴脚本与 Web 文件翻译应用。
- **技术栈**：React 18、MUI 5、CRA（`react-app-rewired` + `config-overrides.js`）、Vite（仅 `src/localAi/`，见 `vite.config.local-ai.ts`）、`pnpm`（Node >= 20，CI 为 Node 24 + `pnpm@9.14.4`）。

## 必须遵守的工程红线

1. **分支规范**：默认开发分支为 `dev`，所有功能/修复变更基于 `dev` 进行；禁止直接向 `master` 推送。
2. **版本号唯一来源**：严禁手动修改 `.env` 或 `public/manifest*.json` 中的版本号；版本变更只能通过 `pnpm version:*` 或 `pnpm sync-version` 完成。
3. **图标生成约束**：`src/components/icons/index.js` 和 `src/components/icons/lucide/index.js` 为生成文件且在 `.prettierignore` 中排除；改动图标配置后必须运行 `pnpm gen:icons` 并确保 `pnpm test:icons-gen` 通过。
4. **CI 零警告要求**：`CI=true` 下 CRA 会将 ESLint 警告视为错误。提交前必须运行 `pnpm check:pr` 或确认改动范围无 ESLint 警告。
5. **保持工作区干净**：不要提交 `build/`、`.local-ai-build/`、`tmp/`、本地调试日志或临时 `.patch` 文件。
6. **插件与规则边界**：官方插件源码与发布包维护在独立仓库 `fishjar/kiss-translator-plugins`，网站规则维护在 `fishjar/kiss-rules`；本仓库只保留宿主 SDK 与通用测试样例。
7. **代码注释规范**：新增或修改非显而易见的代码逻辑时，必须包含合理的代码注释（说明设计意图、边界条件或约束原因，优先使用中文注释；避免仅复述代码字面含义的冗余注释）。

## 核心目录速览

- `src/background.js` / `src/content.js` / `src/popup.js` / `src/options.js` / `src/userscript.js`：各端主入口
- `src/apis/` & `src/providers/` & `src/builtin-plugins/`：内置服务、能力调度与插件宿主
- `src/localAi/`：端侧 AI（TypeScript + Vitest + 独立 Vite 构建）
- `src/fileTranslation/` & `src/fileBridge.js`：TXT/MD/PDF/EPUB/图片文件翻译
- `src/subtitle/` & `src/injector-subtitle.js`：YouTube 字幕抓取、合并与 AI 断句
- `src/views/` & `src/components/` & `src/config/` & `src/libs/`：UI 视图、设置、同步与基础库
- `src/scripts/`：构建、打包、版本同步与验证脚本

## 高频验证命令

```sh
# 提交 PR 前综合预检（格式化 + 图标校验 + CI=true 核心构建）
pnpm check:pr

# Jest 单元测试（非交互）
CI=true pnpm test --watch=false <test-file-or-dir>

# Local AI 测试（Vitest）
pnpm test:local-ai

# Node 构建与脚本测试
pnpm test:icons-gen
pnpm test:build
pnpm test:archive
pnpm test:file-translation-build

# 单平台构建
pnpm build:chrome          # 含 Local AI 缓存复用
pnpm build:chrome:clean    # 强制重编 Local AI 后构建 Chrome
pnpm build:firefox
pnpm build:web
```

## 按需查阅文档（Progressive Disclosure）

仅在任务涉及对应领域时再读取以下文档，避免一次性加载冗余上下文：

- **本地搭建、环境变量、完整测试与调试指南**：[docs/DEVELOPER.md](docs/DEVELOPER.md)
- **核心子系统架构与通信拓扑**：[docs/architecture.md](docs/architecture.md)
- **全仓文档地图**：[docs/README.md](docs/README.md)
- **提示词占位符与模板执行契约**：[docs/contracts/prompt-template-contract.md](docs/contracts/prompt-template-contract.md)
- **图片/PDF 结构化视觉解析协议**：[docs/contracts/image-parse-results.md](docs/contracts/image-parse-results.md)
- **版本号管理与发版流程**：[VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md)
- **自动化发版 Skill**：[.agents/skills/release-kiss-translator/SKILL.md](.agents/skills/release-kiss-translator/SKILL.md)
- **代码与 PR 审查规范（Review Checklist & SOP）**：[.agents/skills/review-kiss-translator/SKILL.md](.agents/skills/review-kiss-translator/SKILL.md)
- **贡献与 PR 规范**：[CONTRIBUTING.md](CONTRIBUTING.md)
