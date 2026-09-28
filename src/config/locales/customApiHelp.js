/**
 * @file customApiHelp.js
 * @description 自定义接口帮助文档及多语言范例说明
 */

const customApiLangs = `["en", "English - English"],
["zh-CN", "Simplified Chinese - 简体中文"],
["zh-TW", "Traditional Chinese - 繁體中文"],
["ar", "Arabic - العربية"],
["bg", "Bulgarian - Български"],
["ca", "Catalan - Català"],
["hr", "Croatian - Hrvatski"],
["cs", "Czech - Čeština"],
["da", "Danish - Dansk"],
["nl", "Dutch - Nederlands"],
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
`;

const customApiHelpZH = `// 请求数据默认格式
{
  "url": "{{url}}",
  "method": "POST",
  "headers": {
    "Content-type": "application/json",
    "Authorization": "Bearer {{key}}"
  },
  "body": {
    "text": "{{text}}", // 待翻译文字
    "from": "{{from}}", // 文字的语言（可能为空）
    "to": "{{to}}",     // 目标语言
  },
}


// 返回数据默认格式
{
  text: "", // 翻译后的文字
  from: "", // 识别的源语言
  to: "",   // 目标语言（可选）
}


// Hook 范例
// URL
https://translate.googleapis.com/translate_a/single?client=gtx&dj=1&dt=t&ie=UTF-8&q={{text}}&sl=en&tl=zh-CN

// Request Hook
(text, from, to, url, key) => [url, {
  headers: {
      "Content-type": "application/json",
  },
  method: "GET",
  body: null,
}]

// Response Hook
// 其中返回数组第一个值表示译文字符串，第二个值为布尔值，表示原文语言与目标语言是否相同
(res, text, from, to) => [res.sentences.map((item) => item.trans).join(" "), to === res.src]


// 支持的语言代码如下
${customApiLangs}
`;

const customApiHelpEN = `// Default request
{
  "url": "{{url}}",
  "method": "POST",
  "headers": {
    "Content-type": "application/json",
    "Authorization": "Bearer {{key}}"
  },
  "body": {
    "text": "{{text}}", // Text to be translated
    "from": "{{from}}", // The language of the text (may be empty)
    "to": "{{to}}",     // Target language
  },
}


// Default response
{
  text: "", // translated text
  from: "", // Recognized source language
  to: "",   // Target language (optional)
}


/// Hook Example
// URL
https://translate.googleapis.com/translate_a/single?client=gtx&dj=1&dt=t&ie=UTF-8&q={{text}}&sl=en&tl=zh-CN

// Request Hook
(text, from, to, url, key) => [url, {
  headers: {
      "Content-type": "application/json",
  },
  method: "GET",
  body: null,
}]

// Response Hook
// In the returned array, the first value is the translated string, while the second value is a boolean
// that indicates whether the source language is the same as the target language.
(res, text, from, to) => [res.sentences.map((item) => item.trans).join(" "), to === res.src]


// The supported language codes are as follows
${customApiLangs}
`;

const requestHookHelperZH = `1、第一个参数包含如下字段：'texts', 'from', 'to', 'url', 'key', 'model', 'systemPrompt', ...
2、返回值必须是包含以下字段的对象： 'url', 'body', 'headers', 'method'
3、如返回空值，则hook函数不会产生任何效果。

// 示例
async (args, { url, body, headers, userMsg, method } = {}) => {
  return { url, body, headers, userMsg, method };
}`;

const requestHookHelperEN = `1. The first parameter contains the following fields: 'texts', 'from', 'to', 'url', 'key', 'model', 'systemPrompt', ...
2. The return value must be an object containing the following fields: 'url', 'body', 'headers', 'method'
3. If a null value is returned, the hook function will have no effect.

// Example
async (args, { url, body, headers, userMsg, method } = {}) => {
  return { url, body, headers, userMsg, method };
}`;

