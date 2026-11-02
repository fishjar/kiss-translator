# 本地隐私脱敏（OneAIFW / aifw-js）

把待翻译文本发给远端翻译服务之前，先在本机用 NER 模型识别人名、邮箱、电话、银行卡号等 PII 并替换成占位符；译文返回后按 `maskMeta` 还原成原文。这样远端模型只看到占位符，本机保留原文。功能由设置项 `privacyMask` 控制，默认关闭。

## 组成

| 位置                                                     | 说明                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aifw/`                                                  | OneAIFW 上游仓库（git submodule，`https://github.com/funstory-ai/aifw`）。**构建时从这里构建 aifw-js 运行期产物**。                                                                           |
| `src/vendor/aifw-js/`                                    | **构建生成、不入库**（`.gitignore`）：aifw-js 运行期产物（ESM + WASM），由 `pnpm build:aifw` 从子模块构建；打包时复制到 `build/<target>/aifw-js/`，运行期按 URL 加载，不进入 webpack bundle。 |
| `src/libs/aifw/engine.js`                                | aifw 引擎（后台宿主与 Web 页面共用）：加载 aifw-js、init 状态机、mask/restore、下载进度统计、缓存测量、清理。                                                                                 |
| `src/libs/aifw/host.js`                                  | 后台宿主逻辑：处理 `AIFW_HOST_RPC` / 直接处理请求（mask/restore/reset/status）。                                                                                                              |
| `src/libs/aifw/client.js`                                | 页面侧远程客户端：握手、mask/restore/reset RPC、base64 maskMeta。                                                                                                                             |
| `src/libs/aifw/index.js`                                 | 页面侧对外 API：`createRedaction`、`getRedactionStatus`、模型状态订阅、重新下载。                                                                                                             |
| `src/libs/aifw/status.js`                                | 模型状态的 storage 持久化、缓存统计/清理、后台 RPC 常量。                                                                                                                                     |
| `src/aifwHost.js`                                        | Chromium offscreen 文档里的宿主入口（`aifw-host` webpack entry）。                                                                                                                            |
| `src/background.js`                                      | 后台路由：Chromium 创建/复用 offscreen 并转发 `AIFW_RPC`；Firefox/Thunderbird 背景页直接执行宿主逻辑。                                                                                        |
| `src/apis/index.js`                                      | 翻译请求链路接入点（`executeApiTranslate`）。                                                                                                                                                 |
| `src/config/setting.js` + `src/views/Options/Setting.js` | 设置项、开关、模型状态/进度/重新下载 UI。                                                                                                                                                     |
| `public/manifest*.json`                                  | 三个清单的 `web_accessible_resources` 暴露 `aifw-js/*` 与 `aifw-js/wasm/*`（Web 端页面内引擎仍需要加载）。                                                                                    |

### `src/vendor/aifw-js/` 产物（构建生成，不提交）

```
aifw-js.js                入口，re-export 上层 API
libaifw-*.js              libaifw 实现（含 init/maskText/restoreText 等）
libner-*.js / full-*.js   动态拆分的 Transformers.js / NER 依赖
wasm/liboneaifw_core.wasm  Zig+Rust 编译的核心引擎（mask/restore/span）
```

产物合计约 3.5 MB，随扩展包分发；其 wasm 导出集合已核对（`aifw_session_mask_and_out_meta`、`aifw_session_restore_with_meta` 等 13 个导出）。模型与 ORT wasm 由 aifw-js 的 managed 模式在运行时下载（约 30 MB：EN 模型 9.2 MB + ZH 模型 11.2 MB + ORT wasm 9.6 MB + 小文件 0.5 MB）。

## 执行位置：模型只缓存一份

aifw 引擎**运行在扩展 origin**，而不是内容脚本/页面 origin：

