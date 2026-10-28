# 文档目录

- [插件开发指南](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md)：当前插件契约与开发流程。
- [OpenAI 兼容协议插件](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md)：聊天、翻译、转写、语音与图片识别。
- [DeepSeek 插件](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md)：聊天、翻译与声明式协议规则。

插件源码、开发指引、供应商协议测试和发布流程统一维护在[官方插件项目](https://github.com/fishjar/kiss-translator-plugins)。该项目独立打包并发布版本化 ZIP 和目录索引；主项目仅使用通用测试样例验证 SDK，不保存官方发布包、目录或哈希快照。插件可从“接口插件 → 官方插件”联网安装，或下载独立 ZIP 后导入。

当前宿主统一使用插件 API 1（数字 `apiVersion: 1`）。清单不再使用 manifestVersion，声明式规则使用 format:"http" / "protocol"；支持字段默认值回退、PCM16 转 WAV 和远程决策。开发阶段不兼容旧契约，详见官方插件开发指南。

## 提交 PR 前的本地预检

安装依赖后，在仓库根目录运行：

```sh
pnpm check:pr
```

预检先执行现有的 `pnpm run format`，再以 `CI=true` 依次构建 Web（包含首页）、iOS 油猴脚本、规则 JSON 和 Chrome 扩展。CRA 生产构建会将警告视为错误，任一步失败都会停止后续步骤。完整构建可能需要数分钟。

格式化沿用 `.prettierignore`，排除 `node_modules`、`build`、`public`、`package.json` 和字幕测试样本目录。产生的源文件差异保留在工作区，即使后续构建失败也不会回滚；请检查差异后再提交。预检不会自动暂存、提交或推送。

此命令不包含 Firefox、Thunderbird、Safari 构建或真实浏览器功能验证。本地预检通过后，仍需确认远程 CI 的结果。
