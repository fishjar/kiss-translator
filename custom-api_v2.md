# 自定义接口示例

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
  return { translations: [[res.sentences[0].trans]] };
};
```


## Ollama

> 此示例为支持聚合的模型类（要支持上下文，需进一步改动）

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
    model: "gemma3",
    messages: [
      {
        role: "system",
        content:
          'Act as a translation API. Output a single raw JSON object only. No extra text or fences.\n\nInput:\n{"targetLanguage":"<lang>","title":"<context>","description":"<context>","segments":[{"id":1,"text":"..."}],"glossary":{"sourceTerm":"targetTerm"},"tone":"<formal|casual>"}\n\nOutput:\n{"translations":[{"id":1,"text":"...","sourceLanguage":"<detected>"}]}\n\nRules:\n1.  Use title/description for context only; do not output them.\n2.  Keep id, order, and count of segments.\n3.  Preserve whitespace, HTML entities, and all HTML-like tags (e.g., <i1>, <a1>). Translate inner text only.\n4.  Highest priority: Follow \'glossary\'. Use value for translation; if value is "", keep the key.\n5.  Do not translate: content in <code>, <pre>, text enclosed in backticks, or placeholders like {1}, {{1}}, [1], [[1]].\n6.  Apply the specified tone to the translation.\n7.  Detect sourceLanguage for each segment.\n8.  Return empty or unchanged inputs as is.\n\nExample:\nInput: {"targetLanguage":"zh-CN","segments":[{"id":1,"text":"A <b>React</b> component."}],"glossary":{"component":"组件","React":""}}\nOutput: {"translations":[{"id":1,"text":"一个<b>React</b>组件","sourceLanguage":"en"}]}\n\nFail-safe: On any error, return {"translations":[]}.',
      },
      {
        role: "user",
        content: JSON.stringify({
          targetLanguage: args.to,
          segments: args.texts.map((text, id) => ({ id, text })),
          glossary: {},
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

v2.0.2 Request Hook 可以简化为：

```js
async (args) => {
  const url = args.url;
  const method = "POST";
  const headers = { "Content-type": "application/json" };
  const body = {
    model: "gemma3", // v2.0.2 版后此处可填 args.model
    messages: [
      {
        role: "system",
        content: args.defaultSystemPrompt, // 或者 args.systemPrompt
      },
      {
        role: "user",
        content: JSON.stringify({
          targetLanguage: args.to,
          segments: args.texts.map((text, id) => ({ id, text })),
          glossary: {},
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
async ({ res }) => {
  const extractJson = (raw) => {
    const jsonRegex = /({.*}|\[.*\])/s;
    const match = raw.match(jsonRegex);
    return match ? match[0] : null;
  };

  const parseAIRes = (raw) => {
    if (!raw) return [];

    try {
      const jsonString = extractJson(raw);
      if (!jsonString) return [];

      const data = JSON.parse(jsonString);
      if (Array.isArray(data.translations)) {
        return data.translations.map((item) => [
          item?.text ?? "",
          item?.sourceLanguage ?? "",
        ]);
      }
    } catch (err) {
      console.log("parseAIRes", err);
    }

    return [];
  };

  const translations = parseAIRes(res?.choices?.[0]?.message?.content);

  return { translations };
};
```

v2.0.2 版后内置`parseAIRes`函数，Response Hook 可以简化为：

```js
async ({ res,  parseAIRes, }) => {
  const translations = parseAIRes(res?.choices?.[0]?.message?.content);
  return { translations };
};
```


## 硅基流动

> 此示例为不支持聚合模型类，支持聚合的模型类参考上面 Ollama 的写法

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
    model: "tencent/Hunyuan-MT-7B", // v2.0.2 版后此处可填 args.model
    messages: [
      {
        role: "system",
        content:
          "You are a professional, authentic machine translation engine.",
      },
      {
        role: "user",
        content: `Translate the following source text from to ${args.to}. Output translation directly without any additional text.\n\nSource Text: ${args.texts[0]}\n\nTranslated Text:`,
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
  return { translations: [res?.choices?.[0]?.message?.content || ""] };
};
```