- **Chrome / Edge（MV3）**：引擎跑在 **offscreen 文档**里（复用内置本地 AI 的 `offscreen.html`，同时加载 `offscreen.js` 与 `aifw-host.js`）。内容脚本/设置页发送 `AIFW_RPC`，`background.js` 负责 `localAiHost({action:'ensure'})` 创建文档，再以 `AIFW_HOST_RPC` 转发并回传结果。
- **Firefox / Thunderbird（MV2）**：背景页本身就是扩展 origin 页面，`background.js` 直接调用 `handleHostRequest` 处理 `AIFW_RPC`，无需 offscreen。
- **Safari / 无 offscreen 的 MV3**：无法创建宿主，扩展内**直接跳过脱敏**并在页面顶部提示 + console 记录（不会在页面 origin 缓存模型）。Web 端页面（kiss-translator 站点自身）使用页面内引擎。
- 模型与 ORT wasm 缓存在扩展 origin 的 `oneaifw-assets-v*` Cache Storage 中，因此**全局只下载/缓存一份**，与访问多少站点无关。

首次在任一页面触发翻译时会下载模型；下载完成后所有站点共享。扩展卸载/清除扩展数据后才会丢失。

## 运行链路

1. `executeApiTranslate` 命中缓存时直接返回，不触发脱敏（缓存 key 始终用原文）。
2. 缓存未命中时调用 `createRedaction({ text, fromLang, toLang, apiSetting, signal })`：
   - 设置 `privacyMask !== true`、文本为空、环境不支持（如油猴）、接口是本地 AI / 浏览器内置 AI、signal 已取消时返回 `null`；
   - 扩展环境走后台 RPC（`client.js`，20s 超时）；宿主可达且引擎就绪时正常返回；
   - **宿主不可用/失败/未就绪时抛出错误阻止本次翻译**（安全优先，绝不原文直发）：未就绪时提示“模型尚未就绪，已暂停本次翻译，请稍候重试”（不设冷却，就绪后立即恢复）；失败时页面顶部 Banner 提示一次（60s 内不重复）并进入 60s 冷却；两种提示都告诉用户可在设置中关闭开关；
   - 成功时返回 `{ maskedText, restore(translatedText) }`。
3. 分发请求时使用 `maskedText`；批量队列与单段分支都如此。脱敏生效时关闭流式增量透传（增量可能带占位符）。
4. 译文返回、规范化之后、`isSame` 与缓存写入之前调用 `restore`（同样走后台 RPC），再补发一次完整 `onStreamChunk({ id: 0, text, isComplete: true })`。
5. 缓存写入和对外返回的都是还原后的文本；缓存 key 仍是原文。

脱敏启用后是**安全优先**：脱敏链路失败会阻止本次翻译，而不是把未脱敏的原文发出去。restore 失败时保留模型原始译文（此时已不影响隐私）。开关读取带 2s 进程内 TTL 缓存。

## 设置项与模型状态

- `DEFAULT_SETTING.privacyMask = false`，为顶层布尔，旧用户读取时由 `mergeSettingWithDefault` 自动补默认值，无需数据迁移。
- 设置页「总览」中新增“本地隐私脱敏”分组（`SettingsSection/SettingsCard/SettingsRow/SettingsSwitch`）；不支持的环境（如油猴）禁用开启，已开启的历史设置仍允许关闭。
- 开关下方展示模型状态（数据经 `browser.storage.local` 的 `kiss-translator_aifw_model_status` 由宿主写入、设置页订阅）：
  - 尚未下载 / 下载中（进度条 + 已下载 / 总计 + 实时速度）/ 已就绪（缓存大小）/ 加载失败（错误信息）；
  - 下载中会显示「当前文件」及其下载链接（mirror 实际 URL），并列出模型文件清单（名称可点击打开下载链接、每个文件的进度/完成状态）；已就绪/失败时同样保留文件清单；
  - 文件清单只统计真实网络下载（扩展内置的 aifw core wasm 不计入），「模型大小」恒等于文件清单之和；同一 URL 在单次初始化内只计一次，重试/重复拉取不会让大小翻倍；
  - 「重新下载」向宿主发送 `reset`：deinit 引擎、删除扩展 origin 的 `oneaifw-assets-v*` 缓存，开关开启时立即重新初始化并重新下载；成功后是全局生效的。
  - 「重试」向宿主发送 `retry`：**中断当前卡住的初始化/下载**，保留已完成的缓存文件并重新开始（已下载完的文件不会重复下载）。下载中或加载失败时可用。
  - 下载看门狗：模型资源 45s 没有新数据会自动中断并标记「模型下载超时，请重试」，避免无限卡住。
  - 失败（`delivered === 0`）表示宿主不可用或调用失败，提示用户稍后重试。

