# KISS Translator 开发者指南

本文档面向参与 `fishjar/kiss-translator` 代码开发与调试的工程师，提供本地环境搭建、仓库架构、双构建体系、环境变量、测试矩阵与浏览器调试方法。

> 参与协作流程与 PR 规范请参阅 [CONTRIBUTING.md](../CONTRIBUTING.md)；版本发布流程请参阅 [VERSION_MANAGEMENT.md](../VERSION_MANAGEMENT.md)；AI 编程助手请优先阅读 [AGENTS.md](../AGENTS.md)。

---

## 1. 环境要求

- **Node.js**：`>= 20`（推荐 Node 22 或 24；GitHub Actions CI 使用 `ubuntu-24.04` + Node 24）
- **pnpm**：`>= 9`（CI 固定使用 `9.14.4`，仓库根目录包含 `.pnpm-version`）

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
git checkout dev
pnpm install
```

---

## 2. 目录结构与模块职责

```text
kiss-translator/
├── public/                 # 扩展 manifest（Chrome/Firefox/Thunderbird）、静态资源、HTML 模板
├── src/
│   ├── background.js       # 扩展后台脚本（消息路由、请求代理、独立窗口、图片/文件桥接）
│   ├── content.js          # 网页注入主入口（网页翻译、划词查词、输入框翻译、悬停翻译）
│   ├── popup.js            # 扩展弹出面板入口
│   ├── options.js          # 完整设置页入口
│   ├── fileTranslate.js    # 文件翻译页面入口
│   ├── fileBridge.js       # 文件翻译与扩展后台的桥接脚本
│   ├── userscript.js       # 油猴脚本入口
│   ├── injector-subtitle.js    # 字幕拦截与注入脚本
│   ├── injector-shadowroot.js  # ShadowRoot 拦截注入脚本
│   ├── subtitleBootstrap.js    # Firefox 专用字幕引导脚本
│   ├── rules.js            # 规则构建入口（pnpm build:rules）
│   ├── apis/               # 内置翻译/AI 服务适配层
│   ├── providers/          # 统一能力调度、插件运行宿主、视觉/图片结果契约
│   ├── builtin-plugins/    # 内置插件包与协议实现
│   ├── localAi/            # 本地边缘 AI（LLM/VLM/OCR/ASR/TTS/版面分析，独立 Vite 构建）
│   ├── fileTranslation/    # TXT / Markdown / PDF / EPUB / 图片文件翻译流水线
│   ├── subtitle/           # YouTube 双语字幕抓取、合并、AI 断句与总结
│   ├── libs/               # 通用工具、存储、缓存、数据同步（WebDAV / KISS-Worker）、DOM 扫描
│   ├── config/             # 默认设置、规则、提示词模板、国际化文案与常量
│   ├── views/              # React 页面级视图（Options、Popup、Tranbox、FileTranslate、ImageTranslate 等）
│   ├── components/         # 复用 UI 组件（含自动生成的 Lucide 图标模块）
│   ├── hooks/              # React Hooks
│   ├── homepage/           # 项目首页与油猴在线设置页
│   ├── styles/             # 样式与主题定义
│   ├── injectors/          # 页面注入辅助脚本
│   ├── scripts/            # 构建、打包、版本同步、图标生成与专项验证脚本
│   └── testUtils/          # 测试辅助工具与 Mock
├── docs/                   # 工程文档与模块协议契约（详见 docs/README.md）
├── .agents/skills/         # 可复用的 Agent 工作流技能（如自动发版）
├── config-overrides.js     # react-app-rewired 多端 Webpack 打包配置
└── vite.config.local-ai.ts # Local AI 专用 Vite 构建配置
```

---

## 3. 双构建体系说明

本项目采用 **CRA (`react-app-rewired`) + Vite** 双构建架构：

1. **主构建（`config-overrides.js`）**
   - 根据环境变量 `REACT_APP_CLIENT` 切换目标平台（`chrome` / `edge` / `firefox` / `thunderbird` / `safari` / `web` / `userscript` / `homepage`）。
   - 通过 `src/scripts/build-task.mjs` 统一编排各平台产物输出到 `build/<target>`。
   - `CI=true` 时 CRA 会将 ESLint 警告视为错误并中断构建。
2. **Local AI 子构建（`vite.config.local-ai.ts`）**
   - 负责打包 `onnxruntime-web`、PaddleOCR、Web Worker 等端侧 AI 运行时，输出至 `.local-ai-build/`。
   - 通过 `src/scripts/local-ai-cache.mjs` 进行构建缓存复用；若改动了 `src/localAi/` 相关依赖或需要强制重编，可执行 `pnpm build:local-ai` 或 `pnpm build:chrome:clean`。

---

## 4. 环境变量

项目根目录的 `.env` 定义了构建期变量，关键变量如下：

| 变量名                                 | 说明                                                                                               |
| :------------------------------------- | :------------------------------------------------------------------------------------------------- |
| `REACT_APP_CLIENT`                     | 运行/构建目标端（如 `web`、`chrome`、`firefox`、`userscript`），通常由 npm scripts 注入            |
| `REACT_APP_VERSION`                    | 当前版本号。**禁止手动修改**，由 `pnpm version:*` / `pnpm sync-version` 从 `package.json` 自动同步 |
| `GENERATE_SOURCEMAP`                   | 是否生成 Source Map（默认 `false`）                                                                |
| `SITE_ORIGIN_*` / `REACT_APP_SITEURL*` | 官网、GitHub Pages 与开发环境站点域名                                                              |
| `REACT_APP_RULESURL*`                  | 官方订阅规则 JSON 地址                                                                             |
| `REACT_APP_USERSCRIPT*_DOWNLOADURL`    | 油猴脚本与 iOS Safari 脚本下载地址                                                                 |

---

## 5. 常用命令矩阵

### 开发与构建

| 命令                                         | 用途                                                 |
| :------------------------------------------- | :--------------------------------------------------- |
| `pnpm start`                                 | 启动 Web 端本地开发服务器（`http://localhost:3000`） |
| `pnpm start:userscript`                      | 以油猴模式启动本地开发                               |
| `pnpm build:chrome`                          | 构建 Chrome / Edge 扩展（输出至 `build/chrome`）     |
| `pnpm build:chrome:clean`                    | 强制重编 Local AI 后构建 Chrome 扩展                 |
| `pnpm build:firefox`                         | 构建 Firefox 扩展（输出至 `build/firefox`）          |
| `pnpm build:edge` / `pnpm build:thunderbird` | 构建 Edge / Thunderbird 扩展                         |
| `pnpm build:web`                             | 构建 Web 站点与 iOS 油猴脚本                         |
| `pnpm build:rules`                           | 构建规则 JSON                                        |
| `pnpm build`                                 | 同步版本号、格式化并全量构建所有平台                 |
| `pnpm build+zip`                             | 在 `CI=true` 下全量构建并打包压缩（发布用）          |

