export const UI_LANGS = [
  ["en", "English"],
  ["zh", "简体中文"],
  ["zh_TW", "繁體中文"],
];

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

export const I18N = {
  app_name: {
    zh: `简约翻译`,
    en: `KISS Translator`,
    zh_TW: `簡約翻譯`,
  },
  translate: {
    zh: `翻译`,
    en: `Translate`,
    zh_TW: `翻譯`,
  },
  custom_api_help: {
    zh: customApiHelpZH,
    en: customApiHelpEN,
    zh_TW: customApiHelpZH,
  },
  translate_alt: {
    zh: `翻译`,
    en: `Translate`,
    zh_TW: `翻譯`,
  },
  basic_setting: {
    zh: `基本设置`,
    en: `Basic Setting`,
    zh_TW: `基本設定`,
  },
  rules_setting: {
    zh: `规则设置`,
    en: `Rules Setting`,
    zh_TW: `規則設定`,
  },
  apis_setting: {
    zh: `接口设置`,
    en: `Apis Setting`,
    zh_TW: `API設定`,
  },
  sync_setting: {
    zh: `同步设置`,
    en: `Sync Setting`,
    zh_TW: `同步設定`,
  },
  patch_setting: {
    zh: `补丁设置`,
    en: `Patch Setting`,
    zh_TW: `修補設定`,
  },
  patch_setting_help: {
    zh: `针对一些特殊网站的修正脚本，以便翻译软件得到更好的展示效果。`,
    en: `Corrected scripts for some special websites so that the translation software can get better display results.`,
    zh_TW: `針對某些特殊網站的修正腳本，讓翻譯軟體有更好的顯示效果。`,
  },
  inject_webfix: {
    zh: `注入修复补丁`,
    en: `Inject Webfix`,
    zh_TW: `注入修正補丁`,
  },
  about: {
    zh: `关于`,
    en: `About`,
    zh_TW: `關於`,
  },
  about_md: {
    zh: `README.md`,
    en: `README.en.md`,
    zh_TW: `README.md`,
  },
  about_md_local: {
    zh: `请 [点击这里](${process.env.REACT_APP_HOMEPAGE}) 查看详情。`,
    en: `Please [click here](${process.env.REACT_APP_HOMEPAGE}) for details.`,
    zh_TW: `請【點這裡】查看詳細內容。`,
  },
  ui_lang: {
    zh: `界面语言`,
    en: `Interface Language`,
    zh_TW: `介面語言`,
  },
  fetch_limit: {
    zh: `最大并发请求数量 (1-100)`,
    en: `Maximum Number Of Concurrent Requests (1-100)`,
    zh_TW: `最大同時請求數量 (1-100)`,
  },
  if_think: {
    zh: `启用或禁用模型的深度思考能力`,
    en: `Enable or disable the model’s thinking behavior `,
    zh_TW: `啟用或停用模型的深度思考能力`,
  },
  think: {
    zh: `启用深度思考`,
    en: `enable thinking`,
    zh_TW: `啟用深度思考`,
  },
  nothink: {
    zh: `禁用深度思考`,
    en: `disable thinking`,
    zh_TW: `停用深度思考`,
  },
  think_ignore: {
    zh: `忽略以下模型的<think>输出,逗号(,)分割,当模型支持思考但ollama不支持时需要填写本参数`,
    en: `Ignore the <think> block for the following models, comma (,) separated`,
    zh_TW: `忽略以下模型的 <think> 輸出，以逗號 (,) 分隔；當模型支援思考但 ollama 不支援時需要填寫此參數`,
  },
  fetch_interval: {
    zh: `每次请求间隔时间 (0-5000ms)`,
    en: `Time Between Requests (0-5000ms)`,
    zh_TW: `每次請求間隔時間 (0-5000ms)`,
  },
  translate_interval: {
    zh: `重新翻译间隔时间 (100-5000ms)`,
    en: `Retranslation Interval (100-5000ms)`,
    zh_TW: `重新翻譯間隔時間 (100-5000ms)`,
  },
  http_timeout: {
    zh: `请求超时时间 (5000-30000ms)`,
    en: `Request Timeout Time (5000-30000ms)`,
    zh_TW: `請求逾時時間 (5000-30000ms)`,
  },
  custom_header: {
    zh: `自定义Header参数`,
    en: `Custom Header Params`,
  },
  custom_header_help: {
    zh: `使用JSON格式，例如 "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0"`,
    en: `Use JSON format, for example "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0"`,
  },
  custom_body: {
    zh: `自定义Body参数`,
    en: `Custom Body Params`,
  },
  custom_body_help: {
    zh: `使用JSON格式，例如 "top_p": 0.7`,
    en: `Use JSON format, for example "top_p": 0.7`,
  },
  min_translate_length: {
    zh: `最小翻译字符数 (1-100)`,
    en: `Minimum number Of Translated Characters (1-100)`,
    zh_TW: `最小翻譯字元數 (1-100)`,
  },
  max_translate_length: {
    zh: `最大翻译字符数 (100-10000)`,
    en: `Maximum number Of Translated Characters (100-10000)`,
    zh_TW: `最大翻譯字元數 (100-10000)`,
  },
  num_of_newline_characters: {
    zh: `换行字符数 (1-1000)`,
    en: `Number of Newline Characters (1-1000)`,
    zh_TW: `換行字元數 (1-1000)`,
  },
  translate_service: {
    zh: `翻译服务`,
    en: `Translate Service`,
    zh_TW: `翻譯服務`,
  },
  translate_timing: {
    zh: `翻译时机`,
    en: `Translate Timing`,
    zh_TW: `翻譯時機`,
  },
  mk_pagescroll: {
    zh: `滚动加载翻译（推荐）`,
    en: `Rolling Loading (Suggested)`,
    zh_TW: `滾動載入翻譯（建議）`,
  },
  mk_pageopen: {
    zh: `页面打开全部翻译`,
    en: `Page Open`,
    zh_TW: `頁面開啟全部翻譯`,
  },
  mk_mouseover: {
    zh: `鼠标悬停翻译`,
    en: `Mouseover`,
    zh_TW: `滑鼠懸停翻譯`,
  },
  mk_ctrlKey: {
    zh: `Control + 鼠标悬停`,
    en: `Control + Mouseover`,
    zh_TW: `Control + 滑鼠懸停`,
  },
  mk_shiftKey: {
    zh: `Shift + 鼠标悬停`,
    en: `Shift + Mouseover`,
    zh_TW: `Shift + 滑鼠懸停`,
  },
  mk_altKey: {
    zh: `Alt + 鼠标悬停`,
    en: `Alt + Mouseover`,
    zh_TW: `Alt + 滑鼠懸停`,
  },
  from_lang: {
    zh: `原文语言`,
    en: `Source Language`,
    zh_TW: `原文語言`,
  },
  to_lang: {
    zh: `目标语言`,
    en: `Target Language`,
    zh_TW: `目標語言`,
  },
  to_lang2: {
    zh: `第二目标语言`,
    en: `Target Language 2`,
    zh_TW: `第二目標語言`,
  },
  to_lang2_helper: {
    zh: `设定后，与目标语言产生互译效果，但依赖远程语言识别。`,
    en: `After setting, it will produce mutual translation effect with the target language, but it relies on remote language recognition.`,
    zh_TW: `設定後會與目標語言互譯，但依賴遠端語言識別。`,
  },
  text_style: {
    zh: `译文样式`,
    en: `Text Style`,
    zh_TW: `譯文樣式`,
  },
  text_style_alt: {
    zh: `译文样式`,
    en: `Text Style`,
    zh_TW: `譯文樣式`,
  },
  bg_color: {
    zh: `样式颜色`,
    en: `Style Color`,
    zh_TW: `樣式顏色`,
  },
  remain_unchanged: {
    zh: `保留不变`,
    en: `Remain Unchanged`,
    zh_TW: `保留不變`,
  },
  google_api: {
    zh: `谷歌翻译接口`,
    en: `Google Translate API`,
    zh_TW: `Google 翻譯介面`,
  },
  default_selector: {
    zh: `默认选择器`,
    en: `Default selector`,
    zh_TW: `預設選擇器`,
  },
  selector_rules: {
    zh: `选择器规则`,
    en: `Selector Rules`,
    zh_TW: `選擇器規則`,
  },
  save: {
    zh: `保存`,
    en: `Save`,
    zh_TW: `儲存`,
  },
  edit: {
    zh: `编辑`,
    en: `Edit`,
    zh_TW: `編輯`,
  },
  cancel: {
    zh: `取消`,
    en: `Cancel`,
    zh_TW: `取消`,
  },
  delete: {
    zh: `删除`,
    en: `Delete`,
    zh_TW: `刪除`,
  },
  reset: {
    zh: `重置`,
    en: `Reset`,
    zh_TW: `重設`,
  },
  add: {
    zh: `添加`,
    en: `Add`,
    zh_TW: `新增`,
  },
  inject_rules: {
    zh: `注入订阅规则`,
    en: `Inject Subscribe Rules`,
    zh_TW: `注入訂閱規則`,
  },
  personal_rules: {
    zh: `个人规则`,
    en: `Rules`,
    zh_TW: `個人規則`,
  },
  subscribe_rules: {
    zh: `订阅规则`,
    en: `Subscribe`,
    zh_TW: `訂閱規則`,
  },
  overwrite_subscribe_rules: {
    zh: `覆写订阅规则`,
    en: `Overwrite`,
    zh_TW: `覆寫訂閱規則`,
  },
  subscribe_url: {
    zh: `订阅地址`,
    en: `Subscribe URL`,
    zh_TW: `訂閱網址`,
  },
  rules_warn_1: {
    zh: `1、“个人规则”一直生效，选择“注入订阅规则”后，“订阅规则”才会生效。`,
    en: `1. The "Personal Rules" are always in effect. After selecting "Inject Subscription Rules", the "Subscription Rules" will take effect.`,
    zh_TW: `1.「個人規則」會一直生效；選擇「注入訂閱規則」後，「訂閱規則」才會生效。`,
  },
  rules_warn_2: {
    zh: `2、“订阅规则”的注入位置是倒数第二的位置，因此除全局规则(*)外，“个人规则”优先级比“订阅规则”高，“个人规则”填写同样的网址会覆盖”订阅规则“的条目。`,
    en: `2. The injection position of "Subscription Rules" is the penultimate position. Therefore, except for the global rules (*), the priority of "Personal Rules" is higher than that of "Subscription Rules". Filling in the same url in "Personal Rules" will overwrite "Subscription Rules" entry.`,
    zh_TW: `2.「訂閱規則」的注入位置為倒數第二位，故除全域規則 (*) 外，「個人規則」優先於「訂閱規則」。在「個人規則」填入相同網址時會覆蓋「訂閱規則」的條目。`,
  },
  rules_warn_3: {
    zh: `3、关于规则填写：输入框留空或下拉框选“*”表示采用全局规则。`,
    en: `3. Regarding filling in the rules: Leave the input box blank or select "*" in the drop-down box to use global rule.`,
    zh_TW: `3. 規則填寫說明：輸入框留空或下拉選擇「*」表示使用全域規則。`,
  },
  sync_warn: {
    zh: `涉及隐私数据的同步请谨慎选择第三方同步服务，建议自行搭建 kiss-worker 或 WebDAV 服务。`,
    en: `When synchronizing data that involves privacy, please be cautious about choosing third-party sync services. It is recommended to set up your own sync service using kiss-worker or WebDAV.`,
    zh_TW: `同步涉及隱私資料時，請謹慎選擇第三方同步服務；建議自建 kiss-worker 或 WebDAV 服務。`,
  },
  sync_warn_2: {
    zh: `如果服务器存在其他客户端同步的数据，第一次同步将直接覆盖本地配置，后面则根据修改时间，新的覆盖旧的。`,
    en: `If the server has data synchronized by other clients, the first synchronization will directly overwrite the local configuration, and later, according to the modification time, the new one will overwrite the old one.`,
    zh_TW: `若伺服器上存在其他用戶端同步的資料，第一次同步會直接覆蓋本機設定；之後則依修改時間，由新的覆蓋舊的。`,
  },
  about_sync_api: {
    zh: `自建kiss-wroker数据同步服务`,
    en: `Self-hosting a Kiss-worker data sync service`,
    zh_TW: `自建 kiss-wroker 資料同步服務`,
  },
  about_api: {
    zh: `暂未列出的接口，理论上都可以通过自定义接口的形式支持。`,
    en: `Interfaces that have not yet been launched can theoretically be supported through custom interfaces.`,
    zh_TW: `暫未列出的介面，理論上都可透過自訂介面的形式支援。`,
  },
  about_api_proxy: {
    zh: `查看自建一个翻译接口代理`,
    en: `Check out the self-built translation interface proxy`,
    zh_TW: `查看如何自建翻譯介面 Proxy`,
  },
  style_none: {
    zh: `无`,
    en: `None`,
    zh_TW: `無`,
  },
  under_line: {
    zh: `下划直线`,
    en: `Underline`,
    zh_TW: `下劃直線`,
  },
  dot_line: {
    zh: `下划点状线`,
    en: `Dotted Underline`,
    zh_TW: `下劃點狀線`,
  },
  dash_line: {
    zh: `下划虚线`,
    en: `Dashed Underline`,
    zh_TW: `下劃虛線`,
  },
  dash_box: {
    zh: `虚线框`,
    en: `Dashed Box`,
  },
  wavy_line: {
    zh: `下划波浪线`,
    en: `Wavy Underline`,
    zh_TW: `下劃波浪線`,
  },
  fuzzy: {
    zh: `模糊`,
    en: `Fuzzy`,
    zh_TW: `模糊`,
  },
  highlight: {
    zh: `高亮`,
    en: `Highlight`,
    zh_TW: `反白標示`,
  },
  blockquote: {
    zh: `引用`,
    en: `Blockquote`,
    zh_TW: `引用`,
  },
  diy_style: {
    zh: `自定义样式`,
    en: `Custom Style`,
    zh_TW: `自訂樣式`,
  },
  diy_style_helper: {
    zh: `遵循“CSS”的语法`,
    en: `Follow the syntax of "CSS"`,
    zh_TW: `遵循 CSS 語法`,
  },
  setting: {
    zh: `设置`,
    en: `Setting`,
    zh_TW: `設定`,
  },
  pattern: {
    zh: `匹配网址`,
    en: `URL pattern`,
    zh_TW: `匹配網址`,
  },
  pattern_helper: {
    zh: `1、支持星号(*)通配符。2、多个URL用换行或英文逗号“,”分隔。`,
    en: `1. Supports the asterisk (*) wildcard character. 2. Separate multiple URLs with newlines or English commas ",".`,
    zh_TW: `1. 支援星號 (*) 萬用字元。2. 多個 URL 請以換行或英文逗號「,」分隔。`,
  },
  selector_helper: {
    zh: `1、遵循CSS选择器语法。2、多个CSS选择器之间用“;”隔开。3、“shadow root”选择器和内部选择器用“>>>”隔开。`,
    en: `1. Follow CSS selector syntax. 2. Separate multiple CSS selectors with ";". 3. The "shadow root" selector and the internal selector are separated by ">>>".`,
    zh_TW: `1. 遵循 CSS 選擇器語法。2. 多個 CSS 選擇器以「;」分隔。3.「shadow root」與內部選擇器以「>>>」分隔。`,
  },
  translate_switch: {
    zh: `开启翻译`,
    en: `Translate Switch`,
    zh_TW: `開啟翻譯`,
  },
  default_enabled: {
    zh: `默认开启`,
    en: `Enabled`,
    zh_TW: `預設開啟`,
  },
  default_disabled: {
    zh: `默认关闭`,
    en: `Disabled`,
    zh_TW: `預設關閉`,
  },
  selector: {
    zh: `选择器`,
    en: `Selector`,
    zh_TW: `選擇器`,
  },
  keep_selector: {
    zh: `保留元素选择器`,
    en: `Keep unchanged selector`,
    zh_TW: `保留元素選擇器`,
  },
  keep_selector_helper: {
    zh: `1、遵循CSS选择器语法。`,
    en: `1. Follow CSS selector syntax.`,
    zh_TW: `1. 遵循 CSS 選擇器語法。`,
  },
  terms: {
    zh: `专业术语`,
    en: `Terms`,
    zh_TW: `專業術語`,
  },
  terms_helper: {
    zh: `1、支持正则表达式匹配，无需斜杆，不支持修饰符。2、多条术语用换行或分号“;”隔开。3、术语和译文用英文逗号“,”隔开。4、没有译文视为不翻译术语。`,
    en: `1. Supports regular expression matching, no slash required, and no modifiers are supported. 2. Separate multiple terms with newlines or semicolons ";". 3. Terms and translations are separated by English commas ",". 4. If there is no translation, the term will be deemed not to be translated.`,
    zh_TW: `1. 支援正則表達式比對，無需斜線，且不支援修飾符。2. 多條術語以換行或分號「;」分隔。3. 術語與譯文以英文逗號「,」分隔。4. 無譯文者視為不翻譯該術語。`,
  },
  selector_style: {
    zh: `选择器节点样式`,
    en: `Selector Style`,
    zh_TW: `選擇器節點樣式`,
  },
  selector_style_helper: {
    zh: `开启翻译时注入，关闭翻译时不会移除。`,
    en: `It is injected when translation is turned on and will not be removed when translation is turned off.`,
    zh_TW: `在開啟翻譯時注入，關閉翻譯時不會移除。`,
  },
  selector_parent_style: {
    zh: `选择器父节点样式`,
    en: `Selector Parent Style`,
    zh_TW: `選擇器父節點樣式`,
  },
  inject_js: {
    zh: `注入JS`,
    en: `Inject JS`,
    zh_TW: `注入 JS`,
  },
  inject_js_helper: {
    zh: `1、开启翻译时注入运行，关闭翻译时移除。2、随着页面变化，可能会多次注入运行。`,
    en: `1. Inject and run when translation is turned on, and removed when translation is turned off. 2. As the page changes, it may be injected and run multiple times.`,
    zh_TW: `1. 開啟翻譯時注入並執行，關閉翻譯時移除。2. 隨頁面變化，可能多次注入與執行。`,
  },
  inject_css: {
    zh: `注入CSS`,
    en: `Inject CSS`,
    zh_TW: `注入 CSS`,
  },
  inject_css_helper: {
    zh: `开启翻译时注入，关闭翻译时将移除。`,
    en: `Injected when translation is enabled and removed when translation is disabled.`,
    zh_TW: `開啟翻譯時注入，關閉翻譯時會移除。`,
  },
  root_selector: {
    zh: `根选择器`,
    en: `Root Selector`,
    zh_TW: `根選擇器`,
  },
  fixer_function: {
    zh: `修复函数`,
    en: `Fixer Function`,
    zh_TW: `修復函式`,
  },
  fixer_function_helper: {
    zh: `1、br是将<br>换行替换成<p "kiss-p">。2、bn是将\\n换行替换成<p "kiss-p">。3、brToDiv和bnToDiv是替换成<div class="kiss-p">。`,
    en: `1. br replaces <br> line breaks with <p "kiss-p">. 2. bn replaces \\n newline with <p "kiss-p">. 3. brToDiv and bnToDiv are replaced with <div class="kiss-p">.`,
    zh_TW: `1. br 會將 <br> 換行替換為 <p "kiss-p">。2. bn 會將 \\n 換行替換為 <p "kiss-p">。3. brToDiv 與 bnToDiv 會替換為 <div class="kiss-p">。`,
  },
  import: {
    zh: `导入`,
    en: `Import`,
    zh_TW: `匯入`,
  },
  export: {
    zh: `导出`,
    en: `Export`,
    zh_TW: `匯出`,
  },
  export_translation: {
    zh: `导出释义`,
    en: `Export Translation`,
    zh_TW: `匯出釋義`,
  },
  error_cant_be_blank: {
    zh: `不能为空`,
    en: `Can not be blank`,
    zh_TW: `不可為空`,
  },
  error_duplicate_values: {
    zh: `存在重复的值`,
    en: `There are duplicate values`,
    zh_TW: `存在重複的值`,
  },
  error_wrong_file_type: {
    zh: `错误的文件类型`,
    en: `Wrong file type`,
    zh_TW: `檔案類型錯誤`,
  },
  error_fetch_url: {
    zh: `请检查url地址是否正确或稍后再试。`,
    en: `Please check if the url address is correct or try again later.`,
    zh_TW: `請檢查 URL 是否正確或稍後再試。`,
  },
  deepl_api: {
    zh: `DeepL 接口`,
    en: `DeepL API`,
    zh_TW: `DeepL 介面`,
  },
  deepl_key: {
    zh: `DeepL 密钥`,
    en: `DeepL Key`,
    zh_TW: `DeepL 金鑰`,
  },
  openai_api: {
    zh: `OpenAI 接口`,
    en: `OpenAI API`,
    zh_TW: `OpenAI 介面`,
  },
  openai_key: {
    zh: `OpenAI 密钥`,
    en: `OpenAI Key`,
    zh_TW: `OpenAI 金鑰`,
  },
  openai_model: {
    zh: `OpenAI 模型`,
    en: `OpenAI Model`,
    zh_TW: `OpenAI 模型`,
  },
  openai_prompt: {
    zh: `OpenAI 提示词`,
    en: `OpenAI Prompt`,
    zh_TW: `OpenAI 提示詞`,
  },
  if_clear_cache: {
    zh: `是否清除缓存`,
    en: `Whether clear cache`,
    zh_TW: `是否清除快取`,
  },
  clear_cache_never: {
    zh: `不清除缓存`,
    en: `Never clear cache`,
    zh_TW: `不清除快取`,
  },
  clear_cache_restart: {
    zh: `重启浏览器时清除缓存`,
    en: `Clear cache when restarting browser`,
    zh_TW: `重新啟動瀏覽器時清除快取`,
  },
  data_sync_type: {
    zh: `数据同步方式`,
    en: `Data Sync Type`,
    zh_TW: `資料同步方式`,
  },
  data_sync_url: {
    zh: `数据同步接口`,
    en: `Data Sync API`,
    zh_TW: `資料同步介面`,
  },
  data_sync_user: {
    zh: `数据同步账户`,
    en: `Data Sync User`,
    zh_TW: `資料同步帳號`,
  },
  data_sync_key: {
    zh: `数据同步密钥`,
    en: `Data Sync Key`,
    zh_TW: `資料同步金鑰`,
  },
  sync_now: {
    zh: `立即同步`,
    en: `Sync Now`,
    zh_TW: `立即同步`,
  },
  sync_success: {
    zh: `同步成功！`,
    en: `Sync Success`,
    zh_TW: `同步成功！`,
  },
  sync_failed: {
    zh: `同步失败！`,
    en: `Sync Error`,
    zh_TW: `同步失敗！`,
  },
  error_got_some_wrong: {
    zh: `抱歉，出错了！`,
    en: `Sorry, something went wrong!`,
    zh_TW: `抱歉，發生錯誤！`,
  },
  error_sync_setting: {
    zh: `您的同步类型必须为“KISS-Worker”，且需填写完整`,
    en: `Your sync type must be "KISS-Worker" and must be filled in completely`,
    zh_TW: `您的同步型態必須為「KISS-Worker」，且需填寫完整。`,
  },
  click_test: {
    zh: `点击测试`,
    en: `Click Test`,
    zh_TW: `點擊測試`,
  },
  test_success: {
    zh: `测试成功`,
    en: `Test success`,
    zh_TW: `測試成功`,
  },
  test_failed: {
    zh: `测试失败`,
    en: `Test failed`,
    zh_TW: `測試失敗`,
  },
  clear_all_cache_now: {
    zh: `立即清除全部缓存`,
    en: `Clear all cache now`,
    zh_TW: `立即清除全部快取`,
  },
  clear_cache: {
    zh: `清除缓存`,
    en: `Clear Cache`,
    zh_TW: `清除快取`,
  },
  clear_success: {
    zh: `清除成功`,
    en: `Clear success`,
    zh_TW: `清除成功`,
  },
  clear_failed: {
    zh: `清除失败`,
    en: `Clear failed`,
    zh_TW: `清除失敗`,
  },
  share: {
    zh: `分享`,
    en: `Share`,
    zh_TW: `分享`,
  },
  clear_all: {
    zh: `清空`,
    en: `Clear All`,
    zh_TW: `清空`,
  },
  help: {
    zh: `求助`,
    en: `Help`,
    zh_TW: `求助`,
  },
  restore_default: {
    zh: `恢复默认`,
    en: `Restore Default`,
    zh_TW: `恢復預設`,
  },
  shortcuts_setting: {
    zh: `快捷键设置`,
    en: `Shortcuts Setting`,
    zh_TW: `快捷鍵設定`,
  },
  toggle_translate_shortcut: {
    zh: `"开启翻译"快捷键`,
    en: `"Toggle Translate" Shortcut`,
    zh_TW: `「開啟翻譯」快捷鍵`,
  },
  toggle_style_shortcut: {
    zh: `"切换样式"快捷键`,
    en: `"Toggle Style" Shortcut`,
    zh_TW: `「切換樣式」快捷鍵`,
  },
  toggle_popup_shortcut: {
    zh: `"打开弹窗"快捷键`,
    en: `"Open Popup" Shortcut`,
    zh_TW: `「開啟彈窗」快捷鍵`,
  },
  open_setting_shortcut: {
    zh: `"打开设置"快捷键`,
    en: `"Open Setting" Shortcut`,
    zh_TW: `「開啟設定」快捷鍵`,
  },
  hide_fab_button: {
    zh: `隐藏悬浮按钮`,
    en: `Hide Fab Button`,
    zh_TW: `隱藏懸浮按鈕`,
  },

  hide_tran_button: {
    zh: `隐藏翻译按钮`,
    en: `Hide Translate Button`,
    zh_TW: `隱藏翻譯按鈕`,
  },
  hide_click_away: {
    zh: `点击外部关闭弹窗`,
    en: `Click outside to close the pop-up window`,
    zh_TW: `點擊外部關閉彈窗`,
  },
  use_simple_style: {
    zh: `使用简洁界面`,
    en: `Use a simple interface`,
    zh_TW: `使用簡潔介面`,
  },
  show: {
    zh: `显示`,
    en: `Show`,
    zh_TW: `顯示`,
  },
  hide: {
    zh: `隐藏`,
    en: `Hide`,
    zh_TW: `隱藏`,
  },
  save_rule: {
    zh: `保存规则`,
    en: `Save Rule`,
    zh_TW: `儲存規則`,
  },
  global_rule: {
    zh: `全局规则`,
    en: `Global Rule`,
    zh_TW: `全域規則`,
  },
  input_translate: {
    zh: `输入框翻译`,
    en: `Input Box Translation`,
    zh_TW: `輸入框翻譯`,
  },
  use_input_box_translation: {
    zh: `启用输入框翻译`,
    en: `Input Box Translation`,
    zh_TW: `啟用輸入框翻譯`,
  },
  input_selector: {
    zh: `输入框选择器`,
    en: `Input Selector`,
    zh_TW: `輸入框選擇器`,
  },
  input_selector_helper: {
    zh: `用于输入框翻译。`,
    en: `Used for input box translation.`,
    zh_TW: `用於輸入框翻譯。`,
  },
  trigger_trans_shortcut: {
    zh: `触发翻译快捷键`,
    en: `Trigger Translation Shortcut Keys`,
    zh_TW: `觸發翻譯快捷鍵`,
  },
  trigger_trans_shortcut_help: {
    zh: `默认为单击“AltLeft+KeyI”`,
    en: `Default is "AltLeft+KeyI"`,
    zh_TW: `預設為按下「AltLeft+KeyI」`,
  },
  shortcut_press_count: {
    zh: `快捷键连击次数`,
    en: `Shortcut Press Number`,
    zh_TW: `快捷鍵連擊次數`,
  },
  combo_timeout: {
    zh: `连击超时时间 (10-1000ms)`,
    en: `Combo Timeout (10-1000ms)`,
    zh_TW: `連擊逾時 (10-1000ms)`,
  },
  input_trans_start_sign: {
    zh: `翻译起始标识`,
    en: `Translation Start Sign`,
    zh_TW: `翻譯起始標記`,
  },
  input_trans_start_sign_help: {
    zh: `标识后面可以加目标语言代码，如： “/en 你好”、“/zh hello”`,
    en: `The target language code can be added after the sign, such as: "/en 你好", "/zh hello"`,
    zh_TW: `標記後可加上目標語言代碼，例如：「/en 你好」、「/zh hello」`,
  },
  detect_lang_remote: {
    zh: `远程语言检测`,
    en: `Remote language detection`,
    zh_TW: `遠端語言偵測`,
  },
  detect_lang_remote_help: {
    zh: `启用后检测准确度增加，但会降低翻译速度，请酌情开启`,
    en: `After enabling, the detection accuracy will increase, but it will reduce the translation speed. Please enable it as appropriate.`,
    zh_TW: `啟用後可提升偵測準確度，但會降低翻譯速度，請視需要開啟。`,
  },
  disable: {
    zh: `禁用`,
    en: `Disable`,
    zh_TW: `停用`,
  },
  enable: {
    zh: `启用`,
    en: `Enable`,
    zh_TW: `啟用`,
  },
  selection_translate: {
    zh: `划词翻译`,
    en: `Selection Translate`,
    zh_TW: `劃詞翻譯`,
  },
  toggle_selection_translate: {
    zh: `启用划词翻译`,
    en: `Use Selection Translate`,
    zh_TW: `啟用劃詞翻譯`,
  },
  trigger_tranbox_shortcut: {
    zh: `显示翻译框/翻译选中文字快捷键`,
    en: `Open Translate Popup/Translate Selected Shortcut`,
    zh_TW: `顯示翻譯框／翻譯選中文字快捷鍵`,
  },
  tranbtn_offset_x: {
    zh: `翻译按钮偏移X（±200）`,
    en: `Translate Button Offset X (±200)`,
    zh_TW: `翻譯按鈕位移 X（±200）`,
  },
  tranbtn_offset_y: {
    zh: `翻译按钮偏移Y（±200）`,
    en: `Translate Button Offset Y (±200)`,
    zh_TW: `翻譯按鈕位移 Y（±200）`,
  },
  tranbox_offset_x: {
    zh: `翻译框偏移X（±200）`,
    en: `Translate Box Offset X (±200)`,
    zh_TW: `翻譯框位移 X（±200）`,
  },
  tranbox_offset_y: {
    zh: `翻译框偏移Y（±200）`,
    en: `Translate Box Offset Y (±200)`,
    zh_TW: `翻譯框位移 Y（±200）`,
  },
  translated_text: {
    zh: `译文`,
    en: `Translated Text`,
    zh_TW: `譯文`,
  },
  original_text: {
    zh: `原文`,
    en: `Original Text`,
    zh_TW: `原文`,
  },
  favorite_words: {
    zh: `收藏词汇`,
    en: `Favorite Words`,
    zh_TW: `收藏詞彙`,
  },
  touch_setting: {
    zh: `触屏设置`,
    en: `Touch Setting`,
    zh_TW: `觸控設定`,
  },
  touch_translate_shortcut: {
    zh: `触屏翻译快捷方式`,
    en: `Touch Translate Shortcut`,
    zh_TW: `觸控翻譯捷徑`,
  },
  touch_tap_0: {
    zh: `禁用`,
    en: `Disable`,
    zh_TW: `停用`,
  },
  touch_tap_2: {
    zh: `双指轻触`,
    en: `Two finger tap`,
    zh_TW: `雙指輕觸`,
  },
  touch_tap_3: {
    zh: `三指轻触`,
    en: `Three finger tap`,
    zh_TW: `三指輕觸`,
  },
  touch_tap_4: {
    zh: `四指轻触`,
    en: `Four finger tap`,
    zh_TW: `四指輕觸`,
  },
  translate_blacklist: {
    zh: `禁用翻译名单`,
    en: `Translate Blacklist`,
    zh_TW: `停用翻譯名單`,
  },
  disabled_csplist: {
    zh: `禁用CSP名单`,
    en: `Disabled CSP List`,
    zh_TW: `停用 CSP 名單`,
  },
  disabled_csplist_helper: {
    zh: `3、通过调整CSP策略，使得某些页面能够注入JS/CSS/Media，请谨慎使用，除非您已知晓相关风险。`,
    en: `3. By adjusting the CSP policy, some pages can inject JS/CSS/Media. Please use it with caution unless you are aware of the related risks.`,
    zh_TW: `3. 透過調整 CSP 政策，使部分頁面可注入 JS/CSS/Media。請謹慎使用，除非您已知悉相關風險。`,
  },
  skip_langs: {
    zh: `不翻译的语言`,
    en: `Disable Languages`,
    zh_TW: `不翻譯的語言`,
  },
  skip_langs_helper: {
    zh: `此功能依赖准确的语言检测，建议启用远程语言检测。`,
    en: `This feature relies on accurate language detection. It is recommended to enable remote language detection.`,
    zh_TW: `此功能仰賴準確的語言偵測，建議啟用遠端語言偵測。`,
  },
  context_menus: {
    zh: `右键菜单`,
    en: `Context Menus`,
    zh_TW: `右鍵選單`,
  },
  hide_context_menus: {
    zh: `隐藏右键菜单`,
    en: `Hide Context Menus`,
    zh_TW: `隱藏右鍵選單`,
  },
  simple_context_menus: {
    zh: `简单右键菜单`,
    en: `Simple_context_menus Context Menus`,
    zh_TW: `簡易右鍵選單`,
  },
  secondary_context_menus: {
    zh: `二级右键菜单`,
    en: `Secondary Context Menus`,
    zh_TW: `次級右鍵選單`,
  },
  mulkeys_help: {
    zh: `支持用换行或英文逗号“,”分隔，轮询调用。`,
    en: `Supports polling calls separated by newlines or English commas ",".`,
    zh_TW: `支援以換行或英文逗號「,」分隔，輪詢呼叫。`,
  },
  translation_element_tag: {
    zh: `译文元素标签`,
    en: `Translation Element Tag`,
    zh_TW: `譯文元素標籤`,
  },
  show_only_translations: {
    zh: `仅显示译文`,
    en: `Show Only Translations`,
    zh_TW: `僅顯示譯文`,
  },
  show_only_translations_help: {
    zh: `非完美实现，某些页面可能有样式等问题。`,
    en: `It is not a perfect implementation and some pages may have style issues.`,
    zh_TW: `此為非完美實作，部分頁面可能出現樣式等問題。`,
  },
  translate_page_title: {
    zh: `是否翻译页面标题`,
    en: `Translate Page Title`,
    zh_TW: `是否翻譯頁面標題`,
  },
  more: {
    zh: `更多`,
    en: `More`,
    zh_TW: `更多`,
  },
  less: {
    zh: `更少`,
    en: `Less`,
    zh_TW: `更少`,
  },
  fixer_selector: {
    zh: `网页修复选择器`,
    en: `Fixer Selector`,
    zh_TW: `網頁修復選擇器`,
  },
  reg_niutrans: {
    zh: `获取小牛翻译密钥【简约翻译专属新用户注册赠送300万字符】`,
    en: `Get NiuTrans APIKey [KISS Translator Exclusive New User Registration Free 3 Million Characters]`,
    zh_TW: `取得小牛翻譯金鑰【簡約翻譯專屬新用戶註冊贈送 300 萬字元】`,
  },
  trigger_mode: {
    zh: `触发方式`,
    en: `Trigger Mode`,
    zh_TW: `觸發方式`,
  },
  trigger_click: {
    zh: `点击触发`,
    en: `Click Trigger`,
    zh_TW: `點擊觸發`,
  },
  trigger_hover: {
    zh: `鼠标悬停触发`,
    en: `Hover Trigger`,
    zh_TW: `滑鼠懸停觸發`,
  },
  trigger_select: {
    zh: `选中触发`,
    en: `Select Trigger`,
    zh_TW: `選取觸發`,
  },
  extend_styles: {
    zh: `附加样式`,
    en: `Extend Styles`,
    zh_TW: `附加樣式`,
  },
  custom_option: {
    zh: `自定义选项`,
    en: `Custom Option`,
    zh_TW: `自訂選項`,
  },
  translate_selected_text: {
    zh: `翻译选中文字`,
    en: `Translate Selected Text`,
    zh_TW: `翻譯選取文字`,
  },
  toggle_style: {
    zh: `切换样式`,
    en: `Toggle Style`,
    zh_TW: `切換樣式`,
  },
  open_menu: {
    zh: `打开弹窗菜单`,
    en: `Open Popup Menu`,
    zh_TW: `開啟彈窗選單`,
  },
  open_setting: {
    zh: `打开设置`,
    en: `Open Setting`,
    zh_TW: `開啟設定`,
  },
  follow_selection: {
    zh: `翻译框跟随选中文本`,
    en: `Transbox Follow Selection`,
    zh_TW: `翻譯框跟隨選取文字`,
  },
  translate_start_hook: {
    zh: `翻译开始钩子函数`,
    en: `Translate Start Hook`,
    zh_TW: `翻譯開始 Hook`,
  },
  translate_start_hook_helper: {
    zh: `翻译开始时运行，入参为： 翻译节点，原文文本。`,
    en: `Run when translation starts, the input parameters are: translation node, original text.`,
    zh_TW: `翻譯開始時執行，入參為：翻譯節點、原文文字。`,
  },
  translate_end_hook: {
    zh: `翻译完成钩子函数`,
    en: `Translate End Hook`,
    zh_TW: `翻譯完成 Hook`,
  },
  translate_end_hook_helper: {
    zh: `翻译完成时运行，入参为： 翻译节点，原文文本，译文文本，保留元素。`,
    en: `Run when the translation is completed, the input parameters are: translation node, original text, translation text, retained elements.`,
    zh_TW: `翻譯完成時執行，入參為：翻譯節點、原文文字、譯文文字、保留元素。`,
  },
  translate_remove_hook: {
    zh: `翻译移除钩子函数`,
    en: `Translate Removed Hook`,
    zh_TW: `翻譯移除 Hook`,
  },
  translate_remove_hook_helper: {
    zh: `翻译移除时运行，入参为： 翻译节点。`,
    en: `Run when translation is removed, the input parameters are: translation node.`,
    zh_TW: `移除翻譯時執行，入參為：翻譯節點。`,
  },
  english_dict: {
    zh: `英文词典`,
    en: `English Dictionary`,
    zh_TW: `英文字典`,
  },
  api_name: {
    zh: `接口名称`,
    en: `API Name`,
    zh_TW: `介面名稱`,
  },
  is_disabled: {
    zh: `是否禁用`,
    en: `Is Disabled`,
    zh_TW: `是否停用`,
  },
  translate_selected: {
    zh: `是否启用划词翻译`,
    en: `If translate selected`,
    zh_TW: `是否啟用劃詞翻譯`,
  },
};
