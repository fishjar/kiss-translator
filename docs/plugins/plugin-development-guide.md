# 网络服务插件开发指南（SDK v1）

本文面向插件作者，完整说明创建、配置、执行、调试和发布插件所需的文件与接口。无需阅读 KISS Translator 源码，也无需克隆项目才能开发插件。

契约核对：2026-10-10。适用于已提供“接口插件”页面及声明式协议规则 v2 的当前开发分支；正式发布版以对应版本支持的功能为准。`apiVersion: "1"` 是 SDK 版本，`rulesVersion` 是规则格式版本，两者独立。

## 目录

1. [概念与实现方式](#1-概念与实现方式)
2. [从零创建首个插件](#2-从零创建首个插件)
3. [Manifest 完整参考](#3-manifest-完整参考)
4. [声明式协议规则 v2](#4-声明式协议规则-v2)
5. [声明式请求映射规则 v1](#5-声明式请求映射规则-v1)
6. [14 项能力的输入输出](#6-14-项能力的输入输出)
7. [JavaScript 与 ctx SDK](#7-javascript-与-ctx-sdk)
8. [HTTP、凭据和资产](#8-http凭据和资产)
9. [公共 helpers](#9-公共-helpers)
10. [流式输出与批量翻译](#10-流式输出与批量翻译)
11. [提示词与场景参数](#11-提示词与场景参数)
12. [安装、授权、更新和发布](#12-安装授权更新和发布)
13. [调试与故障排查](#13-调试与故障排查)
14. [发布前检查清单](#14-发布前检查清单)

## 1. 概念与实现方式

网络服务插件是翻译、聊天、OCR、转写、语音合成等服务的协议适配器。它不是浏览器扩展，不能添加页面、操作 DOM、调用扩展 API 或安装本地推理引擎。

| 概念                | 含义                               | 例子                                   |
| ------------------- | ---------------------------------- | -------------------------------------- |
| 插件包              | 分发单位，包含 Manifest 和实现文件 | my-text-provider                       |
| 服务接口（service） | 共用一组配置的能力定义             | 同时提供 chat 与 translate 的文本接口  |
| 能力（capability）  | 标准任务名，输入输出固定           | translate、transcribe                  |
| 处理器（handler）   | 实际执行函数或规则名               | exports.translate / handlers.translate |
| 实例                | 用户从定义创建的独立配置和实现快照 | 工作账号、个人账号                     |
| 场景                | 选择实例并发起任务的功能           | 网页翻译、词典、文件识别               |

执行流程：安装 → 本机授权 → 添加实例 → 填写并保存配置 → 能力测试或场景调用 → 执行 handler → 校验标准结果。

一个服务可实现多个能力，不必为每个能力复制账号、URL 和模型配置。需要独立模型或参数的端点可拆成不同服务。宿主不会自动将 chat 当作 translate，必须分别声明和实现。

| 实现方式                     | 适合情况                                            | 执行方式                         |
| ---------------------------- | --------------------------------------------------- | -------------------------------- |
| declarative + rulesVersion 2 | Chat Completions 兼容的文本聊天、翻译、图片全文识别 | 宿主负责消息、协议解析和流式事件 |
| declarative + rulesVersion 1 | 一次固定 HTTP 请求与固定 JSON 映射，或取得音频资产  | 宿主解析固定取值节点             |
| script                       | 自定义协议、复杂分支、签名和特殊结果转换            | 单文件 JS 在 Sval Worker 中执行  |

外部包不能使用 native。v2 不是 v1 的字段超集，不能在同一 handler 中混用；一个包可让不同服务分别引用 v1、v2 和 JS 文件。

场景保存实例 ID（apiSlug），作者不生成或管理它。可用能力由“服务声明 ∩ 当前目录模型限制 ∩ 用户启用能力”决定，还需满足场景坐标、时间戳等要求。声明能力不代表每个界面都有对应入口。

实例复制实现、字段、能力、模型目录、默认提示词和资源，彼此独立。更新模板不改变旧实例，卸载模板不删除实例快照。

## 2. 从零创建首个插件

以下两个文件就是完整插件，提供文本聊天、批量翻译与流式输出。假设服务使用 Chat Completions 兼容协议，能按提示词输出带 ID 的翻译 JSON；其他协议见第 5、7 节。开发前只需准备文本编辑器、提供“接口插件”功能的扩展，以及服务地址和测试凭据；Node.js 仅用于可选自检。

### 2.1 目录

使用文本编辑器创建以下目录，保存 UTF-8，无需 npm 项目或构建工具：

```text
my-text-provider/
├── manifest.json
└── services/
    └── text.json
```

### 2.2 manifest.json

复制完整 JSON。example.invalid 是不可访问的占位地址，安装后换成真实地址；model 也需填写真实模型 ID。发布时更换 id/name，不把 API Key 放入默认值。

```json
{
  "manifestVersion": 1,
  "id": "my-text-provider",
  "name": "我的文本服务",
  "version": "1.0.0",
  "apiVersion": "1",
  "permissions": { "endpointFields": ["baseUrl"] },
  "sharedSettings": [
    {
      "key": "baseUrl",
      "label": "API 基础地址（包含协议前缀，例如 /v1）",
      "type": "text",
      "defaultValue": "https://example.invalid/v1",
      "required": true
    },
    {
      "key": "apiKey",
      "label": "API Key",
      "type": "password",
      "required": true
    }
  ],
  "services": [
    {
      "id": "text",
      "name": "文本聊天与翻译",
      "implementation": {
        "kind": "declarative",
        "entry": "services/text.json"
      },
      "capabilities": {
        "chat": {
          "handler": "chat",
          "inputModalities": ["text"],
          "outputModes": ["complete", "stream"]
        },
        "translate": {
          "handler": "translate",
          "batch": { "supported": true, "maxItems": 20 },
          "outputModes": ["complete", "stream"]
        }
      },
      "settings": [
        { "key": "model", "label": "模型 ID", "type": "text", "required": true }
      ]
    }
  ]
}
```

### 2.3 services/text.json

复制完整规则，无需 JavaScript：

```json
{
  "rulesVersion": 2,
  "handlers": {
    "chat": {
      "protocol": "openai-chat-completions",
      "task": "chat",
      "request": {
        "baseUrl": { "$ref": "config.baseUrl" },
        "model": { "$ref": "config.model" },
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
      }
    },
    "translate": {
      "protocol": "openai-chat-completions",
      "task": "translate",
      "request": {
        "baseUrl": { "$ref": "config.baseUrl" },
        "model": { "$ref": "config.model" },
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
      }
    }
  }
}
```

chat 使用任务 messages；translate 由 SDK 生成默认翻译消息、解析 JSON、按输入 ID 对齐。凭据在 origin 已授权后由宿主注入，规则不读取明文。

### 2.4 安装和验证

1. 扩展设置“接口插件 → 导入文件夹”，选择 my-text-provider，根部直接有 manifest.json。
2. 确认安装与授权；尚未授权时到“接口插件”页授权。
3. “服务配置 → 添加 → 外部插件”选择“文本聊天与翻译”，创建实例。
4. 填真实基础地址、API Key、模型 ID，保存。baseUrl 为 https://api.example.com/v1 时，请求为 https://api.example.com/v1/chat/completions；不要填完整端点。
5. 下方能力测试选 chat，输入 Hello，执行应显示文本结果。
6. 再选 translate，输入 Hello，应显示中文译文，测试默认目标语言 zh-CN。
7. 分别关闭/开启流式测试，再到网页翻译等实际场景选择实例验证。

服务不支持流式时，两项 outputModes 改为 ["complete"]。翻译只返回普通文本时，v2 的 JSON 解析不适用，应改用 script 自定义转换。

ZIP 根部必须为 manifest.json 和 services/，不能额外套 my-text-provider/。PowerShell 示例（在父目录，输出 ZIP 尚不存在）：

```powershell
Compress-Archive -Path .\my-text-provider\* -DestinationPath .\my-text-provider.zip
```

源文件修改不会自动更新已安装模板或已有实例。提高版本后手动更新模板，再创建或升级实例，详见第 12 节。

## 3. Manifest 完整参考

Manifest 使用标准 JSON，不支持注释或尾随逗号。路径相对于包根目录，使用 `/`，不能使用绝对路径、反斜线、冒号、`.` 或 `..` 路径段。

### 3.1 顶层字段

| 字段            | 类型 / 必需    | 规则                                                |
| --------------- | -------------- | --------------------------------------------------- |
| manifestVersion | 整数，必需     | 固定 1                                              |
| id              | 字符串，必需   | 稳定 ID，匹配 `^[a-z][a-z0-9-]{1,100}$`，2–101 字符 |
| name            | 字符串         | 插件显示名，发布时填写                              |
| version         | 字符串，必需   | 三段数字，如 1.0.0，无 v 前缀、预发布或构建后缀     |
| apiVersion      | 字符串，必需   | 固定 "1"，不是整数                                  |
| services        | 非空数组，必需 | 服务定义                                            |
| sharedSettings  | 可选字段数组   | 共用字段定义，实例值各自独立                        |
| permissions     | 可选对象       | network 和 endpointFields                           |
| icon            | 可选字符串     | 包内 PNG/JPEG/WebP 路径，最大 256 KiB               |
| resources       | 可选数组       | `{id,path,mimeType}`，见第 8 节                     |

图标只存本机、不复制到实例；缺模板、卸载或解码失败时使用默认图标，不影响执行。不要依赖未定义的额外字段控制行为。

### 3.2 服务字段

| 字段                 | 说明                                          |
| -------------------- | --------------------------------------------- |
| id                   | 包内唯一、稳定，匹配 `^[A-Za-z][\w-]{0,100}$` |
| name                 | 接口显示名                                    |
| implementation.kind  | script / declarative，禁止 native             |
| implementation.entry | 实际存在的包内 JS / JSON 路径                 |
| capabilities         | 非空对象，键为第 6 节标准能力                 |
| settings             | 本服务字段，与 sharedSettings 合并            |
| modelField           | 模型字段键，省略时 model                      |
| models               | 可选非空建议目录，见 3.6                      |
| defaultPrompts       | 可选默认模板，见第 11 节                      |

服务 ID、handler、字段键、资源 ID 不得为 **proto**、constructor、prototype。JS 每个入口为完整单文件，不运行时加载其他脚本/npm 依赖，有依赖需作者预先合并。

### 3.3 能力描述

```json
{
  "translate": {
    "handler": "translate",
    "batch": { "supported": true, "maxItems": 20 },
    "outputModes": ["complete", "stream"],
    "inputModalities": ["text"]
  }
}
```

| 属性            | 规则与默认                                                                            |
| --------------- | ------------------------------------------------------------------------------------- |
| handler         | 必需字符串，匹配 `^[A-Za-z_$][\w$]*$`，对应 exports / rules.handlers                  |
| batch           | 提供时 supported 必须为布尔值，maxItems 为可选正整数；未支持批量时 translate 拒绝多项 |
| outputModes     | 非空数组 complete / stream，省略按完整结果                                            |
| inputModalities | 非空数组 text / image / audio，聊天省略仅文本                                         |
| coordinates     | 布尔值，true 必须返回有效文字坐标                                                     |
| timestamps      | 布尔值，转写 true 必须返回 segments                                                   |
| taskModes       | 非空数组 doc / table / formula，图片省略仅 doc                                        |

批量、流式、坐标、时间戳是特性，不是能力名。仅声明真实实现的特性，执行器额外限制见第 4、5 节。流式也必须返回完整结果。

### 3.4 配置字段

```json
{
  "key": "translationTemperature",
  "label": "翻译温度",
  "type": "number",
  "defaultValue": 0,
  "min": 0,
  "max": 2,
  "visibleForCapabilities": ["translate"]
}
```

| 属性                   | 规则                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| key                    | 必需，匹配 `^[A-Za-z_$][\w$]*$`，JS 读 config[key]                  |
| label                  | 表单文字                                                            |
| type                   | 必需 text / password / number / boolean / select                    |
| defaultValue           | 可选，符合类型，不预置真实凭据                                      |
| required               | 可选布尔值，缺失/null/空白字符串视为未填写                          |
| isSecret               | password 自动为秘密，其他字段可显式 true                            |
| min/max                | 有限数值，用于 number，min 不大于 max                               |
| options                | select 数组，每项 `{label,value}`，value 字符串/数字                |
| optionsSource          | select 公共来源，当前 `speech.voices.openai.tts-1`，与 options 互斥 |
| visibleForCapabilities | 非空且不重复的能力数组，任一绑定能力启用时显示                      |

text/password 值必须是字符串，number 必须是有限数值，boolean 必须是布尔值。select 严格匹配选项值和类型，字符串 `"1"` 不等于数字 `1`。服务字段覆盖同键公共字段时，类型和秘密属性必须一致，可覆盖默认值、标签等定义。

公共字段和权限会对每个服务校验，公共的能力专属字段也必须在各服务中合法。鉴权、模型和 endpointFields 字段不能设置 visibleForCapabilities。隐藏字段的值保留，隐藏的必填项不阻止保存；重新启用后恢复校验。允许关闭全部能力，此时实例不可调用。

### 3.5 网络权限

```json
{
  "permissions": {
    "network": ["https://api.example.com", "http://localhost:8080"],
    "endpointFields": ["baseUrl"]
  }
}
```

- network 为完整 origin：协议、主机、可选端口，无路径、尾斜线、查询、账号或通配符。
- 必须 HTTPS，仅 localhost、127.0.0.1、[::1] 可用 HTTP，普通局域网 HTTP 不支持。
- endpointFields 引用各服务合并后存在的非秘密 text 字段，允许访问该实例已保存值的 origin，不限制到某个路径。
- 请求同时满足实例范围与本机授权；固定地址授权按插件 ID 共享，实例不能访问自身声明之外的地址。
- 已授权插件的端点字段改地址无需逐地址授权。不要声明与业务无关的端点字段。
- 禁止 Cookie、URL 用户名密码、重定向及其他实例凭据，不授予浏览器 API 权限。

### 3.6 模型目录

服务已声明 chat/translate 且存在非秘密 text 字段 model 时可添加：

```json
{
  "modelField": "model",
  "models": [
    { "id": "model-a", "name": "通用模型" },
    {
      "id": "model-b",
      "name": "仅完整翻译",
      "capabilities": {
        "translate": {
          "outputModes": ["complete"],
          "batch": { "supported": false }
        }
      }
    }
  ]
}
```

模型目录的 ID 必须唯一。用户可输入自定义 ID，目录不是白名单。未声明 capabilities 的模型和自定义 ID 继承服务能力；显式声明 capabilities 时，未列出的能力不可用，特性与服务声明取交集，不能新增 handler 或扩大服务能力。

默认模型优先采用字段默认值，否则取目录第一项；没有目录时由用户填写。切换模型保留原启用能力与新支持范围的交集，交集为空时启用新模型能力并提示。更新目录仅影响新实例，旧实例保留原目录快照。

## 4. 声明式协议规则 v2

v2 的每个 handler 只允许 protocol、task 和 request 三个字段，没有 response 映射。宿主负责生成消息、选择完整或流式请求，并将协议结果转换为标准结果。

### 4.1 字段与能力限制

| 字段               | 规则                                                    |
| ------------------ | ------------------------------------------------------- |
| rulesVersion       | 整数 2                                                  |
| handlers           | handler 映射，覆盖 Manifest 引用                        |
| protocol           | 仅 openai-chat-completions                              |
| task               | chat / translate / parseImage，与能力名一致             |
| request.baseUrl    | 必需字符串或取值节点，包含 /v1 等前缀                   |
| request.model      | 必需字符串或取值节点                                    |
| request.auth       | 必需 Bearer，secret 为 `{"$secret":"已声明秘密字段键"}` |
| request.parameters | 可选普通对象，厂家额外请求体参数                        |

request 不接受 url/method/headers/bodyType/responseType/streamFormat。parameters 不覆盖 baseUrl/auth/model/messages/stream，不含原型属性或 $ 开头键。

| task       | 自动处理                                         | 特性                                         |
| ---------- | ------------------------------------------------ | -------------------------------------------- |
| chat       | input.messages → Chat Completions → 标准聊天结果 | 仅 text，complete/stream，无批量/坐标/时间戳 |
| translate  | 翻译消息 → 带 ID JSON → items                    | complete/stream，可批量，无坐标/时间戳       |
| parseImage | 图片 data URL + prompt → 全文                    | image，complete，无 stream/坐标/时间戳/批量  |

v2 chat 不支持多模态转换，image/audio chat 使用 script。parseImage 支持 PNG/JPEG/WebP/GIF，真实 MIME 与 AssetRef 必须一致，返回 `{text,format:"text",items:[{text,poly:null}]}`，按非空行拆分，不能用于要求坐标的场景。

### 4.2 取值与条件

parameters 示例（字段先在 settings 声明）：

```json
{
  "temperature": { "$ref": "config.translationTemperature" },
  "max_tokens": { "$ref": "config.maxTokens", "omitIfEmpty": true }
}
```

`$ref` 保留原类型，字段缺失时默认报错。omitIfEmpty 在值为 undefined、null 或空字符串时省略字段，空白字符串不省略；omitValues 按严格值匹配省略。路径仅支持 config/input 起始的固定属性和数组索引，如 input.messages[0].role，不支持 response/resources、表达式、通配符或原型属性。

条件可引用已声明非秘密 boolean 配置字段（`{"$if":{"$ref":"config.useCustomTemperature"},"then":0}`），或使用 `equals` 与非秘密 select 配置的已声明选项进行严格比较；不判断输入长度、不调用函数。布尔条件的配置值必须为 boolean，不进行类型转换。

`$if` 节点只允许 `$if`、then 和 else，且至少提供一个分支。未提供所选分支时省略对象字段或数组元素，最大嵌套深度为 32。

思考配置统一使用 `thinkingMode`（select，选项 `auto` / `enabled` / `disabled`）和可选的 `thinkingEffort`（select，由服务声明实际支持的强度，`_default` 表示接口默认）。服务配置页将这两个字段渲染为统一下拉框，仅开启思考时显示强度。推荐模式默认值为 `disabled`，实际请求参数由插件实现决定：`auto` 应省略思考参数，`_default` 应省略强度参数。例如：

```json
{
  "thinking": {
    "$if": { "$ref": "config.thinkingMode", "equals": "auto" },
    "else": { "type": { "$ref": "config.thinkingMode" } }
  },
  "reasoning_effort": {
    "$if": { "$ref": "config.thinkingMode", "equals": "enabled" },
    "then": { "$ref": "config.thinkingEffort", "omitValues": ["_default"] }
  }
}
```

`equals` 仅接受引用字段声明的选项值，比较不会转换类型，不能引用秘密字段。设置清单须声明上述模式、强度及默认选项；不支持思考的服务无需声明这些字段。已安装插件由用户手动更新模板和实例，不自动迁移。

v2 普通节点仅支持 `$ref`（含省略选项）和 `$if`，不支持 transform、`$url` 或 `$asset`；`$secret` 仅用于规定的 auth.secret 位置。

### 4.3 完整图片服务

第 2 节 services 添加：

```json
{
  "id": "vision",
  "name": "图片全文识别",
  "implementation": { "kind": "declarative", "entry": "services/vision.json" },
  "capabilities": {
    "parseImage": {
      "handler": "parseImage",
      "inputModalities": ["image"],
      "taskModes": ["doc"],
      "coordinates": false,
      "outputModes": ["complete"]
    }
  },
  "settings": [
    { "key": "model", "label": "视觉模型 ID", "type": "text", "required": true }
  ]
}
```

新增 services/vision.json：

```json
{
  "rulesVersion": 2,
  "handlers": {
    "parseImage": {
      "protocol": "openai-chat-completions",
      "task": "parseImage",
      "request": {
        "baseUrl": { "$ref": "config.baseUrl" },
        "model": { "$ref": "config.model" },
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
      }
    }
  }
}
```

默认提示词要求忠实提取可见文字，明确传入的 input.prompt 优先。taskModes 只声明已验证模式；v2 不根据 input.mode 自动生成表格或公式专用提示词，需要场景传入合适的 prompt。需要坐标或特殊结果结构时使用 script。

## 5. 声明式请求映射规则 v1

v1 适合一次固定请求和结果映射，不自动生成消息，也不输出流事件，应声明 complete。复杂分支、逐项转换、签名和轮询使用 script。

### 5.1 完整转写服务

继续第 2 节公共 baseUrl/apiKey，services 添加：

```json
{
  "id": "transcription",
  "name": "音频转写",
  "implementation": {
    "kind": "declarative",
    "entry": "services/transcription.json"
  },
  "capabilities": {
    "transcribe": {
      "handler": "transcribe",
      "timestamps": false,
      "outputModes": ["complete"]
    }
  },
  "settings": [
    { "key": "model", "label": "转写模型 ID", "type": "text", "required": true }
  ]
}
```

新增 services/transcription.json：

```json
{
  "rulesVersion": 1,
  "handlers": {
    "transcribe": {
      "request": {
        "url": {
          "$url": { "base": "config.baseUrl", "path": "audio/transcriptions" }
        },
        "method": "POST",
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } },
        "bodyType": "multipart",
        "body": {
          "file": { "$asset": "input.audio" },
          "model": { "$ref": "config.model" },
          "response_format": "json",
          "language": {
            "$ref": "input.language",
            "omitIfEmpty": true,
            "omitValues": ["auto"],
            "transform": "languages.toIso6391"
          }
        },
        "responseType": "text"
      },
      "response": {
        "kind": "json",
        "errorPath": "error.message",
        "map": { "text": { "$ref": "response.text" } }
      }
    }
  }
}
```

### 5.2 节点与映射

| 节点                                                       | 作用                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `{"$ref":"config.model"}`                                  | 保留类型的取值，缺失报错                                 |
| $ref + omitIfEmpty/omitValues                              | 对象字段省略，判断先于 transform                         |
| $ref + transform:"languages.toIso6391"                     | 唯一转换白名单，未知语言报错                             |
| `{"$url":{"base":"config.baseUrl","path":"audio/speech"}}` | 按目录连接，保留 /v1；path 无起始 /、: 或 .. 段          |
| `{"$secret":"apiKey"}`                                     | 凭据引用，放 auth.secret/secretBindings.secret，不是明文 |
| `{"$asset":"input.audio"}`                                 | 任务资产引用                                             |

请求根 config/input/resources，响应 map 根 response。路径支持固定属性/数字索引如 response.choices[0].message.content，无表达式/过滤器/递归查询/任意 JS。

普通字符串不进行插值，`"{{config.model}}"` 是字面量。最大嵌套深度为 32。v1 的省略选项用于对象字段，不用于过滤数组，也不接受 `$if`。

response.kind=json 时先解析正文，按相对于响应根的 errorPath 检查业务错误，再按 map 生成标准结果。缺失字段不会自动变成空成功。kind=asset 将 responseType=asset 的引用转换为 `{audio,mimeType}`，适用于 synthesizeSpeech。

### 5.3 完整合成服务

services 添加：

```json
{
  "id": "speech",
  "name": "音频合成",
  "implementation": { "kind": "declarative", "entry": "services/speech.json" },
  "capabilities": {
    "synthesizeSpeech": {
      "handler": "synthesizeSpeech",
      "outputModes": ["complete"]
    }
  },
  "settings": [
    {
      "key": "model",
      "label": "合成模型 ID",
      "type": "text",
      "required": true
    },
    { "key": "voice", "label": "音色 ID", "type": "text", "required": true }
  ]
}
```

新增 services/speech.json：

```json
{
  "rulesVersion": 1,
  "handlers": {
    "synthesizeSpeech": {
      "request": {
        "url": { "$url": { "base": "config.baseUrl", "path": "audio/speech" } },
        "method": "POST",
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } },
        "bodyType": "json",
        "body": {
          "model": { "$ref": "config.model" },
          "voice": { "$ref": "config.voice" },
          "input": { "$ref": "input.text" },
          "speed": { "$ref": "input.speed", "omitIfEmpty": true },
          "response_format": "mp3"
        },
        "responseType": "asset"
      },
      "response": { "kind": "asset" }
    }
  }
}
```

该规则使用实例配置的 voice。若要让本次 input.voice 优先于实例默认值，应使用 script；v1 没有通用的默认值回退运算符。

## 6. 14 项能力的输入输出

以下 TypeScript 记法只说明数据，实际输入输出为可序列化对象：? 可选，A[] 数组，Record<string,A> 字符串键对象。厂家原始响应须转换为标准结果。

### 6.1 公共类型

```ts
type AssetRef = { assetId: string; mimeType: string; filename?: string };
type TextItem = { id: string; text: string };
type ImageSize = { width: number; height: number };
type OcrBlock = { text: string; poly: number[][] | null; confidence?: number };
type OcrResult = {
  text: string;
  format: "text" | "markdown";
  items?: OcrBlock[];
};
```

AssetRef 由宿主生成，不能编造或跨任务使用。文字 items 输入必须非空，id 必须是非空、唯一字符串，不要转换为数值。

poly 为输入图片像素点，例如 [[10,20],[110,20],[110,50],[10,50]]，至少 3 点，每点两个有限数值，非零面积。缩放后还原，不能用归一化/PDF 坐标。imageSize 宽高正有限数值，confidence/概率在 [0,1]，时间单位秒，0 <= start <= end。

### 6.2 translate

```ts
type Input = {
  items: TextItem[];
  translationMode?: "single" | "batch";
  outputProtocol?: "text" | "json" | "line" | "xml";
  targetLanguage: string;
  sourceLanguage?: string;
  textFormat?: "text" | "html";
  systemPrompt?: string;
  userPrompt?: string;
  glossary?: Record<string, string>;
  context?: string;
  tone?: string;
  document?: {
    title?: string;
    description?: string;
    summary?: string;
    url?: string;
  };
};
type Result = { items: TextItem[]; sourceLanguage?: string };
```

非聚合使用 single/text，仅接收一项；聚合使用 batch/json、line 或 xml，即使本次只有一项也保留聚合协议。模式由配置与实际生效提示词决定，不按项数推断。未指定新字段的直接 SDK 调用保持 JSON。

结果必须覆盖全部输入 ID，不能缺失、重复或增加。建议按输入顺序返回；SDK 解析器会按 ID 重排并拒绝空白译文。HTML 输入需要按场景要求处理结构，不能随意丢弃标签。

输入 `{"items":[{"id":"a","text":"Hello"},{"id":"b","text":"World"}],"targetLanguage":"zh-CN"}`，返回 `{"items":[{"id":"a","text":"你好"},{"id":"b","text":"世界"}]}`。

宿主负责聚合、调度和取消，handler 负责本次收到的全部 items。关闭实例聚合不能成为忽略显式多项输入的理由；不支持批量时声明 batch.supported=false。

### 6.3 chat

```ts
type Content =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image" | "audio"; asset: AssetRef }
    >;
type Input = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: Content }>;
};
type Result = {
  text: string;
  reasoning: string;
  usage?: Record<string, number>;
  finishReason?: string;
};
```

messages 必须非空，没有推理正文时返回 reasoning 空字符串。多模态需声明 inputModalities；宿主的 image/asset 结构不是厂家的 image_url，script 需要自行转换，helper 不自动转换。当前没有工具调用消息契约。

### 6.4 summarize、detectLanguage、dictionary、suggest

| 能力           | 输入                                                                  | 结果                                   |
| -------------- | --------------------------------------------------------------------- | -------------------------------------- |
| summarize      | `{text,language?,instructions?,userPrompt?,context?}`                 | `{text}`                               |
| detectLanguage | `{text,candidates?:string[]}`                                         | `{language:string,confidence?:number}` |
| dictionary     | `{text,sourceLanguage?,language?,context?,instructions?,userPrompt?}` | `{text,format:"text" \| "markdown"}`   |
| suggest        | `{text,language?}`                                                    | `{items:string[]}`                     |

输入 text 非空白，可选语言/提示词/上下文字符串。dictionary 当前文本或 Markdown，不要求词条对象。检测返回语言代码。

### 6.5 segmentSubtitle

```ts
type Input = {
  items: Array<{ id: string; text: string; start: number; end: number }>;
  sourceLanguage?: string;
  targetLanguage?: string;
  instructions?: string;
  context?: string;
};
type Result = {
  groups: Array<{ ids: string[]; text: string; translation?: string }>;
};
```

groups 和各组 ids 必须非空，所有组的 ID 串联后与输入顺序完全一致，每项只覆盖一次。输入 a,b,c 可分为 [a,b] 和 [c]，不能重排或遗漏，结果不需要重复输出时间。

### 6.6 transcribe

```ts
type Input = { audio: AssetRef; language?: string };
type Result = {
  text: string;
  segments?: Array<{ start: number; end: number; text: string }>;
};
```

仅返回全文时声明 timestamps=false；声明 true 时必须返回合法 segments。厂商返回的毫秒需要转换为秒。language 缺失或为 auto 时通常省略厂家语言参数。

### 6.7 recognizeText 与 parseImage

```ts
type Input = {
  image: AssetRef;
  mode?: "doc" | "table" | "formula";
  prompt?: string;
  imageSize?: ImageSize;
};
type Result = OcrResult;
```

recognizeText 是 OCR，parseImage 是视觉解析，taskModes 限制模式。两者均可坐标，与能力名字无关。

无坐标显式 poly=null 或省略整个 items。coordinates=true 至少一个非空文字项且每非空项有效 poly。不用全图矩形伪造文字位置。全文不能凭空生成擦除回填区域，PDF 无坐标只关联原区域。

### 6.8 analyzeLayout

```ts
type Input = { image: AssetRef; imageSize?: ImageSize };
type Result = {
  regions: Array<{ type: string; poly: number[][]; order: number }>;
};
```

type 区域类型字符串，order 阅读顺序非负整数，图片像素坐标由宿主按实际尺寸转换到 PDF。

### 6.9 evaluate

```ts
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Question =
  | {
      type: "choice";
      instructions: Json;
      criteria: string[] | Record<string, Json>;
    }
  | { type: "score"; instructions: Json; criteria: Json[] }
  | {
      type: "noul";
      instructions: Json;
      criteria?: { false?: Json; true?: Json } | null;
    };
type Input = {
  state: string | Json[] | Record<string, Json>;
  questions: Record<string, Question>;
};
type Action = { act_probability: number };
type Answer =
  | {
      type: "choice";
      confidence: number;
      action: Action;
      choice: string;
      probabilities: Record<string, number>;
    }
  | {
      type: "score";
      confidence: number;
      action: Action;
      score: number;
      legend: Record<string, Json>;
      probabilities: Record<string, number>;
    }
  | { type: "noul"; confidence: number; action: Action; noul: number };
type Result = {
  model: "laya-rl-agent";
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: 0 };
  timing?: {
    tokenizeMs?: number;
    onnxMs?: number;
    postprocessMs?: number;
    totalMs?: number;
  };
};
```

这是当前 JEV 类型化决策契约，不是普通聊天 JSON。questions 非空，每 ID 一个相同 type 答案，概率/置信度 [0,1]，score 有限数值，仅真实支持契约时声明。

### 6.10 synthesizeSpeech 与 speak

```ts
type Input = {
  text: string;
  language?: string;
  speed?: number;
  voice?: string;
};
type SynthesizeResult = { audio: AssetRef; mimeType: string };
type SpeakResult = { status: "ended" | "interrupted" };
```

text 非空白，speed 正有限。合成返回真实资产且两个 mimeType 一致；speak 是完成播放，外部 SDK 无本机播放，网络 TTS 通常实现 synthesizeSpeech，不仅生成音频就声称 ended。

## 7. JavaScript 与 ctx SDK

### 7.1 完整文本实现

第 2 节 implementation 改为 `{"kind":"script","entry":"services/text.js"}`，两项 outputModes 改 ["complete"]，使用完整脚本：

```js
async function complete(messages, config, ctx) {
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: messages,
    stream: false,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  return ctx.helpers.openai.chatCompletions.parseResponse(
    await ctx.http.request(request)
  );
}

exports.chat = async function (input, config, ctx) {
  return complete(input.messages, config, ctx);
};

exports.translate = async function (input, config, ctx) {
  var result = await complete(
    ctx.helpers.translation.buildMessages(input),
    config,
    ctx
  );
  return ctx.helpers.translation.parseResult(result.text, input);
};
```

入口用 exports，无 import/require/export default，handler 大小写一致。config/ctx.config 只有非秘密字段，config.apiKey 不可用。

### 7.2 ctx 成员与环境

每次独立 Sval Worker、script 模式，可普通对象/数组/函数/async/await/for await。不要假设浏览器/Node 全局。

| 成员                          | 用法                                  |
| ----------------------------- | ------------------------------------- |
| ctx.requestId                 | 本次 ID，关联诊断，不自行指定调用身份 |
| ctx.config                    | 非秘密配置，与第二参数同              |
| ctx.options.streaming         | 本次布尔值，不是 auto 字符串          |
| ctx.resources                 | 资源 ID → 本次 AssetRef               |
| ctx.assets.read(ref)          | Promise<ArrayBuffer>，当前任务字节    |
| ctx.secrets.ref(key)          | 同步不透明凭据引用                    |
| ctx.secrets.sign(ref,options) | Promise<string>，宿主签名             |
| ctx.http.request(descriptor)  | Promise<{status,headers,body}>        |
| ctx.http.stream(descriptor)   | AsyncIterable，已分帧 SSE/NDJSON      |
| ctx.emit(event)               | Promise<void>，逐个 await             |
| ctx.helpers                   | 第 9 节公开工具，不自动请求网络       |

脚本 ctx 不暴露 AbortSignal、资产写入、持久存储或任意 RPC。将参数视为只读，需要修改时创建副本。不要使用模块变量作为跨调用存储。

禁止 DOM/window/document/chrome/browser/GM、fetch/XHR/WebSocket、其他 Worker、宿主存储、eval/Function、动态 import、无限循环、嵌套解释器。SDK 唯一宿主入口，编写约束不代替安全隔离。

### 7.3 错误和取消

抛 Error 失败，可附非秘密 code：

```js
throw Object.assign(new Error("响应缺少译文"), { code: "INVALID_RESPONSE" });
```

SDK 的网络、资产读取和事件输出受取消控制。取消、超时或撤销授权会中止请求并终止 Worker。异步调用必须 await，不要捕获取消或解析错误后返回空成功。错误消息不能包含密钥、鉴权 Header、带密钥的查询或完整资产内容。

扩展桥接默认全程 60 秒、最多 300 秒，宿主决定期限。约 1 秒无心跳同步计算触发看门狗，异步网络等待不按同步计算处理，避免 CPU 密集工作。

### 7.4 脚本合成

第 5.3 节合成服务改 script，entry services/speech.js：

```js
exports.synthesizeSpeech = async function (input, config, ctx) {
  var request = ctx.helpers.openai.audio.buildSpeechRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    text: input.text,
    voice: input.voice ?? config.voice,
    speed: input.speed,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  var response = await ctx.http.request(request);
  return { audio: response.body, mimeType: response.body.mimeType };
};
```

language 是语言，voice 是音色 ID，不能混用。厂家需要显式语言参数时，按其协议补充。

### 7.5 接入不兼容 Chat Completions 的翻译 API

如果服务有自己的协议，直接构造请求并转换结果即可，不必使用 OpenAI helper。假设目标协议为：向基础地址下的 `/translate` POST `{text,target,source?}`，使用 Bearer 鉴权，成功返回 `{"translation":"译文"}`。这是教学协议，实际字段和路径需按供应商文档调整。

沿用第 2 节公共 baseUrl/apiKey，将 services 数组改为仅包含下列服务对象，即 `"services": [{...}]`；这个接口不需要 model 字段，也不使用模型生成提示词：

```json
{
  "id": "translation",
  "name": "自定义协议翻译",
  "implementation": { "kind": "script", "entry": "services/translation.js" },
  "capabilities": {
    "translate": {
      "handler": "translate",
      "batch": { "supported": false },
      "outputModes": ["complete"]
    }
  }
}
```

新增 services/translation.js：

```js
exports.translate = async function (input, config, ctx) {
  var item = input.items[0];
  var body = { text: item.text, target: input.targetLanguage };
  if (input.sourceLanguage && input.sourceLanguage !== "auto") {
    body.source = input.sourceLanguage;
  }
  var response = await ctx.http.request({
    url: config.baseUrl.replace(/\/+$/, "") + "/translate",
    method: "POST",
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    bodyType: "json",
    body: body,
    responseType: "text",
  });
  var data = JSON.parse(response.body);
  if (typeof data.translation !== "string" || !data.translation.trim()) {
    throw new Error("响应缺少非空 translation 字段");
  }
  return { items: [{ id: item.id, text: data.translation }] };
};
```

宿主因 batch.supported=false 拒绝多项调用，因此本例仅处理一项并保留原 ID。不要保持 supported=true 却仍只取第一项。源/目标语言若要求不同代码，先做协议映射；术语、上下文或 HTML 若受服务支持，应加入实际请求，否则不要宣称已实现这些供应商功能。

## 8. HTTP、凭据和资产

请求描述符供 script/v1，v2 用第 4 节协议结构。

### 8.1 请求参考

```ts
type Request = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  auth?: { type: "bearer"; secret: SecretRef };
  secretBindings?: Array<{
    target: "header" | "query" | "json";
    name: string;
    secret: SecretRef;
    prefix?: string;
  }>;
  bodyType?: "json" | "multipart" | "asset";
  body?: unknown;
  responseType?: "text" | "asset";
  streamFormat?: "sse" | "ndjson";
};
```

SecretRef 只能由 ctx.secrets.ref 获取，不要构造、读取其内部属性或跨任务复用。

- method 默认 GET，大写且限表中方法。
- json body 原生 JSON，宿主序列化并默认补 Content-Type，不提前 stringify。
- multipart body 字段对象，AssetRef 转文件，其他值字符串。不传 FormData/Blob、不手写 boundary，由宿主处理 Content-Type。
- asset body 为已有 AssetRef，发送字节，按协议设置 Content-Type。
- 文本省略 bodyType，body 字符串并设 Content-Type。
- responseType=text（默认）body UTF-8 字符串，JSON 自行/helper 解析。
- asset body 新 AssetRef，MIME 取响应 Content-Type，缺失 application/octet-stream。

成功响应的 headers 是普通对象。非 2xx 抛出 HTTP_ERROR，不暴露错误正文、Header 或完整 URL；HTTP 200 内的业务错误由插件解析。网络调度不自动重试，流式消费完正文后才释放并发名额。

### 8.2 注入与签名

非 Bearer 放 request.secretBindings 数组：

```js
var binding = {
  target: "header",
  name: "X-API-Key",
  secret: ctx.secrets.ref("apiKey"),
  prefix: "",
};
```

name 仅允许字母、数字、下划线、点或连字符，并禁止原型属性名称。json 仅写入 JSON body 顶层字段，不支持嵌套路径；query 写入 URL 查询。禁止注入 Cookie。Bearer 会替换已有 Authorization，所有注入发生在 origin 校验之后。SDK 不提供明文读取，不要将密钥另存到非秘密字段。

签名：

```js
var signature = await ctx.secrets.sign(ctx.secrets.ref("apiKey"), {
  data: "待签字符串",
  algorithm: "hmac-sha256",
  encoding: "hex",
});
```

当前仅支持 HMAC-SHA256，encoding 为 hex（默认）或 base64。待签文本格式、字段排序、时间戳和签名 Header 由厂家协议决定，不能用普通 SHA-256 digest 代替 HMAC。

### 8.3 图片和音频

输入 AssetRef 不是本机路径，上传直接 multipart/asset 无需 read。完整图片 script（第 4.3 服务改 script/entry services/vision.js）：

```js
exports.parseImage = async function (input, config, ctx) {
  var bytes = await ctx.assets.read(input.image);
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              input.prompt ??
              "Extract visible text faithfully. Output only the text.",
          },
          {
            type: "image_url",
            image_url: {
              url:
                "data:" +
                input.image.mimeType +
                ";base64," +
                ctx.helpers.encoding.bytesToBase64(bytes),
            },
          },
        ],
      },
    ],
    stream: false,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  var result = ctx.helpers.openai.chatCompletions.parseResponse(
    await ctx.http.request(request)
  );
  return { text: result.text, format: "text" };
};
```

全文识别不声明 coordinates。OCR 服务按厂家协议实现 recognizeText，并转换真实文字框，不能只替换能力标签就宣称支持坐标。SDK 没有 assets.put；音频通过 responseType=asset 获得并返回引用，不返回 Blob、ArrayBuffer、文件路径或完整 base64。资产 ID 仅限当前任务。

### 8.4 执行资源与预算

Manifest 小型字典：

```json
{
  "resources": [
    {
      "id": "dictionary",
      "path": "resources/dictionary.json",
      "mimeType": "application/json"
    }
  ]
}
```

资源实际存在，id 唯一，匹配 `^[A-Za-z_$][\w$]*$`，复制实例、不加载 JS。读取：

```js
var bytes = await ctx.assets.read(ctx.resources.dictionary);
var dictionary = JSON.parse(ctx.helpers.encoding.decodeUtf8(bytes));
```

| 对象                       | 当前上限                                  |
| -------------------------- | ----------------------------------------- |
| ZIP 压缩                   | 5 MiB                                     |
| ZIP 解压/文件夹            | 10 MiB，100 ZIP 条目/100 文件夹文件       |
| 执行资源                   | 8 份，每份 256 KiB，总 1 MiB              |
| 图标                       | 256 KiB                                   |
| 任务资产，含输入/资源/响应 | 8 份，总 8 MiB                            |
| 请求/响应/一次流正文       | 各 8 MiB                                  |
| 输入/结果/SDK 消息 JSON    | 各 8 MiB                                  |
| 累计事件 JSON              | 8 MiB                                     |
| 待签字符串 UTF-8           | 1 MiB                                     |
| script 同时待完成操作      | 64，其中 request 与 asset.read 合计最多 4 |
| script 同时 HTTP 流        | 4                                         |

base64 和 JSON 编码会增加体积。不要将大型模型、音视频或数据库放入执行资源、配置或文本结果。

## 9. 公共 helpers

所有工具位于 ctx.helpers，除注明异步外均为同步工具。它们只组装或解析数据，不自动推导能力或请求网络。不要将宿主内部未列出的函数当作公共 SDK。

### 9.1 Chat Completions

| 调用                                                                                      | 返回/约定                                                 |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| openai.chatCompletions.buildBody({model,messages,stream?,...parameters})                  | 请求 JSON，stream 默认 false                              |
| openai.chatCompletions.buildRequest({baseUrl,model,messages,stream?,auth?,...parameters}) | POST 描述符，追加 /chat/completions                       |
| openai.chatCompletions.parseResponse(response)                                            | `{text,reasoning,usage?,finishReason?}`，reasoning 默认空 |
| openai.chatCompletions.createStreamParser()                                               | `{push(frame),finish()}`，push 标准事件数组               |

baseUrl 应包含协议前缀，不能带账号、查询或 hash。额外参数是否受所选模型支持由作者验证。解析器处理 error、拒答、缺失正文，以及 length、content_filter、工具调用等不完整或不支持的结束原因。支持兼容扩展 reasoning_content，当前没有 Responses API helper，不能混用两套事件。

### 9.2 翻译编码

| 调用                                            | 返回/约定                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| translation.buildMessages(input)                | system/user 消息，展开第 11 节变量                                |
| translation.parseResult(text,input)             | 标准 `{items}`，支持 text/JSON/LINE/XML，校验全部 ID及非空译文    |
| translation.createStreamParser(input)           | **异步**返回 push/finish，push 同步 item.delta/item.complete 数组 |
| translation.encodeSegments(items,format?)       | json（默认）/xml/line 编码                                        |
| translation.parseSegments(text,{items,format?}) | ID 校验后的 `{items}`                                             |
| translation.createXmlStreamParser({items})      | 同步 push/finish，完整 t 转 item.complete                         |

JSON `[{"id":"a","text":"你好"}]`；XML `<root><t id="a">你好</t></root>`；line `a | 你好`。XML 仅此格式，无 DTD/外部实体。line ID 无竖线/换行，正文换行转 <br>。

解析器检查缺失、重复、未知 ID 和空白译文，按输入顺序返回。流式解析器接收模型输出的翻译 JSON 文本增量，不是 SSE 对象或 Chat Completions 帧。

### 9.3 音频

| 调用                                                                          | 约定                                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| openai.audio.buildTranscriptionRequest({baseUrl,model,audio,language?,auth?}) | /audio/transcriptions multipart，response_format=json，auto 省略 |
| openai.audio.parseTranscription(response)                                     | `{text,segments?}`，校验时间/文本                                |
| openai.audio.buildSpeechRequest({baseUrl,model,text,voice,speed?,auth?})      | /audio/speech JSON，mp3，responseType=asset                      |

默认转写请求不保证返回 segments；需要时间戳时按厂家协议修改请求并验证，再声明 timestamps。helper 不播放音频。

### 9.4 编码、语言与分帧

| 调用/属性                                         | 约定                                                    |
| ------------------------------------------------- | ------------------------------------------------------- |
| encoding.utf8ToBase64(text)/base64ToUtf8(text)    | Unicode 编解码，非法 UTF-8 抛错                         |
| encoding.bytesToBase64(buffer)/decodeUtf8(buffer) | ArrayBuffer 转 base64/严格 UTF-8                        |
| crypto.digest(text,encoding?)                     | 异步 SHA-256，hex 默认/base64                           |
| languages.codes                                   | 只读内置映射                                            |
| languages.toIso6391(language)                     | 已知映射，未知报错，auto 先省略                         |
| speech.normalizeLocale(language)                  | BCP-47，不能用音色 ID                                   |
| speech.voices.openai["tts-1"]                     | `{label,value}` 数组 alloy/echo/fable/onyx/nova/shimmer |
| stream.createSSEParser()                          | push(text) → `{event,data}` 数组，finish 校验尾帧       |
| stream.createNDJSONParser()                       | push/finish → JSON 数组，finish 无换行尾记录            |

音色表是 SDK 静态数据，不表示厂家的全部当前音色或账号可用性。插件可定义自己的 options，系统声音则由宿主枚举。ctx.http.stream 已完成解码和分帧，一般无需再次调用底层解析器。区分“网络块 → 帧 → 协议增量 → 标准事件”几个层次。

## 10. 流式输出与批量翻译

### 10.1 选择与事件

规则 v2 自动处理 chat/translate 流式，script 则需自行实现。能力和当前模型支持时默认开启，实例 useStream=false 明确关闭；ctx.options.streaming 是本次实际选择。只等待最终结果的场景也可能采用流式传输。

| 事件            | 结构                                                            |
| --------------- | --------------------------------------------------------------- |
| text.delta      | `{type:"text.delta",text:"新增片段"}`                           |
| reasoning.delta | `{type:"reasoning.delta",text:"新增片段"}`                      |
| item.delta      | `{type:"item.delta",id:"a",text:"新增片段"}`，仅 translate      |
| item.complete   | `{type:"item.complete",id:"a",text:"完整译文"}`，仅 translate   |
| progress        | `{type:"progress",progress:0.5,message:"处理中"}`，后两项可省略 |

item ID 必须来自本次输入，progress 在 [0,1]。事件不能替代最终结果，应逐个 await ctx.emit，不用未等待的调用或无限 Promise.all 发送事件。没有订阅者时任务仍执行并保留最终结果，不保存完整事件历史。

### 10.2 完整流式脚本

整体替换第 7.1 的 services/text.js，两项 outputModes 改 ["complete","stream"]：

```js
async function complete(messages, config, ctx, translationInput) {
  var streaming = Boolean(ctx.options.streaming);
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: messages,
    stream: streaming,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  if (!streaming) {
    return ctx.helpers.openai.chatCompletions.parseResponse(
      await ctx.http.request(request)
    );
  }
  var chatParser = ctx.helpers.openai.chatCompletions.createStreamParser();
  var translationParser = translationInput
    ? await ctx.helpers.translation.createStreamParser(translationInput)
    : null;
  for await (var frame of ctx.http.stream(request)) {
    if (frame.type !== "sse") continue;
    for (var event of chatParser.push(frame.data)) {
      if (translationParser) {
        if (event.type === "text.delta") {
          for (var item of translationParser.push(event.text))
            await ctx.emit(item);
        }
      } else await ctx.emit(event);
    }
  }
  var result = chatParser.finish();
  return translationParser ? translationParser.finish() : result;
}

exports.chat = async function (input, config, ctx) {
  return complete(input.messages, config, ctx);
};

exports.translate = async function (input, config, ctx) {
  var result = await complete(
    ctx.helpers.translation.buildMessages(input),
    config,
    ctx,
    input
  );
  if (ctx.options.streaming) return result;
  return ctx.helpers.translation.parseResult(result.text, input);
};
```

chatParser 接收单帧的 data，finish 要求正常结束原因和 [DONE]。翻译将 text.delta 再交给 translationParser，完整条目产生 item.complete，finish 检查全部 ID。不能把批量 JSON token 直接显示为译文，中途断流不能缓存为成功。四种格式的提示词、输入编码及解析必须使用同一 outputProtocol。text 发出单项 item.delta，LINE 在行完成时发出 item.complete，XML 在 t 节点闭合时发出 item.complete；最终成功前均需校验终止和完整结果。

### 10.3 SSE / NDJSON

ctx.http.stream 首先返回 `{type:"headers",status,headers}`，默认随后返回 `{type:"sse",event,data}`；streamFormat=ndjson 时返回已解析的 `{type:"json",value}`。当前没有任意 bytes 流接口。NDJSON 的厂家字段由 script 转换、累计完整结果并检查业务终止，不交给 SSE Chat parser，也不假定 EOF 就表示成功。规则 v2 固定使用兼容 Chat Completions SSE。

## 11. 提示词与场景参数

### 11.1 默认模板

文本服务声明不同模式的默认提示词：单句输出 text，聚合默认输出 JSON。LINE/XML 聚合使用第 11.2 节对应模板或用户绑定的聚合提示词。

```json
{
  "defaultPrompts": {
    "batch": {
      "protocol": "json",
      "systemPrompt": "Translate the input items from {{sourceLanguage}} to {{targetLanguage}}. Return only a JSON array of {id,text}, keeping every ID. Glossary: {{glossary}}. Context: {{context}}",
      "userPrompt": "{{segments}}"
    },
    "nobatch": {
      "protocol": "text",
      "systemPrompt": "Translate the source text from {{sourceLanguage}} to {{targetLanguage}}. Output only the translated text, without explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
      "userPrompt": "{{text}}"
    }
  }
}
```

| 槽位       | 能力            | 注入                                                |
| ---------- | --------------- | --------------------------------------------------- |
| nobatch    | translate       | systemPrompt/userPrompt，protocol 为 text           |
| batch      | translate       | 同上，protocol 为 json、line 或 xml；由聚合模式选择 |
| dictionary | dictionary      | systemPrompt→instructions，userPrompt→userPrompt    |
| subtitle   | segmentSubtitle | systemPrompt→instructions                           |
| vlm        | parseImage      | 优先 systemPrompt，否则 userPrompt→prompt           |

每个槽位至少声明一个字符串模板。protocol 仅用于翻译槽位；其他槽位仍只允许 systemPrompt/userPrompt。任务/场景的显式模板及协议优先，包括空模板。旧实例快照未声明 protocol 时保留 JSON 兼容，不重写已有配置；新包升级后才获得新的默认模板。

### 11.2 翻译变量

v2 translate/translation.buildMessages 支持 `{{变量名}}`：

| 变量                                | 内容                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| items                               | 带稳定 ID 的 items JSON                                     |
| segments                            | 按 outputProtocol 编码的 JSON、LINE、XML；text 时为单项原文 |
| text                                | 单项原文，多项 items JSON                                   |
| sourceLanguage / from / fromLang    | 源语言，缺失 auto                                           |
| targetLanguage / to / toLang        | 目标语言                                                    |
| glossary                            | 术语 JSON，缺失 {}                                          |
| context / tone                      | 上下文/语气，缺失空                                         |
| title / description / summary / url | document 字段，缺失空                                       |

未知变量保留原样，未传模板时采用当前模式/协议对应的 SDK 默认模板。显式绑定模板不被改写。buildMessages、parseResult(text,input)、createStreamParser(input) 使用相同的模式和协议；宿主为每次调用绑定 helpers，因此旧脚本只传 {items} 时也继承本次协议。自行实现解析的脚本需自行处理新字段。其他能力没有通用模板展开器，由 script 自行解释。模型、鉴权和音色属于实例设置，语言、术语和上下文属于本次输入，不应硬编码覆盖。

四种可复制默认模板如下。聚合模板在提示词管理中选择同名协议；单句模板只输出纯文本。

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

LINE 使用 ID | Text，内部换行编码为 <br>；XML 使用 root/t 和转义的属性、正文。JSON 使用字符串 ID 的 {id,text} 数组。SDK 按原输入 ID 重排，禁止根据返回顺序猜测匹配；text 不接受多项。

### 11.3 预览和自定义

插件服务表格可以只读预览公开默认模板，不执行脚本或展开变量。未公开时显示“插件未公开默认提示词”。预览是当前模板的声明，不表示旧实例实际使用的内容。

用户可复制模板到提示词管理创建实体，再回实例选择。“插件内部默认”使用实例快照，不会被模板更新覆盖。新 SDK 不提供 reqHook/resHook，当前服务配置也没有源码编辑框。修改协议应编辑源文件、提高版本、导入并升级实例，旧 Hook 的兼容逻辑不属于插件 SDK。

## 12. 安装、授权、更新和发布

### 12.1 来源

| 来源        | 准备                           | 更新                      |
| ----------- | ------------------------------ | ------------------------- |
| 文件夹      | 选中根部有 manifest.json       | 选择更新文件夹或 ZIP      |
| 本地 ZIP    | ZIP 根部有 manifest.json       | 选择更新 ZIP 或文件夹     |
| HTTPS ZIP   | 直连、无需鉴权/重定向          | 记录地址检查              |
| 公开 GitHub | 仓库根部 Manifest 和可执行文件 | 查默认分支、确定 SHA 归档 |

GitHub 使用项目根地址，例如 https://github.com/owner/repo，支持末尾 / 或 .git，不支持 tree/blob、子目录、私有仓库或令牌。安装器不运行 npm 或构建，仅提供 TypeScript 源码不足以执行。归档只去掉一层包装目录，不搜索子项目，应避免大型开发依赖进入归档。

文件夹导入仅保存当次快照，不保存本机路径或目录句柄，也不监听文件变化。HTTPS 下载默认有 60 秒全程期限，读取和校验期间可取消，取消后不保存模板或索引。

### 12.2 授权、同步和卸载

授权按插件 ID 保存启用状态和固定 origin，同一插件所有版本与实例共享授权，每个实例仍受自身范围限制。授权不要求先填写 API Key，未授权时测试禁用，可通过“前往授权”定位插件。撤销会中止本机该插件在各页面的所有活动任务，后续调用需重新授权。普通配置编辑只影响新任务，活动任务使用捕获的快照。

模板和图标保存在本机，索引和实例按宿主设置机制同步，本机授权不随同步授予。新设备上的快照仍需本机授权。缺失模板影响添加新实例和预览，不影响已有快照执行。GitHub 恢复使用记录的 SHA，不等于更新到最新版本；本地来源缺失时重新选择文件或目录。

卸载移除模板与同步索引，保留实例、配置和授权。需要停止插件执行时，应单独撤销授权。

### 12.3 升级

1. 稳定 plugin/service ID，改内容提高三段 version。
2. 同版本同指纹无需更新，同版本改内容/降级拒绝；指纹为规范化执行内容，无压缩/GitHub 外层影响。
3. 无新增固定 origin 确认“更新插件”，新增“更新并授权”，只追加本包固定地址、保留旧授权。
4. 更新模板不动旧实例，旧测试仍旧实现。
5. 旧实例升级入口创建新版，复制兼容字段/仍支持启用能力，新能力不自动启用。
6. 保存授权测试新版，预览选择引用替换，保留旧实例。

字段类型或秘密属性变化时，不保证旧值兼容。删除或修改 service ID 会失去常规升级对应关系；SDK 没有任意配置迁移脚本入口。

### 12.4 发布

发布包只需要 Manifest、引用入口、资源和图标，不包含凭据、个人配置、node_modules、构建缓存或本机路径。README 说明协议、能力、配置和版本变化。先完成本地实际调用，再制作 ZIP；GitHub 分发需要验证项目根 URL 的安装与更新。不同协议的服务应分别说明所需基础地址。

## 13. 调试与故障排查

### 13.1 无需宿主源码的自检

插件根新建 check.cjs，执行 node check.cjs。完整脚本检查 JSON/入口/handler，不执行任务，不证明宿主规则校验或网络成功。Node VM 与 Sval 不同，仅用于自己的可信脚本；check.cjs 不放发布 ZIP。

```js
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
assert.equal(manifest.manifestVersion, 1);
assert.equal(manifest.apiVersion, "1");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.ok(manifest.services.length > 0);
for (const service of manifest.services) {
  const file = path.resolve(service.implementation.entry);
  assert.ok(file.startsWith(process.cwd() + path.sep));
  const source = fs.readFileSync(file, "utf8");
  let handlers;
  if (service.implementation.kind === "script") {
    const sandbox = { exports: {} };
    vm.runInNewContext(source, sandbox, { timeout: 1000 });
    handlers = sandbox.exports;
  } else {
    const rules = JSON.parse(source);
    assert.ok([1, 2].includes(rules.rulesVersion));
    handlers = rules.handlers;
  }
  for (const [capability, descriptor] of Object.entries(service.capabilities)) {
    assert.ok(Object.hasOwn(handlers, descriptor.handler), capability);
    if (service.implementation.kind === "script") {
      assert.equal(typeof handlers[descriptor.handler], "function");
    } else if (handlers[descriptor.handler].protocol) {
      assert.equal(handlers[descriptor.handler].task, capability);
    }
  }
}
console.log("文件与 handler 对应检查通过");
```

### 13.2 扩展验证

1. 当前版本导入创建/升级，核对来源版本。
2. 保存配置授权，分别测试每声明能力。
3. complete/stream 均声明时分别关/开测试最终结果。
4. 文件选真实图片/音频，不手填 ID，字幕/决策 JSON；普通翻译单项测试不代替批量。
5. 真实场景测 ID 乱序、术语上下文、坐标、分组、音频播放等支持项。
6. 正常、凭据无效、业务错误、取消、超时、缺字段/ID、重复 ID、流缺终止。
7. 两配置实例隔离，模板更新旧实例不变新版生效。

规则 v2 由宿主处理协议，但供应商兼容性与模型参数仍需作者实测。mock 通过不证明安装器、Broker、安全隔离或真实厂家调用已经通过。

### 13.3 故障表

| 现象/码                                  | 排查                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| INVALID_PACKAGE                          | 根目录/包装层/路径/数量体积                                          |
| INVALID_MANIFEST/INVALID_RULE            | 版本类型、v1/v2 混用、保留参数、handler/task、boolean 条件和秘密字段 |
| SETTING_CONFLICT/INVALID_CONFIG          | 类型秘密冲突、必填、数值、select、启用专属字段                       |
| HANDLER_MISSING/Script handler not found | exports/handlers 大小写                                              |
| SCRIPT_ERROR                             | 全局/ES module/依赖/Sval 语法，Node 通过不代表 Sval                  |
| SECRET_UNAVAILABLE                       | 声明、非空保存、ref 键                                               |
| NETWORK_DENIED                           | origin 范围、本机授权、远程 HTTP/重定向                              |
| HTTP_ERROR                               | 地址模型账号参数，无厂家错误正文                                     |
| INVALID_RESPONSE/INCOMPLETE_RESPONSE     | 标准结构/JSON/拒答/缺重复 ID/截断                                    |
| CAPABILITY_DISABLED/SERVICE_UNAVAILABLE  | 启用/模型限制/停用/配置完整                                          |
| BATCH_UNSUPPORTED/INPUT_LIMIT_EXCEEDED   | batch 与 maxItems                                                    |
| MODALITY_UNSUPPORTED/TASK_UNSUPPORTED    | 模态/图片模式与模型                                                  |
| STREAM_UNSUPPORTED/STREAM_ENDED          | 流支持、协议混用、终止后数据                                         |
| INVALID_ASSET/ASSET_UNAVAILABLE          | MIME/格式/跨任务                                                     |
| RESOURCE_BUDGET_EXCEEDED                 | 体积/事件/待完成操作/流数                                            |
| SCRIPT_TIMEOUT/REQUEST_TIMEOUT           | 同步计算/网络停滞/全程期限                                           |
| 更新后行为不变                           | 是否旧快照，是否新版实例                                             |

### 13.4 可选仓库检查

已有源码与依赖可运行下列检查，但不是开发前置：

```powershell
$env:CI = "true"
pnpm test --watchAll=false --runInBand src/providers/declarative.test.js src/providers/example.test.js src/providers/deepseekExample.test.js
```

生成的示例 ZIP 不提交，自动测试不能替代真实浏览器和厂家端到端验证。额外素材：[多服务示例](examples/openai-compatible-bundle/README.md)、[DeepSeek 声明式示例](examples/deepseek/README.md)。

## 14. 发布前检查清单

- [ ] 空目录按本文安装可用，根部/入口/资源正确。
- [ ] 稳定 ID、提高版本，无凭据/个人配置/本机路径。
- [ ] 执行器/规则版本正确，能力对应真实 handler。
- [ ] 仅声明已验证的流/批量/模态/坐标/模式/时间戳。
- [ ] 输入结果事件标准，翻译 ID 完整、字幕分组顺序正确。
- [ ] complete/stream 都验证，缺终止/缺项/重复项/错误失败。
- [ ] 取消、超时和解析失败不会变成空成功，异步 SDK 调用正确 await。
- [ ] origin 范围准确，秘密只经引用、注入或签名使用，不输出到日志和错误。
- [ ] 实例/资产隔离，体积操作数预算内。
- [ ] 模板协议一致，处理语言/术语/上下文/显式提示词。
- [ ] 实际扩展安装授权配置场景验证，记录厂家/模型范围。
- [ ] 更新升级引用替换验证，旧实例仍原快照。

### 界面多语言文案

插件和服务可通过 `nameI18n` 声明名称翻译，设置字段及其选项可通过 `labelI18n` 声明标签翻译。原有的 `name`、`label` 仍作为基础文案，不改变模型 ID、选项值或用户保存的服务名称。例如：

```json
{
  "key": "baseUrl",
  "label": "API 基础地址",
  "labelI18n": {
    "zh": "API 基础地址",
    "en": "API base URL",
    "zh_TW": "API 基礎位址"
  },
  "type": "text"
}
```

语言代码为 `en`、`zh`、`zh_TW`、`ja`、`ko`、`tr`、`vi`、`ru`，翻译值须为字符串。界面优先使用当前语言，其次使用 `en`，最后使用基础文案。名称翻译随插件快照和同步索引保留；已安装旧版示例包的常见中文标签也有显示兼容，无需重写配置。用户修改过的服务名称按用户原值显示。
