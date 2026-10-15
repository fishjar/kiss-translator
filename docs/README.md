# 文档目录

- [插件开发指南](plugins/plugin-development-guide.md)：当前插件契约与开发流程。
- [OpenAI 兼容示例](plugins/examples/openai-compatible-bundle/README.md)：多服务插件示例。
- [DeepSeek 声明式示例](plugins/examples/deepseek/README.md)：JSON 协议规则示例。

两个示例的源码和说明纳入 Git；生成的 ZIP、浏览器截图和本地验收报告不纳入 Git。需要示例 ZIP 时，将对应示例目录的内容压缩，确保 `manifest.json` 位于 ZIP 根目录。

## YouTube 字幕

- 普通播放页和 Shorts 自动获取当前字幕轨；获取失败时，播放器菜单显示原因并提供“重新获取”。字幕已取得但翻译失败时，使用独立的“重试翻译”。
- 必要时启用原生 CC 以加载字幕；用户主动关闭 CC 后停止当前处理，不反复打开。关闭扩展翻译会恢复原生字幕显示，不关闭原生 CC。
- 菜单分别显示获取状态与字幕处理进度；“下载已处理部分”只导出当前可用内容，处理完成不代表所有译文均已完成。
- 此流程不识别音频，不为无字幕视频生成 ASR 字幕；YouTube 返回空正文、限流或网络失败会明确提示，不判定为没有字幕。
