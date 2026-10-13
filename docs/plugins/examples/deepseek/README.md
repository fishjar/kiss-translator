# DeepSeek 插件示例

这是 [SDK v1](../../plugin-development-guide.md) 的独立 JSON 声明式示例，规则使用 `rulesVersion: 2`，适用于支持该版本的当前开发分支。一个 `chat-completions` 服务实例同时提供 `chat` 和 `translate`，支持完整结果、流式输出及按稳定 ID 对齐的批量翻译。实现见 [services/chat.json](services/chat.json)，包内不含 JS 入口。

## 安装与配置

1. 在“接口插件 → 导入文件夹”选择本目录，目录根部直接包含 `manifest.json`。也可将本目录内容压缩为 ZIP，确保 `manifest.json` 位于 ZIP 根目录，再导入 ZIP。
2. 在“接口插件”授权网络访问，再在“服务配置 → 添加 → 外部插件”选择“DeepSeek 文本生成与翻译”。
3. 填写自己的 DeepSeek API Key，选择模型并保存；在翻译场景选择该实例，或在能力测试中测试聊天和翻译。“快捷翻译测试”可直接验证当前未保存配置，不会自动保存。

| 配置         | 默认值与说明                                                               |
| ------------ | -------------------------------------------------------------------------- |
| API 基础地址 | `https://api.deepseek.com`；SDK 追加 `/chat/completions`，不要填写完整端点 |
| API Key      | 必填；由宿主以 Bearer 注入，包内不包含密钥                                 |
| 模型         | `deepseek-flash`；目录另含 `deepseek-v4-pro`，允许手动填写兼容模型 ID      |
| 思考模式     | 关闭；可选接口默认 / 开启思考 / 关闭思考，接口默认不发送思考参数           |
| 思考强度     | `high`；可选接口默认 / `low` / `high` / `max`，仅开启且选择具体强度时发送  |
| 翻译采样温度 | `0`；仅启用翻译时显示，仅关闭思考模式时发送；聊天不设置温度                |

本例按文本输入实现，不声明图片、音频或工具调用能力。模型目录只表示本例实现的能力范围，不是厂家的全部能力清单。完整聊天结果保留 `reasoning_content` 为 `reasoning`，流式聊天输出 `reasoning.delta` 和 `text.delta`；翻译只解析最终正文，避免将推理内容混入译文。

翻译复用 SDK 的模式对应提示词及编解码，不强制 response_format=json_object。非聚合输出纯文本；聚合按所选提示词使用 JSON、LINE 或 XML。Manifest 公开默认单句 text 和聚合 JSON 提示词，测试校验其与 SDK 默认模板一致。流式翻译将正文转为 item.delta/item.complete；最终校验正常终止和全部输入 ID，缺项、重复 ID、API 错误及流中断都会失败。

JSON 选择 `openai-chat-completions` 协议和 `chat` / `translate` 任务，由宿主组装请求、展开提示词并解析完整或流式响应。`$if` 支持布尔配置及 select 配置的 `equals` 比较；缺少对应分支时省略参数。网络通过宿主 Broker，凭据通过 `$secret` 引用，不执行用户脚本。实例保存独立配置与实现快照；已有实例需先手动更新 1.2.1 模板，再按现有流程升级实例；不会自动改写旧实例。ZIP 只包含 Manifest 和 JSON，是不提交 Git 的本地构建产物。

## 验证

在仓库根目录执行：

```powershell
pnpm test --watchAll=false --runInBand --runTestsByPath src/providers/deepseekExample.test.js
pnpm test --watchAll=false --runInBand --runTestsByPath src/providers/declarative.test.js
```

测试使用实际包解析器、声明式执行器和生产 SDK，mock HTTP；检查实例创建、鉴权引用、思考参数、批量 ID、流式推理与截断处理。通用声明式测试另覆盖能力路由、非法规则及图片资产。未调用真实 DeepSeek API，不代表账号权限、模型可用性或浏览器安装已实测。

## 官方参考

文档核对日期：2026-10-10。模型和参数可能变化，使用时以官方文档为准。

- [首次调用 API](https://api-docs.deepseek.com/zh-cn/)：基础地址、Bearer 鉴权与当前模型名称。
- [Chat Completions API](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)：请求参数、返回结构与 SSE 终止标记。
- [思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)：开关、强度及思考模式下温度不生效。

## 翻译模式与输出格式（1.2.1）

关闭聚合时使用 text，每次只翻译一项；开启聚合后按所选聚合提示词使用 json、line 或 xml，即使只合并到一项也不切换为 text。HTTP 请求仍使用 Chat Completions，与译文格式分开。

默认单句提示词使用 {{text}}，默认聚合提示词使用 {{segments}}。{{items}} 始终是带稳定 ID 的 JSON；{{segments}} 按所选格式编码。用户绑定的模板保持原文，SDK 不追加矛盾的格式要求。

在“提示词管理”复制对应模板：单句模板使用单句分类；LINE/XML 使用聚合分类并选择相同协议，再在服务配置或场景中绑定。

| 格式 | 系统提示词的输出要求                                       | 用户提示词     | 输入/输出示例                                                          |
| ---- | ---------------------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| text | 只输出译文，不输出 ID、解释或 Markdown 围栏                | {{text}}       | Hello → 你好                                                           |
| json | 输出 JSON 数组 {id,text}，每个 ID 恰好一次                 | {{segments}}   | [{"id":"a","text":"Hello"}] → [{"id":"a","text":"你好"}]               |
| line | 输出 `ID \| Text`，每个 ID 恰好一次，内部换行保留 `<br>`   | `{{segments}}` | `a \| Hello` → `a \| 你好`                                             |
| xml  | 输出 `root/t` 元素，保留 `id`，转义 XML 实体并保留内部换行 | `{{segments}}` | `<root><t id="a">Hello</t></root>` → `<root><t id="a">你好</t></root>` |

以下是可复制的四种默认模板；sourceLanguage、targetLanguage、glossary、context 均来自本次任务：

```json
{
  "json": {
    "systemPrompt": "Translate the input items from {{sourceLanguage}} to {{targetLanguage}}. Return only a JSON array of {id,text}, keeping every ID. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  },
  "text": {
    "systemPrompt": "Translate the source text from {{sourceLanguage}} to {{targetLanguage}}. Output only the translated text, without explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{text}}"
  },
  "line": {
    "systemPrompt": "Translate each input line from {{sourceLanguage}} to {{targetLanguage}}. Output only ID | Text lines, keeping every ID exactly once. Keep <br> for internal newlines. Do not output explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  },
  "xml": {
    "systemPrompt": "Translate the text of each <t> element from {{sourceLanguage}} to {{targetLanguage}}. Output only <root><t id=\"ID\">Text</t></root>, keeping every ID exactly once. Escape XML entities and preserve internal newlines. Do not output explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  }
}
```

新模板版本为 1.2.1。已安装实例保留自己的快照，需先更新插件包，再创建升级实例、测试并替换场景引用。旧快照没有 protocol 声明时继续兼容 JSON；显式绑定宿主提示词时按该提示词的模式和协议执行。脚本若自行解析响应，需同步读取 translationMode/outputProtocol；使用 SDK helpers 的旧脚本可继承本次调用协议。
