# 自定义接口示例（本文档已过期，新版不再适用）

V2版的示例请查看这里：[custom-api_v2.md](https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md)

以下示例为网友提供，仅供学习参考。

## 本地运行 Seed-X-PPO-7B 量化模型

> 由网友 emptyghost6 提供，来源：https://linux.do/t/topic/828257

URL

```sh
http://localhost:8000/v1/completions
```

Request Hook

```js
(text, from, to, url, key) => {
  // 模型支持的语言代码到完整名称的映射
  const langFullNameMap = {
    ar: 'Arabic', fr: 'French', ms: 'Malay', ru: 'Russian',
    cs: 'Czech', hr: 'Croatian', nb: 'Norwegian Bokmal', sv: 'Swedish',
    da: 'Danish', hu: 'Hungarian', nl: 'Dutch', th: 'Thai',
    de: 'German', id: 'Indonesian', no: 'Norwegian', tr: 'Turkish',
    en: 'English', it: 'Italian', pl: 'Polish', uk: 'Ukrainian',
    es: 'Spanish', ja: 'Japanese', pt: 'Portuguese', vi: 'Vietnamese',
    fi: 'Finnish', ko: 'Korean', ro: 'Romanian', zh: 'Chinese'
  };

  // 将 Hook 系统的语言代码转换为模型 API 支持的代码
  const getModelLangCode = (lang) => {
    if (lang === 'zh-CN' || lang === 'zh-TW') return 'zh';
    return lang;
  };

  const sourceLangCode = getModelLangCode(from);
  const targetLangCode = getModelLangCode(to);

  const sourceLangName = langFullNameMap[sourceLangCode] || from;
  const targetLangName = langFullNameMap[targetLangCode] || to;

  const prompt = `Translate it to ${targetLangName}:\n${text} <${targetLangCode}>`;

  // 构建请求体对象
  const bodyObject = {
    model: "./ByteDance-Seed/Seed-X-PPO-7B-AWQ-Int4",
    prompt: prompt,
    max_tokens: 2048,
    temperature: 0.0,
  };

  // 返回最终的请求配置
  return [url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // 关键改动：将 JavaScript 对象转换为 JSON 字符串
    body: JSON.stringify(bodyObject),
  }];
}
```

Response Hook

```js
(res, text, from, to) => {
  // 检查返回是否有效
  if (res && res.choices && res.choices.length > 0 && res.choices[0].text) {

    // 提取译文并去除可能存在的前后空格
    const translatedText = res.choices[0].text.trim();

    // 比较原文与译文，相同为 true，否则为 false。
    const areTextsIdentical = text.trim() === translatedText;

    // 返回数组：[翻译后的文本, 是否与原文相同]
    return [translatedText, areTextsIdentical];
  }
  // 如果响应格式不正确或没有结果，则抛出错误
  throw new Error("Invalid API response format or no translation found.");
}
```

## 接入 openrouter

> 由网友 Rick Sanchez 提供

URL

```sh
https://openrouter.ai/api/v1/chat/completions
```

Request Hook

```js
(text, from, to, url, key) => [url, {
  method: "POST",
  headers: {
      "Authorization": `Bearer ${key}`,
      "Content-type": "application/json",
  },
  body: JSON.stringify({
    "model": "deepseek/deepseek-chat-v3-0324:free", //可自定义你的模型
    "messages": [
      {
        "role": "user",
        "content":  //可自定义你的提示词
`You are a professional ${to} native translator. Your task is to produce a fluent, natural, and culturally appropriate translation of the following text from ${from} to ${to}, fully conveying the meaning, tone, and nuance of the original.

## Translation Rules
1. Output only the final polished translation — no explanations, intermediate drafts, or notes.
2. Translate in a way that reads naturally to a native ${to} audience, adapting idioms, cultural references, and tone when necessary.
3. Preserve proper nouns, technical terms, brand names, and URLs exactly as in the original text unless a widely accepted ${to} equivalent exists.
4. Keep any formatting (Markdown, HTML tags, bullet points, numbering) intact and positioned naturally within the translation.
5. Adapt humor, metaphors, and figurative language to culturally relevant forms in ${to} while keeping the original intent.
6. Maintain the same level of formality or informality as the original.

