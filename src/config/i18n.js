export const UI_LANGS = [
  ["en", "English"],
  ["zh", "中文"],
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
  },
  translate: {
    zh: `翻译`,
    en: `Translate`,
  },
  custom_api_help: {
    zh: customApiHelpZH,
    en: customApiHelpEN,
  },
  translate_alt: {
    zh: `翻译`,
    en: `Translate`,
  },
  basic_setting: {
    zh: `基本设置`,
    en: `Basic Setting`,
  },
  rules_setting: {
    zh: `规则设置`,
    en: `Rules Setting`,
  },
  apis_setting: {
    zh: `接口设置`,
    en: `Apis Setting`,
  },
  sync_setting: {
    zh: `同步设置`,
    en: `Sync Setting`,
  },
  patch_setting: {
    zh: `补丁设置`,
    en: `Patch Setting`,
  },
  patch_setting_help: {
    zh: `针对一些特殊网站的修正脚本，以便翻译软件得到更好的展示效果。`,
    en: `Corrected scripts for some special websites so that the translation software can get better display results.`,
  },
  inject_webfix: {
    zh: `注入修复补丁`,
    en: `Inject Webfix`,
  },
  about: {
    zh: `关于`,
    en: `About`,
  },
  about_md: {
    zh: `README.md`,
    en: `README.en.md`,
  },
  about_md_local: {
    zh: `请 [点击这里](${process.env.REACT_APP_HOMEPAGE}) 查看详情。`,
    en: `Please [click here](${process.env.REACT_APP_HOMEPAGE}) for details.`,
  },
  ui_lang: {
    zh: `界面语言`,
    en: `Interface Language`,
  },
  fetch_limit: {
    zh: `最大并发请求数量 (1-100)`,
    en: `Maximum Number Of Concurrent Requests (1-100)`,
  },
  if_think: {
    zh: `启用或禁用模型的深度思考能力`,
    en: `Enable or disable the model’s thinking behavior `,
  },
  think: {
    zh: `启用深度思考`,
    en: `enable thinking`,
  },
  nothink: {
    zh: `禁用深度思考`,
    en: `disable thinking`,
  },
  think_ignore: {
    zh: `忽略以下模型的<think>输出,逗号(,)分割,当模型支持思考但ollama不支持时需要填写本参数`,
    en: `Ignore the <think> block for the following models, comma (,) separated`,
  },
  fetch_interval: {
    zh: `每次请求间隔时间 (0-5000ms)`,
    en: `Time Between Requests (0-5000ms)`,
  },
  translate_interval: {
    zh: `重新翻译间隔时间 (100-5000ms)`,
    en: `Retranslation Interval (100-5000ms)`,
  },
  http_timeout: {
    zh: `请求超时时间 (5000-30000ms)`,
    en: `Request Timeout Time (5000-30000ms)`,
  },
  custom_body: {
    zh: `自定义Body参数`,
    en: `API Custom Params`,
  },
  custom_body_help: {
    zh: `使用JSON格式，例如 "top_p": 0.7`,
    en: `Use JSON format, for example "top_p": 0.7`,
  },
  min_translate_length: {
    zh: `最小翻译字符数 (1-100)`,
    en: `Minimum number Of Translated Characters (1-100)`,
  },
  max_translate_length: {
    zh: `最大翻译字符数 (100-10000)`,
    en: `Maximum number Of Translated Characters (100-10000)`,
  },
  num_of_newline_characters: {
    zh: `换行字符数 (1-1000)`,
    en: `Number of Newline Characters (1-1000)`,
  },
  translate_service: {
    zh: `翻译服务`,
    en: `Translate Service`,
  },
  translate_timing: {
    zh: `翻译时机`,
    en: `Translate Timing`,
  },
  mk_pagescroll: {
    zh: `滚动加载翻译（推荐）`,
    en: `Rolling Loading (Suggested)`,
  },
  mk_pageopen: {
    zh: `页面打开全部翻译`,
    en: `Page Open`,
  },
  mk_mouseover: {
    zh: `鼠标悬停翻译`,
    en: `Mouseover`,
  },
  mk_ctrlKey: {
    zh: `Control + 鼠标悬停`,
    en: `Control + Mouseover`,
  },
  mk_shiftKey: {
    zh: `Shift + 鼠标悬停`,
    en: `Shift + Mouseover`,
  },
  mk_altKey: {
    zh: `Alt + 鼠标悬停`,
    en: `Alt + Mouseover`,
  },
  from_lang: {
    zh: `原文语言`,
    en: `Source Language`,
  },
  to_lang: {
    zh: `目标语言`,
    en: `Target Language`,
  },
  to_lang2: {
    zh: `第二目标语言`,
    en: `Target Language 2`,
  },
  to_lang2_helper: {
    zh: `设定后，与目标语言产生互译效果，但依赖远程语言识别。`,
    en: `After setting, it will produce mutual translation effect with the target language, but it relies on remote language recognition.`,
  },
  text_style: {
    zh: `译文样式`,
    en: `Text Style`,
  },
  text_style_alt: {
    zh: `译文样式`,
    en: `Text Style`,
  },
  bg_color: {
    zh: `样式颜色`,
    en: `Style Color`,
  },
  remain_unchanged: {
    zh: `保留不变`,
    en: `Remain Unchanged`,
  },
  google_api: {
    zh: `谷歌翻译接口`,
    en: `Google Translate API`,
  },
  default_selector: {
    zh: `默认选择器`,
    en: `Default selector`,
  },
  selector_rules: {
    zh: `选择器规则`,
    en: `Selector Rules`,
  },
  save: {
    zh: `保存`,
    en: `Save`,
  },
  edit: {
    zh: `编辑`,
    en: `Edit`,
  },
  cancel: {
    zh: `取消`,
    en: `Cancel`,
  },
  delete: {
    zh: `删除`,
    en: `Delete`,
  },
  reset: {
    zh: `重置`,
    en: `Reset`,
  },
  add: {
    zh: `添加`,
    en: `Add`,
  },
  inject_rules: {
    zh: `注入订阅规则`,
    en: `Inject Subscribe Rules`,
  },
  personal_rules: {
    zh: `个人规则`,
    en: `Rules`,
  },
  subscribe_rules: {
    zh: `订阅规则`,
    en: `Subscribe`,
  },
  overwrite_subscribe_rules: {
    zh: `覆写订阅规则`,
    en: `Overwrite`,
  },
  subscribe_url: {
    zh: `订阅地址`,
    en: `Subscribe URL`,
  },
  rules_warn_1: {
    zh: `1、“个人规则”一直生效，选择“注入订阅规则”后，“订阅规则”才会生效。`,
    en: `1. The "Personal Rules" are always in effect. After selecting "Inject Subscription Rules", the "Subscription Rules" will take effect.`,
  },
  rules_warn_2: {
    zh: `2、“订阅规则”的注入位置是倒数第二的位置，因此除全局规则(*)外，“个人规则”优先级比“订阅规则”高，“个人规则”填写同样的网址会覆盖”订阅规则“的条目。`,
    en: `2. The injection position of "Subscription Rules" is the penultimate position. Therefore, except for the global rules (*), the priority of "Personal Rules" is higher than that of "Subscription Rules". Filling in the same url in "Personal Rules" will overwrite "Subscription Rules" entry.`,
  },
  rules_warn_3: {
    zh: `3、关于规则填写：输入框留空或下拉框选“*”表示采用全局规则。`,
    en: `3. Regarding filling in the rules: Leave the input box blank or select "*" in the drop-down box to use global rule.`,
  },
  sync_warn: {
    zh: `涉及隐私数据的同步请谨慎选择第三方同步服务，建议自行搭建 kiss-worker 或 WebDAV 服务。`,
    en: `When synchronizing data that involves privacy, please be cautious about choosing third-party sync services. It is recommended to set up your own sync service using kiss-worker or WebDAV.`,
  },
  sync_warn_2: {
    zh: `如果服务器存在其他客户端同步的数据，第一次同步将直接覆盖本地配置，后面则根据修改时间，新的覆盖旧的。`,
    en: `If the server has data synchronized by other clients, the first synchronization will directly overwrite the local configuration, and later, according to the modification time, the new one will overwrite the old one.`,
  },
  about_sync_api: {
    zh: `自建kiss-wroker数据同步服务`,
    en: `Self-hosting a Kiss-worker data sync service`,
  },
  about_api: {
    zh: `暂未列出的接口，理论上都可以通过自定义接口的形式支持。`,
    en: `Interfaces that have not yet been launched can theoretically be supported through custom interfaces.`,
  },
  about_api_proxy: {
    zh: `查看自建一个翻译接口代理`,
    en: `Check out the self-built translation interface proxy`,
  },
  style_none: {
    zh: `无`,
    en: `None`,
  },
  under_line: {
    zh: `下划直线`,
    en: `Underline`,
  },
  dot_line: {
    zh: `下划点状线`,
    en: `Dotted Underline`,
  },
  dash_line: {
    zh: `下划虚线`,
    en: `Dashed Underline`,
  },
  wavy_line: {
    zh: `下划波浪线`,
    en: `Wavy Underline`,
  },
  fuzzy: {
    zh: `模糊`,
    en: `Fuzzy`,
  },
  highlight: {
    zh: `高亮`,
    en: `Highlight`,
  },
  blockquote: {
    zh: `引用`,
    en: `Blockquote`,
  },
  diy_style: {
    zh: `自定义样式`,
    en: `Custom Style`,
  },
  diy_style_helper: {
    zh: `遵循“CSS”的语法`,
    en: `Follow the syntax of "CSS"`,
  },
  setting: {
    zh: `设置`,
    en: `Setting`,
  },
  pattern: {
    zh: `匹配网址`,
    en: `URL pattern`,
  },
  pattern_helper: {
    zh: `1、支持星号(*)通配符。2、多个URL用换行或英文逗号“,”分隔。`,
    en: `1. Supports the asterisk (*) wildcard character. 2. Separate multiple URLs with newlines or English commas ",".`,
  },
  selector_helper: {
    zh: `1、遵循CSS选择器语法。2、多个CSS选择器之间用“;”隔开。3、“shadow root”选择器和内部选择器用“>>>”隔开。`,
    en: `1. Follow CSS selector syntax. 2. Separate multiple CSS selectors with ";". 3. The "shadow root" selector and the internal selector are separated by ">>>".`,
  },
  translate_switch: {
    zh: `开启翻译`,
    en: `Translate Switch`,
  },
  default_enabled: {
    zh: `默认开启`,
    en: `Enabled`,
  },
  default_disabled: {
    zh: `默认关闭`,
    en: `Disabled`,
  },
  selector: {
    zh: `选择器`,
    en: `Selector`,
  },
  keep_selector: {
    zh: `保留元素选择器`,
    en: `Keep unchanged selector`,
  },
  keep_selector_helper: {
    zh: `1、遵循CSS选择器语法。`,
    en: `1. Follow CSS selector syntax.`,
  },
  terms: {
    zh: `专业术语`,
    en: `Terms`,
  },
  terms_helper: {
    zh: `1、支持正则表达式匹配，无需斜杆，不支持修饰符。2、多条术语用换行或分号“;”隔开。3、术语和译文用英文逗号“,”隔开。4、没有译文视为不翻译术语。`,
    en: `1. Supports regular expression matching, no slash required, and no modifiers are supported. 2. Separate multiple terms with newlines or semicolons ";". 3. Terms and translations are separated by English commas ",". 4. If there is no translation, the term will be deemed not to be translated.`,
  },
  selector_style: {
    zh: `选择器节点样式`,
    en: `Selector Style`,
  },
  selector_style_helper: {
    zh: `开启翻译时注入，关闭翻译时不会移除。`,
    en: `It is injected when translation is turned on and will not be removed when translation is turned off.`,
  },
  selector_parent_style: {
    zh: `选择器父节点样式`,
    en: `Selector Parent Style`,
  },
  inject_js: {
    zh: `注入JS`,
    en: `Inject JS`,
  },
  inject_js_helper: {
    zh: `1、开启翻译时注入运行，关闭翻译时移除。2、随着页面变化，可能会多次注入运行。`,
    en: `1. Inject and run when translation is turned on, and removed when translation is turned off. 2. As the page changes, it may be injected and run multiple times.`,
  },
  inject_css: {
    zh: `注入CSS`,
    en: `Inject CSS`,
  },
  inject_css_helper: {
    zh: `开启翻译时注入，关闭翻译时将移除。`,
    en: `Injected when translation is enabled and removed when translation is disabled.`,
  },
  root_selector: {
    zh: `根选择器`,
    en: `Root Selector`,
  },
  fixer_function: {
    zh: `修复函数`,
    en: `Fixer Function`,
  },
  fixer_function_helper: {
    zh: `1、br是将<br>换行替换成<p "kiss-p">。2、bn是将\\n换行替换成<p "kiss-p">。3、brToDiv和bnToDiv是替换成<div class="kiss-p">。`,
    en: `1. br replaces <br> line breaks with <p "kiss-p">. 2. bn replaces \\n newline with <p "kiss-p">. 3. brToDiv and bnToDiv are replaced with <div class="kiss-p">.`,
  },
  import: {
    zh: `导入`,
    en: `Import`,
  },
  export: {
    zh: `导出`,
    en: `Export`,
  },
  export_translation: {
    zh: `导出释义`,
    en: `Export Translation`,
  },
  error_cant_be_blank: {
    zh: `不能为空`,
    en: `Can not be blank`,
  },
  error_duplicate_values: {
    zh: `存在重复的值`,
    en: `There are duplicate values`,
  },
  error_wrong_file_type: {
    zh: `错误的文件类型`,
    en: `Wrong file type`,
  },
  error_fetch_url: {
    zh: `请检查url地址是否正确或稍后再试。`,
    en: `Please check if the url address is correct or try again later.`,
  },
  deepl_api: {
    zh: `DeepL 接口`,
    en: `DeepL API`,
  },
  deepl_key: {
    zh: `DeepL 密钥`,
    en: `DeepL Key`,
  },
  openai_api: {
    zh: `OpenAI 接口`,
    en: `OpenAI API`,
  },
  openai_key: {
    zh: `OpenAI 密钥`,
    en: `OpenAI Key`,
  },
  openai_model: {
    zh: `OpenAI 模型`,
    en: `OpenAI Model`,
  },
  openai_prompt: {
    zh: `OpenAI 提示词`,
    en: `OpenAI Prompt`,
  },
  if_clear_cache: {
    zh: `是否清除缓存`,
    en: `Whether clear cache`,
  },
  clear_cache_never: {
    zh: `不清除缓存`,
    en: `Never clear cache`,
  },
  clear_cache_restart: {
    zh: `重启浏览器时清除缓存`,
    en: `Clear cache when restarting browser`,
  },
  data_sync_type: {
    zh: `数据同步方式`,
    en: `Data Sync Type`,
  },
  data_sync_url: {
    zh: `数据同步接口`,
    en: `Data Sync API`,
  },
  data_sync_user: {
    zh: `数据同步账户`,
    en: `Data Sync User`,
  },
  data_sync_key: {
    zh: `数据同步密钥`,
    en: `Data Sync Key`,
  },
  sync_now: {
    zh: `立即同步`,
    en: `Sync Now`,
  },
  sync_success: {
    zh: `同步成功！`,
    en: `Sync Success`,
  },
  sync_failed: {
    zh: `同步失败！`,
    en: `Sync Error`,
  },
  error_got_some_wrong: {
    zh: `抱歉，出错了！`,
    en: `Sorry, something went wrong!`,
  },
  error_sync_setting: {
    zh: `您的同步类型必须为“KISS-Worker”，且需填写完整`,
    en: `Your sync type must be "KISS-Worker" and must be filled in completely`,
  },
  click_test: {
    zh: `点击测试`,
    en: `Click Test`,
  },
  test_success: {
    zh: `测试成功`,
    en: `Test success`,
  },
  test_failed: {
    zh: `测试失败`,
    en: `Test failed`,
  },
  clear_all_cache_now: {
    zh: `立即清除全部缓存`,
    en: `Clear all cache now`,
  },
  clear_cache: {
    zh: `清除缓存`,
    en: `Clear Cache`,
  },
  clear_success: {
    zh: `清除成功`,
    en: `Clear success`,
  },
  clear_failed: {
    zh: `清除失败`,
    en: `Clear failed`,
  },
  share: {
    zh: `分享`,
    en: `Share`,
  },
  clear_all: {
    zh: `清空`,
    en: `Clear All`,
  },
  help: {
    zh: `求助`,
    en: `Help`,
  },
  restore_default: {
    zh: `恢复默认`,
    en: `Restore Default`,
  },
  shortcuts_setting: {
    zh: `快捷键设置`,
    en: `Shortcuts Setting`,
  },
  toggle_translate_shortcut: {
    zh: `"开启翻译"快捷键`,
    en: `"Toggle Translate" Shortcut`,
  },
  toggle_style_shortcut: {
    zh: `"切换样式"快捷键`,
    en: `"Toggle Style" Shortcut`,
  },
  toggle_popup_shortcut: {
    zh: `"打开弹窗"快捷键`,
    en: `"Open Popup" Shortcut`,
  },
  open_setting_shortcut: {
    zh: `"打开设置"快捷键`,
    en: `"Open Setting" Shortcut`,
  },
  hide_fab_button: {
    zh: `隐藏悬浮按钮`,
    en: `Hide Fab Button`,
  },
  hide_tran_button: {
    zh: `隐藏翻译按钮`,
    en: `Hide Translate Button`,
  },
  hide_click_away: {
    zh: `点击外部关闭弹窗`,
    en: `Click outside to close the pop-up window`,
  },
  use_simple_style: {
    zh: `使用简洁界面`,
    en: `Use a simple interface`,
  },
  show: {
    zh: `显示`,
    en: `Show`,
  },
  hide: {
    zh: `隐藏`,
    en: `Hide`,
  },
  save_rule: {
    zh: `保存规则`,
    en: `Save Rule`,
  },
  global_rule: {
    zh: `全局规则`,
    en: `Global Rule`,
  },
  input_translate: {
    zh: `输入框翻译`,
    en: `Input Box Translation`,
  },
  use_input_box_translation: {
    zh: `启用输入框翻译`,
    en: `Input Box Translation`,
  },
  input_selector: {
    zh: `输入框选择器`,
    en: `Input Selector`,
  },
  input_selector_helper: {
    zh: `用于输入框翻译。`,
    en: `Used for input box translation.`,
  },
  trigger_trans_shortcut: {
    zh: `触发翻译快捷键`,
    en: `Trigger Translation Shortcut Keys`,
  },
  trigger_trans_shortcut_help: {
    zh: `默认为单击“AltLeft+KeyI”`,
    en: `Default is "AltLeft+KeyI"`,
  },
  shortcut_press_count: {
    zh: `快捷键连击次数`,
    en: `Shortcut Press Number`,
  },
  combo_timeout: {
    zh: `连击超时时间 (10-1000ms)`,
    en: `Combo Timeout (10-1000ms)`,
  },
  input_trans_start_sign: {
    zh: `翻译起始标识`,
    en: `Translation Start Sign`,
  },
  input_trans_start_sign_help: {
    zh: `标识后面可以加目标语言代码，如： “/en 你好”、“/zh hello”`,
    en: `The target language code can be added after the sign, such as: "/en 你好", "/zh hello"`,
  },
  detect_lang_remote: {
    zh: `远程语言检测`,
    en: `Remote language detection`,
  },
  detect_lang_remote_help: {
    zh: `启用后检测准确度增加，但会降低翻译速度，请酌情开启`,
    en: `After enabling, the detection accuracy will increase, but it will reduce the translation speed. Please enable it as appropriate.`,
  },
  disable: {
    zh: `禁用`,
    en: `Disable`,
  },
  enable: {
    zh: `启用`,
    en: `Enable`,
  },
  selection_translate: {
    zh: `划词翻译`,
    en: `Selection Translate`,
  },
  toggle_selection_translate: {
    zh: `启用划词翻译`,
    en: `Use Selection Translate`,
  },
  trigger_tranbox_shortcut: {
    zh: `显示翻译框/翻译选中文字快捷键`,
    en: `Open Translate Popup/Translate Selected Shortcut`,
  },
  tranbtn_offset_x: {
    zh: `翻译按钮偏移X（±200）`,
    en: `Translate Button Offset X (±200)`,
  },
  tranbtn_offset_y: {
    zh: `翻译按钮偏移Y（±200）`,
    en: `Translate Button Offset Y (±200)`,
  },
  tranbox_offset_x: {
    zh: `翻译框偏移X（±200）`,
    en: `Translate Box Offset X (±200)`,
  },
  tranbox_offset_y: {
    zh: `翻译框偏移Y（±200）`,
    en: `Translate Box Offset Y (±200)`,
  },
  translated_text: {
    zh: `译文`,
    en: `Translated Text`,
  },
  original_text: {
    zh: `原文`,
    en: `Original Text`,
  },
  favorite_words: {
    zh: `收藏词汇`,
    en: `Favorite Words`,
  },
  touch_setting: {
    zh: `触屏设置`,
    en: `Touch Setting`,
  },
  touch_translate_shortcut: {
    zh: `触屏翻译快捷方式`,
    en: `Touch Translate Shortcut`,
  },
  touch_tap_0: {
    zh: `禁用`,
    en: `Disable`,
  },
  touch_tap_2: {
    zh: `双指轻触`,
    en: `Two finger tap`,
  },
  touch_tap_3: {
    zh: `三指轻触`,
    en: `Three finger tap`,
  },
  touch_tap_4: {
    zh: `四指轻触`,
    en: `Four finger tap`,
  },
  translate_blacklist: {
    zh: `禁用翻译名单`,
    en: `Translate Blacklist`,
  },
  disabled_csplist: {
    zh: `禁用CSP名单`,
    en: `Disabled CSP List`,
  },
  disabled_csplist_helper: {
    zh: `3、通过调整CSP策略，使得某些页面能够注入JS/CSS/Media，请谨慎使用，除非您已知晓相关风险。`,
    en: `3. By adjusting the CSP policy, some pages can inject JS/CSS/Media. Please use it with caution unless you are aware of the related risks.`,
  },
  skip_langs: {
    zh: `不翻译的语言`,
    en: `Disable Languages`,
  },
  skip_langs_helper: {
    zh: `此功能依赖准确的语言检测，建议启用远程语言检测。`,
    en: `This feature relies on accurate language detection. It is recommended to enable remote language detection.`,
  },
  context_menus: {
    zh: `右键菜单`,
    en: `Context Menus`,
  },
  hide_context_menus: {
    zh: `隐藏右键菜单`,
    en: `Hide Context Menus`,
  },
  simple_context_menus: {
    zh: `简单右键菜单`,
    en: `Simple_context_menus Context Menus`,
  },
  secondary_context_menus: {
    zh: `二级右键菜单`,
    en: `Secondary Context Menus`,
  },
  mulkeys_help: {
    zh: `支持用换行或英文逗号“,”分隔，轮询调用。`,
    en: `Supports polling calls separated by newlines or English commas ",".`,
  },
  translation_element_tag: {
    zh: `译文元素标签`,
    en: `Translation Element Tag`,
  },
  show_only_translations: {
    zh: `仅显示译文`,
    en: `Show Only Translations`,
  },
  show_only_translations_help: {
    zh: `非完美实现，某些页面可能有样式等问题。`,
    en: `It is not a perfect implementation and some pages may have style issues.`,
  },
  translate_page_title: {
    zh: `是否翻译页面标题`,
    en: `Translate Page Title`,
  },
  more: {
    zh: `更多`,
    en: `More`,
  },
  less: {
    zh: `更少`,
    en: `Less`,
  },
  fixer_selector: {
    zh: `网页修复选择器`,
    en: `Fixer Selector`,
  },
  reg_niutrans: {
    zh: `获取小牛翻译密钥【简约翻译专属新用户注册赠送300万字符】`,
    en: `Get NiuTrans APIKey [KISS Translator Exclusive New User Registration Free 3 Million Characters]`,
  },
  trigger_mode: {
    zh: `触发方式`,
    en: `Trigger Mode`,
  },
  trigger_click: {
    zh: `点击触发`,
    en: `Click Trigger`,
  },
  trigger_hover: {
    zh: `鼠标悬停触发`,
    en: `Hover Trigger`,
  },
  trigger_select: {
    zh: `选中触发`,
    en: `Select Trigger`,
  },
  extend_styles: {
    zh: `附加样式`,
    en: `Extend Styles`,
  },
  custom_option: {
    zh: `自定义选项`,
    en: `Custom Option`,
  },
  translate_selected_text: {
    zh: `翻译选中文字`,
    en: `Translate Selected Text`,
  },
  toggle_style: {
    zh: `切换样式`,
    en: `Toggle Style`,
  },
  open_menu: {
    zh: `打开弹窗菜单`,
    en: `Open Popup Menu`,
  },
  open_setting: {
    zh: `打开设置`,
    en: `Open Setting`,
  },
  follow_selection: {
    zh: `翻译框跟随选中文本`,
    en: `Transbox Follow Selection`,
  },
  translate_start_hook: {
    zh: `翻译开始钩子函数`,
    en: `Translate Start Hook`,
  },
  translate_start_hook_helper: {
    zh: `翻译开始时运行，入参为： 翻译节点，原文文本。`,
    en: `Run when translation starts, the input parameters are: translation node, original text.`,
  },
  translate_end_hook: {
    zh: `翻译完成钩子函数`,
    en: `Translate End Hook`,
  },
  translate_end_hook_helper: {
    zh: `翻译完成时运行，入参为： 翻译节点，原文文本，译文文本，保留元素。`,
    en: `Run when the translation is completed, the input parameters are: translation node, original text, translation text, retained elements.`,
  },
  translate_remove_hook: {
    zh: `翻译移除钩子函数`,
    en: `Translate Removed Hook`,
  },
  translate_remove_hook_helper: {
    zh: `翻译移除时运行，入参为： 翻译节点。`,
    en: `Run when translation is removed, the input parameters are: translation node.`,
  },
  english_dict: {
    zh: `英文词典`,
    en: `English Dictionary`,
  },
  api_name: {
    zh: `接口名称`,
    en: `API Name`,
  },
  is_disabled: {
    zh: `是否禁用`,
    en: `Is Disabled`,
  },
  translate_selected: {
    zh: `是否启用划词翻译`,
    en: `If translate selected`,
  },
};