const responsetHookHelperZH = `1、第一个参数包含如下字段：'res', ...
2、返回值必须是包含以下字段的对象： 'translations'
  （'translations' 应为一个二维数组：[[译文, 原文语言]]）
3、如返回空值，则hook函数不会产生任何效果。

// 示例
async ({ res, ...args }) => {
  const translations = [["你好", "en"]];
  const modelMsg = {}; // 用于AI上下文
  return { translations, modelMsg };
}`;

const responsetHookHelperEN = `1. The first parameter contains the following fields: 'res', ...
2. The return value must be an object containing the following fields: 'translations'
  ('translations' should be a two-dimensional array: [[translation, source language]]).
3. If a null value is returned, the hook function will have no effect.

// Example
async ({ res, ...args }) => {
  const translations = [["你好", "en"]];
  const modelMsg = {}; // For AI context
  return { translations, modelMsg };
}`;

const customApiHelpTW = `// 請求資料預設格式
{
  "url": "{{url}}",
  "method": "POST",
  "headers": {
    "Content-type": "application/json",
    "Authorization": "Bearer {{key}}"
  },
  "body": {
    "text": "{{text}}", // 待翻譯文字
    "from": "{{from}}", // 文字的語言（可能為空）
    "to": "{{to}}",     // 目標語言
  },
}


// 回傳資料預設格式
{
  text: "", // 翻譯後的文字
  from: "", // 辨識的來源語言
  to: "",   // 目標語言（選填）
}


// Hook 範例
// URL
https://translate.googleapis.com/translate_a/single?client=gtx&dj=1&dt=t&ie=UTF-8&q={{text}}&sl=en&tl=zh-CN

// Request Hook
(text, from, to, url, key) => [url, {
  headers: {
      "Content-type": "application/json",
  },
  method: "GET",
  body: null,
}]

// Response Hook
// 其中回傳陣列第一個值表示譯文字串，第二個值為布林值，表示原文語言與目標語言是否相同
(res, text, from, to) => [res.sentences.map((item) => item.trans).join(" "), to === res.src]


// 支援的語言代碼如下
${customApiLangs}
`;

const requestHookHelperTW = `1、第一個參數包含如下欄位：'texts', 'from', 'to', 'url', 'key', 'model', 'systemPrompt', ...
2、回傳值必須是包含以下欄位的物件： 'url', 'body', 'headers', 'method'
3、若回傳空值，則 hook 函式不會產生任何效果。

// 範例
async (args, { url, body, headers, userMsg, method } = {}) => {
  return { url, body, headers, userMsg, method };
}`;

const responsetHookHelperTW = `1、第一個參數包含如下欄位：'res', ...
2、回傳值必須是包含以下欄位的物件： 'translations'
  （'translations' 應為一個二維陣列：[[譯文, 原文語言]]）
3、若回傳空值，則 hook 函式不會產生任何效果。

// 範例
async ({ res, ...args }) => {
  const translations = [["你好", "en"]];
  const modelMsg = {}; // 用於 AI 上下文
  return { translations, modelMsg };
}`;

export const CUSTOM_API_HELP_I18N = {
  custom_api_help: {
    zh: customApiHelpZH,
    en: customApiHelpEN,
    zh_TW: customApiHelpTW,
    ja: customApiHelpEN,
    ko: customApiHelpEN,
    tr: customApiHelpEN,
    vi: customApiHelpEN,
  },
  request_hook_helper: {
    zh: requestHookHelperZH,
    en: requestHookHelperEN,
    zh_TW: requestHookHelperTW,
    ja: requestHookHelperEN,
    ko: requestHookHelperEN,
    tr: requestHookHelperEN,
    vi: requestHookHelperEN,
  },
  response_hook_helper: {
    zh: responsetHookHelperZH,
    en: responsetHookHelperEN,
    zh_TW: responsetHookHelperTW,
    ja: responsetHookHelperEN,
    ko: responsetHookHelperEN,
    tr: responsetHookHelperEN,
    vi: responsetHookHelperEN,
  },
};
