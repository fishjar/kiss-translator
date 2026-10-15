# OpenAI 兼容协议插件示例

这是 [SDK v1](../../plugin-development-guide.md) 的示例，可安装到包含 Provider 运行时的当前开发分支。不包含 API Key；创建实例后需填写并授权对应服务。

包中有五个服务接口：

| 接口              | 实现                          | 创建后实例能力                     |
| ----------------- | ----------------------------- | ---------------------------------- |
| chat-completions  | services/chat.js              | chat、translate（完整/流式）       |
| transcriptions    | services/transcription.json   | transcribe                         |
| speech            | services/speech.json          | synthesizeSpeech                   |
| vision            | services/vision.js            | parseImage（全文识别，无坐标）     |
| signed-dictionary | services/signed-dictionary.js | dictionary（自定义/mock 签名端点） |

可以分别开关实例的 chat / translate；关闭 translate 隐藏“翻译采样温度”，重新开启保留其值。未启用能力不进入场景或测试候选，不能直接调用。

创建一个 chat-completions 实例就可以在翻译场景和聊天测试中复用；场景调用时分别指定 translate/chat，路由至对应 handler。无需按能力重复创建实例。需要不同模型/账号时再创建第二个实例。

sharedSettings 只减少表单重复定义，每个实例保存自己的 baseUrl 和 apiKey。模型字段为必填，支持预定义目录和自定义填写；文本/图片目录包含真实模型 ID，默认 gpt-6-luna；目录外的自定义 ID 继承服务能力，作者应确认相同参数和结果协议受支持。聊天和翻译默认使用流式，可在同一实例关闭。API 地址包含 /v1，可指向支持这些协议的服务；兼容服务不一定支持所有端点和模型，须分别验证。

1.4.0 在 Manifest 中公开翻译及图片识别的默认提示词。接口插件页展开服务接口的“预览提示词”时可只读查看和复制；服务配置保留“插件内部默认”或自定义提示词选择，不展示预览。需要修改时由用户在提示词管理手工创建实体后选择。明确指定的任务/场景提示词优先。单句 text、聚合 JSON 默认声明与 SDK 对应模式共用规范内容，打包脚本校验一致，避免预览和实际调用不一致。实例保存独立快照，正文不显示源码编辑框；网络授权和撤销在底部接口操作菜单。

文本翻译使用稳定 ID 编解码；图片识别读取任务资产组装 data URL，输出全文并保留 poly=null，不能用于要求坐标的擦除回填。流式示例要求正常终止帧，截断返回错误。ASR 不声明时间戳。TTS 使用 gpt-4o-mini-tts 与 MP3，Manifest 自带 13 种音色，默认 marin，不依赖宿主旧 tts-1 音色表。签名词典的 `/dictionary` 是自定义/mock 协议，不是 OpenAI 端点。

## 真实模型目录（1.6.0）

| 服务                     | 建议模型                                    | 默认值          |
| ------------------------ | ------------------------------------------- | --------------- |
| chat-completions、vision | gpt-6-luna、gpt-6.1-sol、gpt-6-astra        | gpt-6-luna      |
| transcriptions           | gpt-transcribe                              | gpt-transcribe  |
| speech                   | gpt-4o-mini-tts、gpt-4o-mini-tts-2025-12-15 | gpt-4o-mini-tts |

核对日期：2026-10-10。依据：[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)、[GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)、[文件转写](https://developers.openai.com/api/docs/guides/speech-to-text)、[语音合成接口](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)。这是当前示例端点的建议目录，账号权限与兼容服务的支持情况需另行确认。

文本/视觉继续使用 Chat Completions。Luna（以及自定义 gpt-6-sol）设置 reasoning_effort=none；Sol 6.1、Astra 设置 low，聊天/翻译不发送 temperature。因此“翻译采样温度”只在 none 推理模式或原有非 GPT-6 自定义模型下生效。示例不调用工具，保留稳定 ID 和现有流式解析。

ASR 使用 JSON 全文输出，不申请时间戳。TTS 保留 /audio/speech、MP3 和 speed 参数，音色改为本插件静态目录，包含 marin、cedar 等 13 种音色。官方 [TTS 指南](https://developers.openai.com/api/docs/guides/text-to-speech) 推荐 marin 或 cedar。

官方 [弃用记录](https://developers.openai.com/api/docs/deprecations) 已列出旧 Whisper/4o 转写及 TTS 快照的停用计划，并推荐 Realtime 模型作为部分 TTS 的后续替代；当前 /audio/speech 参考仍列 gpt-4o-mini-tts。该示例按现有文件合成端点更新，不把 Realtime 会话模型直接填入其目录。切换到 Realtime 需另行实现对应协议。

1.6.0 更新模型目录、默认值、GPT-6 请求参数和音色。旧实例使用独立快照，需要按宿主的实例升级流程更新；模板更新不会覆盖已有配置。

## 验证

在仓库根目录执行：

```powershell
node node_modules/react-app-rewired/bin/index.js test --watch=false --runInBand --runTestsByPath src/providers/example.test.js src/providers/translationExamples.test.js
```

`src/providers/example.test.js` 用生产 SDK 验证翻译、ASR/TTS JSON、图片组装、流式终止和截断。测试不访问真实厂家，不证明真实模型可用。

将本目录内容压缩为 ZIP，确保 manifest.json 位于 ZIP 根目录；不要将外层目录作为根，也不要加入实例配置、缓存或测试文件。缺少 icon.png 合法，宿主显示默认图标。通过“接口插件 → 导入 ZIP”安装，或用“导入文件夹”选择本目录（根部直接有 manifest.json），再在“服务配置 → 添加 → 外部插件”选择接口，立即创建实例；已有场景仍保存实例 apiSlug。

ZIP 为本地打包产物，不提交 Git。

## GitHub 源码分发

若通过 GitHub 项目地址安装，把本示例目录的 Manifest 和实现文件放到专用仓库根目录，提交完整可执行文件；不要把整个 kiss-translator 仓库作为插件项目。安装读取默认分支源码，不读取 Release，不运行构建。修改执行内容时提高 Manifest 版本；恢复按已记录提交 SHA 和内容指纹校验。

## 翻译模式与输出格式（1.6.1）

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

新模板版本为 1.6.1。已安装实例保留自己的快照，需先更新插件包，再创建升级实例、测试并替换场景引用。旧快照没有 protocol 声明时继续兼容 JSON；显式绑定宿主提示词时按该提示词的模式和协议执行。脚本若自行解析响应，需同步读取 translationMode/outputProtocol；使用 SDK helpers 的旧脚本可继承本次调用协议。