## 失败处理（阻止翻译，不回退页面引擎）

扩展环境里 aifw 只在后台宿主执行，以下情况**不会**回退到页面内引擎（避免各站点再各存一份模型）：

- Safari，或没有 `chrome.offscreen` 的 MV3 环境；
- Chromium 上 offscreen 创建/脚本加载失败（例如扩展被禁用）；
- 后台 RPC 超时、宿主初始化失败、模型下载未完成。

处理方式是**阻止本次翻译**（不会把未脱敏原文发出去）：

- 模型未就绪：提示「隐私脱敏模型尚未就绪，已暂停本次翻译，请稍候重试」，不设冷却，模型就绪后自动恢复；
- 宿主不可用/调用失败：在页面顶部用既有红色 Banner 提示「隐私脱敏服务不可用，已阻止本次翻译；如不需要脱敏，可在设置中关闭「本地隐私脱敏」」，同时 console 输出 `log.warn`；随后 60s 冷却，期间直接阻断且不重复提示；
- 提示与日志都做 60s 节流；批量翻译中每个失败请求都会阻断（批量任务可能因此整体失败）。

> Web 端（kiss-translator 站点自身，无扩展后台）仍使用页面内引擎；引擎失败同样阻止翻译。

> 只读/关闭开关即可恢复：`privacyMask` 关闭后不再阻断任何翻译。

## 已知限制

- 首次下载模型期间，宿主侧每次 mask 最多等待 12s（之后冷却跳过），首批翻译可能变慢；下载完成后无此等待。
- Chrome/Edge 的 offscreen 文档与内置本地 AI 共用生命周期；文档被关闭后下次请求会自动重建（缓存仍在，重建需重新 init 引擎）。
- 内容脚本与后台之间每条文本一次 RPC（mask + restore 各一次），批量翻译会增加少量消息开销；相对网络请求可忽略。
- 只覆盖翻译接口链路；AI 词典、字幕、ASR、文件翻译等走各自通道，暂未接入。
- 占位符如果被远端模型改写（例如把 `[EMAIL]` 翻译掉），`restore` 可能匹配不到；此时保留模型译文并记录 warn，不会让翻译失败。
- 油猴脚本没有扩展后台宿主，功能不可用（返回 unavailable）；Safari / 无 offscreen 的 MV3 同样不可用，只会跳过脱敏并提示。

## 构建与验证

- **单测**：`src/libs/aifw`（126，含 engine/host/client/protocol/重试与下载统计）、`src/views/Options/Setting.test.js`（61，含模型状态/重试 UI）、`src/apis/index.privacyMask.test.js`、`src/common`、`src/background`、`src/config/i18n.test.js` 等共 16 个 suite / 281 个用例全部通过。
- **打包**：生产配置编译 Chrome 扩展目标：0 error / 0 warning / 15 个 asset，包含 `background.js`、`content.js`、`aifw-host.js`；`content.js` / `options.js` 保留了运行期 `import()` 形式（没有把 aifw-js 打进 bundle）。
- **CI**：`.github/workflows/release.yml` 与 `deploy-web.yml` 会 `checkout` 子模块、安装 Zig 0.15.2 与 Rust `wasm32-unknown-unknown`，用 `pnpm build:aifw --strict` 从子模块构建产物后再打包，并在构建后校验产物存在；发布资产改用 GitHub CLI（`gh release`）。
- **未做**：真实浏览器扩展内的端到端烟测（需要联网下载模型并加载扩展）。本机沙箱禁止带管道子进程，`fork-ts-checker`、`vite`/`esbuild` 无法运行，官方 `pnpm build:*` 在此环境跑不通；上述验证是绕过这些插件的等价编译。

## 本地编译链（.toolchain）

