# 文件翻译 Web 前端与扩展服务解耦

## 目标与职责

沿用 CRA 5 / react-app-rewired / Webpack。首页和文件翻译页可以独立发布；开发时首页、Options 和文件翻译页仍由同一个 Webpack dev server 提供热更新。

| 层                  | 职责                                                                 | 入口                                 |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| Web 页面            | TXT、Markdown、EPUB、图片的解析、预览、段落/章节调度、译文合成和导出 | `src/fileTranslate.js`               |
| Web 客户端          | 扩展发现、会话、请求、取消、分块图片上传                             | `src/fileTranslation/client.js`      |
| 专用 content script | 同源、顶层页面通信，转发受限协议                                     | `src/fileBridge.js`                  |
| 扩展后台            | 设置、服务选择、提示词、缓存、网络请求、本地模型和 OCR 调用          | `src/fileTranslation/backend.js`     |
| 翻译服务            | 原有 API 选择和顺序回退，返回实际服务 ID                             | `src/libs/fileTranslationService.js` |

API 密钥、请求地址、请求头和提示词正文不进入 Web 上下文。网页只得到界面语言、场景设置、服务标识、模型状态、提示词名称和样式。场景保存走扩展的事务式存储更新，保留最新的无关字段。文件页连接后跟随扩展界面语言，扩展切换语言时同步刷新；未连接时使用 homepage 语言。主题仍使用 homepage 本地偏好。

## 实施步骤与验证

1. **分离服务和视图依赖**：迁出翻译服务；文件页使用专用 provider；复用无存储依赖的选择控件和图片预览组件。验证原有 TXT/Markdown/EPUB/图片视图和解析回归。
2. **实现通信桥**：加入发现、版本握手、会话、取消、心跳和图片分块；后台只开放文件翻译所需接口。验证来源、版本、补丁字段、跨会话隔离、取消、断开与分块限制。
3. **迁移入口与构建**：扩展入口跳转到 Web 文件页；扩展包移除旧文件页 HTML/JS；独立首页构建不含扩展服务依赖。验证产物、manifest 和页面资源路径。
4. **保留统一调试**：同一 CRA 服务提供所有网页热更新；Edge 使用独立 profile 与开发扩展。验证离线页面、连接提示、热更新、真实桥接与翻译。
5. **发布与兼容验收**：分别构建网站和扩展，先确认新版扩展兼容协议，再发布网站；保留旧用户的升级提示。上线前补齐真实网络服务、本地 LLM/OCR、取消/重连和浏览器兼容验收。

代码和自动化验证覆盖步骤 1–3；步骤 4 的真实服务调用与步骤 5 的上线验收需记录浏览器结果，不能由构建成功代替。

## 开发调试

使用项目原有 pnpm 工具链。第一终端：

```powershell
pnpm start:homepage
```

这是一个统一 dev server：

- 首页：`http://localhost:3000/`
- 原有 Options：`http://localhost:3000/options.html`
- 文件翻译：`http://localhost:3000/file-translate.html`
- 原有脚本测试页：`http://localhost:3000/content.html`

第二终端：

```powershell
pnpm build:edge-dev
pnpm debug:edge
```

`debug:edge` 检查开发构建和 dev server，然后使用 `--load-extension=build/edge-dev` 及 `tmp/edge-file-translate-profile` 独立配置启动 Edge；可通过 `EDGE_PATH` 指定 Edge 可执行文件。真实连接以网页显示扩展版本和“开发构建”标识为准，启动命令退出成功不代表扩展已加载。

如果当前 Edge 禁止命令行加载扩展，在这个独立配置的 `edge://extensions` 中开启开发者模式并加载 `build/edge-dev`。网页修改自动热更新；扩展 background/bridge/runtime 修改后重新运行 `build:edge-dev`，在扩展管理页重新加载扩展，再刷新文件页。重新加载会取消当前任务，连接恢复后不重放旧请求。

Windows 下脚本会检测已运行的独立调试进程；若存在，先关闭该调试窗口再执行，防止 Edge 复用旧进程而忽略新的 `--load-extension` 参数。脚本不会自动终止已有浏览器。

Web Options 热更新页仍用于原有 Options 视图开发。文件页的“设置”按钮打开真实扩展 Options，以编辑翻译所用的扩展设置；两者的运行环境和存储本来就不同，不能用网页 Options 替代扩展设置验收。

## 通信协议

