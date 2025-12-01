# 自定义接口说明及示例

## 默认接口规范

如果接口的请求数据和返回数据符合以下规范，
则无需填写 `Request Hook` 或 `Response Hook`。


### 非聚合翻译

Request body

```json
{
  "text": "hello",    // 需要翻译的文本列表
  "from":"auto",      // 原文语言
  "to": "zh-CN"       // 目标语言
}
```

Response

```json
{
  "text": "你好",    // 译文
  "src": "en"       // 原文语言
}

// 或者
{
  "text": "你好",    // 译文
  "from": "en"       // 原文语言
}
```


### 聚合翻译

Request body

```json
{
  "texts": ["hello"], // 需要翻译的文本列表
  "from":"auto",      // 原文语言
  "to": "zh-CN"       // 目标语言
}
```

Response

```json
[
  {
    "text": "你好",    // 译文
    "src": "en"       // 原文语言
  }
]
```

v2.0.4版后亦支持以下 Response 格式

```json
{
  "translations": [   // 译文列表
    {
      "text": "你好",  // 译文
      "src": "en"     // 原文语言
    }
  ]
}
```

## Prompt 相关

`Prompt` 可替换占位符：

```js
`{{from}}`        // 原文语言名称
`{{to}}`          // 目标语言名称
`{{fromLang}}`    // 原文语言代码
`{{toLang}}`      // 目标语言代码
`{{text}}`        // 原文
`{{tone}}`        // 风格
`{{title}}`       // 页面标题
`{{description}}` // 页面描述
```

Hook 中 `Prompt` 类型说明：

```js
`systemPrompt`      // 聚合翻译 System Prompt
`nobatchPrompt`     // 非聚合翻译 System Prompt
`nobatchUserPrompt` // 非聚合翻译 User Prompt
`subtitlePrompt`    // 字幕翻译 System Prompt
```

## 谷歌翻译接口

> 此接口不支持聚合

URL

```
https://translate.googleapis.com/translate_a/single?client=gtx&dj=1&dt=t&ie=UTF-8&q={{text}}&sl=en&tl=zh-CN
```

Request Hook

```js
async (args) => {
  const url = args.url.replace("{{text}}", args.texts[0]);
  const method = "GET";
  return { url, method };
};
```

Response Hook

```js
async ({ res }) => {
  return { translations: [[res?.sentences?.[0]?.trans || "", res?.src]] };
};
```


## Ollama

> 此示例为开启聚合翻译的写法

* 注意 ollama 启动参数需要添加环境变量 `OLLAMA_ORIGINS=*`
* 检查环境变量生效命令：`systemctl show ollama | grep OLLAMA_ORIGINS`

URL

```
http://localhost:11434/v1/chat/completions
```

Request Hook

```js
async (args) => {
  const url = args.url;
  const method = "POST";
  const headers = { "Content-type": "application/json" };
  const body = {
    model: "gemma3", // 或 args.model
    messages: [
      {
        role: "system",
        content: args.systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify({
          targetLanguage: args.toLang,
          segments: args.texts.map((text, id) => ({ id, text })),
          title: "", // 可省略
          description: "", // 可省略
          glossary: {}, // 可省略
          tone: "", // 可省略
        }),
      },
    ],
    temperature: 0,
    max_tokens: 20480,
    think: false,
    stream: false,
  };

  return { url, body, headers, method };
};
```

Response Hook

```js
async ({ res, parseAIRes }) => {
  const translations = parseAIRes(res?.choices?.[0]?.message?.content);
  return { translations };
};
```


## 硅基流动

> 此示例为禁用聚合翻译的写法

URL

```
https://api.siliconflow.cn/v1/chat/completions
```

Request Hook

```js
async (args) => {
  const url = args.url;
  const method = "POST";
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${args.key}`,
  };
  const body = {
    model: "tencent/Hunyuan-MT-7B", // 或 args.model
    messages: [
      {
        role: "system",
        content: args.nobatchPrompt,
      },
      {
        role: "user",
        content: args.nobatchUserPrompt,
      },
    ],
    temperature: 0,
    max_tokens: 20480,
  };

  return { url, body, headers, method };
};
```

Response Hook

```js
async ({ res }) => {
  return { translations: [[res?.choices?.[0]?.message?.content || ""]] };
};
```


## 语言代码表及说明

Hook参数里面的语言含义说明：

- `toLang`, `fromLang` 是本插件支持的标准语言代码
- `to`, `from` 是转换后的适用于特定接口的语言代码

如果你的自定义接口与下面的标准语言代码不匹配，需要自行映射转换。

```
["en", "English - English"],
["zh-CN", "Simplified Chinese - 简体中文"],
["zh-TW", "Traditional Chinese - 繁體中文"],
["ar", "Arabic - العربية"],
["bg", "Bulgarian - Български"],
["ca", "Catalan - Català"],
["hr", "Croatian - Hrvatski"],
["cs", "Czech - Čeština"],
["da", "Danish - Dansk"],
["nl", "Dutch - Nederlands"],
["fa", "Persian - فارسی"],
["fi", "Finnish - Suomi"],
["fr", "French - Français"],
["de", "German - Deutsch"],
["el", "Greek - Ελληνικά"],
["hi", "Hindi - हिन्दी"],
["hu", "Hungarian - Magyar"],
["id", "Indonesian - Indonesia"],
["it", "Italian - Italiano"],
["ja", "Japanese - 日本語"],
["ko", "Korean - 한국어"],
["ms", "Malay - Melayu"],
["mt", "Maltese - Malti"],
["nb", "Norwegian - Norsk Bokmål"],
["pl", "Polish - Polski"],
["pt", "Portuguese - Português"],
["ro", "Romanian - Română"],
["ru", "Russian - Русский"],
["sk", "Slovak - Slovenčina"],
["sl", "Slovenian - Slovenščina"],
["es", "Spanish - Español"],
["sv", "Swedish - Svenska"],
["ta", "Tamil - தமிழ்"],
["te", "Telugu - తెలుగు"],
["th", "Thai - ไทย"],
["tr", "Turkish - Türkçe"],
["uk", "Ukrainian - Українська"],
["vi", "Vietnamese - Tiếng Việt"],
```