项目使用**本地编译链**隔离系统环境：zig / pnpm 等构建工具优先从项目内 `.toolchain/` 取，避免本机 PATH 上其他版本（例如 zig 0.17、pnpm 11）干扰导致构建失败或产物不一致。

- `.toolchain/` 已加入 `.gitignore`，不随仓库分发；
- 一键下载/校验（按当前平台选择 zig 包，校验 sha256，并生成 pnpm 入口）：

```bash
pnpm toolchain:download   # 下载 zig 0.15.2 + pnpm 9.14.4 到 .toolchain/
pnpm toolchain:check      # 只校验（缺什么、版本不符都会报错）
```

- 目录结构（示例）：

```
.toolchain/
├── zig-0.15.2/…/zig.exe
├── pnpm/9.14.4/bin/pnpm.cjs
├── bin/pnpm.cmd            # 指向项目内 pnpm 的入口
└── zig-cache/ zig-local-cache/
```

- 查找优先级：`AIFW_ZIG_PATH` / `AIFW_PNPM_PATH` 环境变量 > `.toolchain/` > 旧 `.aifw-build/toolchain/` > 系统 PATH；构建日志会标注每个工具的来源（`本地 .toolchain` / `系统 PATH`）。
- 如果 `.toolchain/` 存在但某个工具退回了系统 PATH，脚本会 warn 提示运行 `pnpm toolchain:download`。
- Rust 的 `wasm32-unknown-unknown` target 由系统 rustup 管理，不放进项目目录；缺失时执行 `rustup target add wasm32-unknown-unknown`（或构建时设 `AIFW_BUILD_INSTALL_TARGETS=1`）。

## 清理构建缓存（pnpm clean）

`src/scripts/clean.mjs` 提供跨平台清理命令（都可以加 `--dry-run` 先看会删什么、释放多少）：