- 通道：`kiss-file-translation-v1`；协议版本：`1`。
- 支持：`handshake`、`getContext`、`patchScene`、`translateText`、`uploadBegin`、`uploadChunk`、`recognizeImage`、`openSettings`、`ping`、`cancel`。
- 仅白名单域名的 `file-translate.html` 顶层页面可建立端口；查询参数允许，其他路径和 iframe 拒绝。
- 正式站点白名单统一维护于 `src/config/fileTranslationSites.json`；默认从主站打开，兼容 GitHub Pages 和项目开发站点。显式设置 `REACT_APP_FILE_TRANSLATE_URL` 会替换默认列表，网站与扩展必须一致构建。
- 正式和开发扩展均允许 `http://localhost:3000/file-translate.html` 与 `http://127.0.0.1:3000/file-translate.html`，运行时严格检查端口及路径。Chrome 本地调试可直接构建并加载 `build/chrome`；`edge-dev` 仍用于菜单直接打开本地页和独立 Edge 调试启动。正式构建菜单默认打开线上页。
- 每个端口独立拥有请求和临时图片；会话 ID、请求 ID 和协议版本均校验。
- 图片使用每块最多 256 KiB 的 Base64 传输并等待确认；大小上限取扩展的本地 AI 设置，每端口一次上传，闲置 60 秒清理。
- 单条文本上限 100000 字符；桥接层不限制翻译待处理请求数量，实际接口调用使用扩展原有批处理与服务调度。其他业务请求每端口同时最多 64 个，独立计数，不受翻译积压影响；心跳和取消不占用该限额。
- 客户端业务请求默认 5 分钟超时并发出取消；心跳每 20 秒一次，10 秒无响应后断开。扩展原有服务还有自身超时限制。
- 网页关闭、刷新、重挂载或扩展断开会取消当前请求；没有后台持续翻译、任务恢复或自动重放。
- 多个兼容扩展同时响应时要求用户明确选择；服务配置变化通过事件刷新，不把整份设置推入网页。

## 构建与独立发布

```powershell
pnpm build:homepage
pnpm build:web
pnpm build:chrome
pnpm build:firefox
```

`build:homepage` 仅构建首页和文件页，资源位于 `assets/homepage`，输出不含 Options、manifest、本地 AI 引擎或公共 API 脚本。Webpack 会检查实际编译模块，遇到扩展服务依赖直接失败；模块清单写入 `tmp/build-analysis/homepage-modules.json`。

`build:web` 保留原有油猴 Options 和脚本产物，然后合入独立 homepage 产物到 `build/web`。相对资源路径同时支持主站根路径和 GitHub Pages 子路径，避免新首页资源覆盖旧 Options 资源。

新增手动触发的 `Deploy website` workflow，只构建和发布网站，不要求扩展版本 tag。原有 release 流程继续使用 `build/web`，两种站点发布共用部署并发组。本次开发没有提交、推送或触发部署。

## 验证命令与验收边界

聚焦 Jest 回归可使用：

```powershell
$env:CI = 'true'
$env:REACT_APP_CLIENT = 'chrome'
pnpm exec react-app-rewired test --watch=false --runInBand --testMatch='**/src/fileTranslation/*.test.js' '**/src/libs/fileTranslate.test.js' '**/src/libs/epub/*.test.js' '**/src/views/FileTranslate/*.test.js' '**/src/views/Options/FileTranslate.test.js' '**/src/views/Options/OrderedApiSelect.test.js' '**/src/views/Options/Navigator.test.js' '**/src/homepage/App.test.js'
pnpm exec tsc --noEmit
```

构建上述网站、Chrome、Firefox 与 Edge 开发扩展后：

```powershell
pnpm test:file-translation-build
```

已验证 Edge 真实网页的离线提示、工具栏下方提示布局、页面无控制台错误和开发热更新。最后完整 Jest 回归为 14 套件 / 163 项通过，5 项构建产物检查、TypeScript 检查和新增模块 ESLint 检查通过；Web、独立 homepage、Chrome、Firefox 与 Edge 开发构建均成功。自动化覆盖服务凭证投影、受限设置更新、协议与来源校验、请求取消、断开清理、跨端口隔离、图片分块、StrictMode 旧连接隔离，以及原有文件翻译回归。

Edge 已使用命令行独立配置启动，但当前浏览器工具控制的配置中尚未连接新版扩展；工具的 URL 安全策略禁止打开 `edge://extensions/`，因此手动加载和真实连接需用户完成，不能记录为验收通过。

仍需取得真实输出的验收项：

- 新版扩展握手，版本与开发构建标识。
- 网络翻译与顺序回退；确认实际服务和输出。
- 已安装本地 LLM、PaddleOCR、VLM 的输出、取消与断开重连。
- TXT/Markdown/EPUB/图片输入及下载的浏览器端到端流程。
- Chrome/Firefox 实际运行与 EPUBCheck/真实阅读器验证。

构建和模拟测试不会证明模型可推理。扩展模型状态与服务可用性单独返回；未安装或后端不可用时显示不可用，不能把模型目录当成已安装模型。浏览器内置 AI 仅在扩展后端提供相应 API 时可用；MV3 service worker 缺少该 API 时标为不可用，不在网页侧运行模型。

当前桥支持 Edge/Chrome/Firefox 扩展；Safari、油猴和 Thunderbird 暂不支持。未连接扩展时仍能选择、解析和预览文件，翻译入口禁用。