### 代码规范与 PR 预检

| 命令             | 用途                                                                  |
| :--------------- | :-------------------------------------------------------------------- |
| `pnpm format`    | 使用 Prettier 格式化 `**/*.{js,json,html}`（遵循 `.prettierignore`）  |
| `pnpm gen:icons` | 根据配置重新生成 `src/components/icons/` 下的 Lucide 图标模块         |
| `pnpm check:pr`  | **提交 PR 前必跑**：执行格式化、图标生成检查与 `CI=true` 核心平台构建 |

> 注意：`src/components/icons/index.js` 与 `src/components/icons/lucide/index.js` 由 `pnpm gen:icons` 生成，已被 `.prettierignore` 排除，请勿手工编辑这两个生成文件。

### 测试命令

仓库按模块特点使用多套测试运行器，改动后请运行对应范围的测试：

| 测试框架           | 命令示例                                                                                             | 覆盖范围                                                                       |
| :----------------- | :--------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Jest (CRA)**     | `CI=true pnpm test --watch=false <path>`                                                             | 扩展核心逻辑、React 组件、fileTranslation、providers、config 等（`*.test.js`） |
| **Vitest**         | `pnpm test:local-ai`                                                                                 | `src/localAi/` 下的端侧 AI 与文档结构测试（`*.test.ts`）                       |
| **Node `--test`**  | `pnpm test:icons-gen` / `pnpm test:build` / `pnpm test:archive` / `pnpm test:file-translation-build` | 图标生成、打包产物、归档与文件翻译构建测试（`src/scripts/*.test.mjs`）         |
| **Babel 脚本测试** | `pnpm test:subtitle-segmentation` / `pnpm test:terms`                                                | 字幕断句与术语替换专项脚本验证                                                 |