Source Text: ${text}

Translated Text:`
      }
    ]
  })
}]
```

Response Hook

```js
(res, text, from, to) => [
  res.choices?.[0]?.message?.content ?? "", 
  false
]
```

## 接入 gemini-2.5-flash, 关闭思考模式, 去审查

> 由网友 Rick Sanchez 提供

URL

```sh
https://generativelanguage.googleapis.com/v1beta/models
```

Request Hook

```js
(text, from, to, url, key) => [`${url}/gemini-2.5-flash:generateContent?key=${key}`, {
    headers: {
        "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
        "generationConfig": {
            "temperature": 0.8,
            "thinkingConfig": {
                "thinkingBudget": 0, //gemini-2.5-flash设为0关闭思考模式
            },
        },
        "safetySettings": [
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_NONE",
            }
        ],
        "contents": [{
            "parts": [{
                "text": `自定义提示词`
            }]
        }],
    }),
}]
```

Response Hook

```js
(res, text, from, to) => [
  res.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
  false
]
```

## 接入 Qwen-MT

> 由网友 atom 提供

URL

```sh
https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
```

Request Hook

```js
(text, from, to, url, key) => {
  const mapLanguageCode = (lang) => ({
    'zh-CN': 'zh',
    'zh-TW': 'zh_tw',
  })[lang] || lang;

  const targetLang = mapLanguageCode(to);

  return [
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        "model": "qwen-mt-turbo",
        "messages": [
          {
            "role": "user",
            "content": text
          }
        ],
        "translation_options": {
          "source_lang": "auto",
          "target_lang": targetLang
        }
      })
    }
  ];
}
```

Response Hook

```js
(res, text, from, to) => [res.choices?.[0]?.message?.content ?? "", false]
```


## 接入 deepl 接口

> 来源： https://github.com/fishjar/kiss-translator/issues/101#issuecomment-2123786236

Request Hook

```js
(text, from, to, url, key) => [
  url,
  {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      text,
      target_lang: "ZH",
      source_lang: "auto",
    }),
  },
]
```

Response Hook

```js
(res, text, from, to) => [res.data, "ZH" === res.source_lang]
```

## 接入智谱AI大模型

> 来源： https://github.com/fishjar/kiss-translator/issues/205#issuecomment-2642422679

Request Hook

```js
(text, from, to, url, key) => [url, {
  "method": "POST",
  "headers": {
    "Content-type": "application/json",
    "Authorization": key
  },
  "body": JSON.stringify({
  	"model": "glm-4-flash",
  	"messages": [
  		{
  			"role":"system",
  			"content": "You are a professional, authentic machine translation engine. You only return the translated text, without any explanations."
  		},
  		{
  			"role": "user",
  			"content": `Translate the following text into ${to}. If translation is unnecessary (e.g. proper nouns, codes, etc.), return the original text. NO explanations. NO notes:\n\n ${text} `
  		}
  	]
  })
}]
```

## 接入谷歌新接口

> 由网友 Bush2021 提供，来源：https://github.com/fishjar/kiss-translator/issues/225#issuecomment-2810950717

URL

```sh
https://translate-pa.googleapis.com/v1/translateHtml
```

KEY

```sh
AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520
```

Request Hook

```js
(text, from, to, url, key) => [url, {
    method: "POST", 
    headers: { 
        "Content-Type": "application/json+protobuf", 
        "X-Goog-API-Key": key
    }, 
    body: JSON.stringify([[[text], from || "auto", to], "wt_lib"])
}]
```

Response Hook

```js
(res, text, from, to) => [res?.[0]?.join(" ") || "Translation unavailable", to === res?.[1]?.[0]]
```


