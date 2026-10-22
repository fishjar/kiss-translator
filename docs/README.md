# 文档目录

- [插件开发指南](plugins/plugin-development-guide.md)：当前插件契约与开发流程。
- [OpenAI 兼容示例](plugins/examples/openai-compatible-bundle/README.md)：多服务插件示例。
- [DeepSeek 声明式示例](plugins/examples/deepseek/README.md)：JSON 协议规则示例。

两个示例的源码和说明纳入 Git；生成的 ZIP、浏览器截图和本地验收报告不纳入 Git。需要示例 ZIP 时，将对应示例目录的内容压缩，确保 `manifest.json` 位于 ZIP 根目录。

## 提交 PR 前的本地预检

安装依赖后，在仓库根目录运行：

```sh
pnpm check:pr
```

预检先执行现有的 `pnpm run format`，再以 `CI=true` 依次构建 Web（包含首页）、iOS 油猴脚本、规则 JSON 和 Chrome 扩展。CRA 生产构建会将警告视为错误，任一步失败都会停止后续步骤。完整构建可能需要数分钟。

格式化沿用 `.prettierignore`，排除 `node_modules`、`build`、`public`、`package.json` 和字幕测试样本目录。产生的源文件差异保留在工作区，即使后续构建失败也不会回滚；请检查差异后再提交。预检不会自动暂存、提交或推送。

此命令不包含 Firefox、Thunderbird、Safari 构建或真实浏览器功能验证。本地预检通过后，仍需确认远程 CI 的结果。