---

## 6. 浏览器加载与调试技巧

### Chrome / Edge 扩展调试

1. 运行 `pnpm build:chrome`。
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择 `build/chrome`。
4. 修改代码后重新运行 `pnpm build:chrome`，并在扩展卡片点击刷新按钮。
   - 调试后台脚本：点击扩展卡片上的 **Service Worker** 打开 DevTools。
   - 调试页面注入脚本：直接在目标网页打开 DevTools 查看 Console / Network。
   - Edge 自动化调试可参考 `pnpm debug:edge`（`src/scripts/debug-edge.mjs`）。

### Firefox 扩展调试

1. 运行 `pnpm build:firefox`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 点击 **临时载入附加组件**，选择 `build/firefox/manifest.json`。

### Web / 设置页快速调试

- 运行 `pnpm start`，访问 `http://localhost:3000` 进行页面样式与交互热更新调试。

### 扩展包体积分析

- 运行 `pnpm analyze:chrome` 可审计 Chrome 构建产物体积分布。

---

## 7. 外部事件触发接口

第三方网页脚本、书签脚本（Bookmarklet）或鼠标手势扩展可通过向 `window` 派发自定义事件 `kiss_translator`（定义于 `src/config/msg.js`，由 `src/libs/translatorManager.js` 监听）来触发翻译器动作：

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

---

## 8. 关联项目与仓库边界

KISS Translator 生态按职责拆分为多个独立仓库，开发与提交 PR 时请注意仓库边界与本地联调方式：

| 关联仓库 | 职责边界 | 与主仓库的集成 / 本地联调方式 |
| :--- | :--- | :--- |
| **[kiss-translator-plugins](https://github.com/fishjar/kiss-translator-plugins)** | 官方外部接口插件源码、协议测试、版本化 ZIP 与目录索引 | 主仓库仅维护宿主运行时与 SDK（`src/providers/`）及通用测试样例，不存放官方发布包；本地联调可在扩展「接口插件」页直接导入插件目录或 ZIP |
| **[kiss-rules](https://github.com/fishjar/kiss-rules)** | 社区维护的网站适配规则库与订阅产物 | 主仓库通过 `.env` 中的 `REACT_APP_RULESURL*` 拉取订阅规则；本地改动内置基础规则可执行 `pnpm build:rules`（`src/rules.js`）验证 |
| **[kiss-worker](https://github.com/fishjar/kiss-worker)** | 自建跨设备配置同步服务端（Cloudflare Workers / Docker） | 与主仓库 `src/libs/sync.js`、`src/libs/syncCrypto.js` 对接；调试同步逻辑时可在本地启动 `kiss-worker` 实例或使用 WebDAV 服务联调 |

---

## 9. 相关文档

- [文档总目录（文档地图）](README.md)
- [核心系统架构](architecture.md)
- [提示词执行规则](contracts/prompt-template-contract.md)
- [结构化图片解析协议](contracts/image-parse-results.md)
- [版本号管理与发布指南](../VERSION_MANAGEMENT.md)
- [官方插件开发指南（独立仓库）](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md)