| 命令                   | 清理内容                                                      | 后续动作                                                    |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm clean`           | `build/`、`tmp/`、`.local-ai-build/`、`node_modules/.cache/`  | 直接重新 `pnpm build:*`                                     |
| `pnpm clean:aifw`      | `src/vendor/aifw-js/`、`.aifw-build/`、aifw 内 zig/cargo 产物 | `pnpm build:aifw --force`（需要 `.toolchain` 或系统工具链） |
| `pnpm clean:toolchain` | `.toolchain/`（本地编译链）                                   | `pnpm toolchain:download`                                   |
| `pnpm clean:deps`      | `node_modules/`、`aifw/node_modules/`                         | `pnpm install`                                              |
| `pnpm clean:global`    | 旧 zig 全局缓存、corepack 缓存（项目外）                      | 会重新下载 pnpm/zig                                         |
| `pnpm clean:all`       | 以上全部                                                      | `pnpm install && pnpm toolchain:download`                   |

`pnpm clean:aifw` 会删除 `src/vendor/aifw-js`：如果 `.toolchain` 也不存在，下一次构建会按设计失败并提示先 `pnpm toolchain:download`。清理脚本不会删除 `aifw/` 子模块本身、`pnpm-lock.yaml` 或 `public/` 下的配置。

## 构建集成（子模块 → src/vendor/aifw-js → build/<target>/aifw-js）

`pnpm build:aifw`（`src/scripts/build-aifw.mjs`）负责从子模块构建并同步产物：

1. 校验子模块与工具链：`zig`（**0.15.x**，0.16/0.17 会因 build.zig 的 `.Debug`/枚举 API 变化失败）、`cargo` + `rustup` 的 `wasm32-unknown-unknown`、`sh`、`pnpm`；查找顺序为 **项目内 `.toolchain/` → 旧 `.aifw-build/toolchain/` → 系统 PATH**（`AIFW_ZIG_PATH` / `AIFW_PNPM_PATH` 可显式覆盖），`.toolchain/` 已 gitignore；zig 缓存也放在 `.toolchain/zig-cache`；
2. 安装 `aifw/libs/aifw-js` 依赖，执行 `zig build -Doptimize=Debug web:wasm`，再 `pnpm --filter @oneaifw/aifw-js build`（vite 打包 + 复制 wasm）；
3. 把 `aifw/libs/aifw-js/dist/*` 原子替换到 `src/vendor/aifw-js/`，并写入 `.aifw-build/manifest.json`（指纹 = 子模块 HEAD + 脚本哈希 + 工具链版本）；
4. 打包阶段（`build-task.mjs`）再把该目录复制到 `build/<target>/aifw-js/`，加载方式仍是运行期 URL（扩展 `chrome.runtime.getURL`、Web 相对 `document.baseURI`）。

- 所有扩展/Web 构建任务（`build-task.mjs`）在开头都会自动调用该脚本；指纹一致时直接跳过，因此全量 `pnpm build` 不会重复构建。
- **本机没有 zig/rust wasm 时**：脚本打印警告并退出 0，**前提是** `src/vendor/aifw-js/` 已经构建过（例如上次构建留下的）。**全新 clone 没有该目录，会直接失败并提示安装工具链**，避免打出一个缺少脱敏资源的扩展包。
- **CI / 强制模式**：`pnpm build:aifw --strict` 或 `AIFW_BUILD_STRICT=1`，缺少工具链或构建失败会直接失败。
- 可选 `AIFW_BUILD_INSTALL_TARGETS=1`：缺少 `wasm32-unknown-unknown` 时允许脚本执行 `rustup target add`（默认不隐式联网改环境）。
- 工具链覆盖与优先级：`AIFW_ZIG_PATH` / `AIFW_PNPM_PATH` 环境变量 > `.toolchain/`（项目内，递归查找 `zig(.exe)`、`pnpm(.exe/.cmd)` 等）> 旧 `.aifw-build/toolchain/` > 系统 PATH。把 0.15.2 解压到 `.toolchain/zig-0.15.2/` 即可让本机用项目钉住的版本，即使系统 PATH 上是 0.17。
- 上游 `build.zig` 的 `web:wasm` step 不会安装到 `zig-out`，脚本在构建期间临时追加 install artifact 依赖（构建结束恢复原文件），否则 `copy-assets.mjs` 拿不到 wasm。
- `src/vendor/aifw-js/` 已在 `.gitignore` 中忽略、也不在 `public/` 下：构建产物不进 git、不进 webpack bundle；更新 aifw 版本只需更新子模块并重新构建（CI 会从子模块构建）。
- **为什么不直接 webpack 打包**：aifw-js 是 Vite 产物（动态 chunk + `new URL(wasm, import.meta.url)`），且扩展 webpack 配置了 `dynamicImportMode: eager`，实测会把 ~2.3 MB bundle 内联进 content/background/options 等多个入口，扩展包从 14.7 MB 涨到 27.8 MB。改为「生成静态资源 + 打包时复制」可保持单份资源（约 3.6 MB）且不动 webpack 的行为。

```bash
# 常用命令
pnpm build:aifw          # 构建（指纹一致则跳过；缺工具链且有现有产物则警告跳过）
pnpm build:aifw --force  # 忽略指纹强制重建
pnpm build:aifw --strict # CI 用：不允许回退
```

## 重建产物（手动）

```bash
# 子模块已在仓库内；确保已初始化
git submodule update --init --recursive
# 需要 zig 0.15.x、rust wasm target、pnpm
# 方式一（推荐）：把 zig 解压到 .toolchain/（gitignored），脚本优先使用
#   .toolchain/zig-0.15.2/zig-x86_64-windows-0.15.2/zig.exe 等
# 方式二：显式指定
#   PowerShell: $env:AIFW_ZIG_PATH='C:\path\to\zig-0.15.2\zig.exe'
#   bash:       export AIFW_ZIG_PATH=/path/to/zig-0.15.2/zig
pnpm build:aifw --force
```

已在 Windows 本机用 zig 0.15.2 + Rust `wasm32-unknown-unknown` 完整跑通：cargo 构建 Rust regex → zig 生成 wasm → vite 打包 → 原子同步 `src/vendor/aifw-js/`（5 个文件）；产物 wasm 导出 ABI 与基线一致（13 个导出），并已用该产物重建 Firefox 扩展包。
