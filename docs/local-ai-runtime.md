# 本地 AI：独立 LLM / VLM 与统一运行时

## 同步基准和边界

在 `feat/local-ai` 的 `8ccca28b1b63b65586b108a9eef95a0d5256b357` 上同步 Demo 截至 `1523257` 的拆分、计数订阅和宿主关闭确认修复（拆分提交 `798afac`）。先在 Demo 实施和验证，再迁入本项目；保留 Webpack Worker URL、扩展资源路径、Firefox 背景宿主及文件翻译业务适配，不复制 WXT 专用入口。

- 下载、模型安装文件、设置、资源池和调度由统一宿主管理。模型目录和安装记录不变。
- `llm` / `vlm` 分别维护模型、会话版本、Worker 实例和取消状态。VLM 页面及文件图像解析使用 `VlmClient`；文本翻译、摘要仍走 LLM。
- GGUF 和 ONNX Worker 入口与引擎 WASM 文件共享，不增加依赖或复制资源。允许两个模型驻留，当前推理调度仍串行；尚未开放并行推理。
- 本地 AI“设置”页签改名“运行时”，上方显示六服务会话及任务统计，下方保留输入限制、空闲卸载、独享模式及新增预算。会话和本页 RPC 等待计数通过事件更新，支持手动刷新；本页计数不是所有页面的请求总数。
- Offscreen 设置通过后台 `local_ai_settings` 消息持久化到同一 Chrome storage key，保留旧设置兼容读取。宿主关闭/重建使用项目的 `local_ai_host` 协议，避免错误使用 Demo 消息格式；关闭期间新请求等待关闭完成。

## 资源设置

`residentMemoryBudgetMB` 为非负整数，默认 0 表示不限制估算 MB；原有最多 4 个驻留模型和默认 10 分钟空闲卸载仍有效。估算为模型二进制权重的两倍加 256 MB，包含视觉投影 mmproj 和 ONNX 外部数据，不是实际 RAM/VRAM 测量。预算不足时淘汰空闲模型，保护加载中、推理中及 pinned 的 JEV。无法满足预算返回 `RESOURCE_BUDGET_EXCEEDED`，过大的新模型在独享释放前拒绝。

独享资源模式在切换重模型前等待 Worker 卸载确认，然后终止实例。释放失败或 5 秒未确认会阻止本次新加载并终止旧实例。JEV 除外；关闭独享模式不会自动重载先前模型。浏览器何时归还操作系统内存由浏览器控制，不能承诺进程内存读数即时下降。

## 验证（2026-10-01）

浏览器使用 Edge `--load-extension=build/chrome`，独立测试 profile。样本为 Qwen2.5-0.5B 的 `Say hello.` 与 PaddleOCR-VL 1.6 GGUF；CPU 为实际后端。图像为 224×112 白底黑字 `Hello world` PNG，提示 `Text Recognition:`。

Demo 的 compile、test（199 Vitest + 2 SDK）、build:web、build 全通过。网页热更新确认六服务状态、LLM 真实生成、预算拒绝及独享 LLM→OCR 切换；Edge 补测两个模型同时 ready、独享 LLM/VLM 切换。资源审计保留 ORT、Wllama、OpenCV WASM 各一份。关闭宿主等待旧 pagehide 通知，避免迟到的卸载广播误拒绝新请求，关闭确认有 1 秒超时。

本机未取得 VLM 文本输出：GLM-OCR ONNX Q4 的 WASM 缺少 `GatherBlockQuantized(1)` 实现；PaddleOCR-VL CPU 图像编码在 180 秒窗口内没有首 token。取消编码、重新加载和模型驻留成功均不等同于完成 VLM 推理。首 token 后的流式停止与 VLM 输出重跑仍待支持的硬件验证。

本项目最终检查：`pnpm exec tsc --noEmit`、`pnpm run test:local-ai`（25 套 / 193 项）、设置/运行时/后台 Jest（3 套 / 32 项）、`pnpm run build:chrome`、产物审计通过。文件翻译和模型选择等六套 Jest 回归也通过（当时 65 项）；本次新增后台宿主测试在最终三套测试中通过。构建仅保留文件翻译页面已有的两条未使用变量警告，未改无关代码。

最新 Edge 扩展的 7 项运行时探测全部通过：

1. Service Worker → Offscreen → RuntimeManager → Worker 真实生成 Qwen 输出 `Hello! It's nice to meet you`，实际后端 cpu。
2. LLM 与 PaddleOCR-VL 同时 ready，各自会话版本及 Worker 实例；估算驻留分别 1194 / 1969 MB。
3. 图像编码运行 1 秒后取消；LLM 保持可生成，VLM 可以重新加载。未取得 VLM 输出，未把这项计作 VLM 推理重跑通过。
4. 独享模式 LLM → VLM 切换，旧模型卸载、池内只剩目标重模型。
5. 1969 MB 预算下加载 LLM 会淘汰空闲 VLM；1 MB 预算拒绝 VLM 加载。
6. 真关闭宿主后第一个设置请求成功，恢复 storage 保存的 4096 MB；六服务 unloaded、资源池为空。
7. 新请求自动重新加载 Qwen 并生成真实文本。

多页面补测通过：第二个选项页读到相同模型和会话版本；在第二页卸载后第一页也变为 unloaded；第二页关闭宿主后第一页新请求恢复设置且池为空。页面刷新及完整 Edge 重启后，4096 MB 预算保持、安装模型记录保持、会话回到 unloaded。测试后恢复预算 0、空闲 10 分钟、独享关闭，保留最新 Edge 扩展供测试。Demo 实际临时 1 分钟空闲卸载也通过，随后恢复 10 分钟。

最终扩展 50322706 字节 / ZIP 14375033；本地 AI 静态资源 44142125 字节。ORT（23567050）、Wllama（8457512）、OpenCV（7616022）WASM 各一份，哈希与 Demo 一致。未新增推理依赖、模型权重打包或 WASM 副本。旧 build/analysis 报告不是此基准的干净构建，不用于声称本次体积缩减；Demo 相对拆分页签前后有可复现对比（详见其 roadmap）。
