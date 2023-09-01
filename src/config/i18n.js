export const UI_LANGS = [
  ["en", "English"],
  ["zh", "中文"],
];

export const I18N = {
  app_name: {
    zh: `简约翻译`,
    en: `KISS Translator`,
  },
  translate: {
    zh: `翻译`,
    en: `Translate`,
  },
  translate_alt: {
    zh: `翻译 (Alt+Q)`,
    en: `Translate (Alt+Q)`,
  },
  basic_setting: {
    zh: `基本设置`,
    en: `Basic Setting`,
  },
  rules_setting: {
    zh: `规则设置`,
    en: `Rules Setting`,
  },
  sync_setting: {
    zh: `同步设置`,
    en: `Sync Setting`,
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
    zh: `最大请求数量 (1-100)`,
    en: `Maximum Number Of Request (1-100)`,
  },
  fetch_interval: {
    zh: `请求间隔时间 (0-5000ms)`,
    en: `Request Interval (0-5000ms)`,
  },
  min_translate_length: {
    zh: `最小翻译长度 (1-100)`,
    en: `Min Translate Length (1-100)`,
  },
  max_translate_length: {
    zh: `最大翻译长度 (100-10000)`,
    en: `Max Translate Length (100-10000)`,
  },
  num_of_newline_characters: {
    zh: `换行字符数 (1-1000)`,
    en: `Number of Newline Characters (1-1000)`,
  },
  translate_service: {
    zh: `翻译服务`,
    en: `Translate Service`,
  },
  from_lang: {
    zh: `原文语言`,
    en: `Source Language`,
  },
  to_lang: {
    zh: `目标语言`,
    en: `Target Language`,
  },
  text_style: {
    zh: `文字样式`,
    en: `Text Style`,
  },
  text_style_alt: {
    zh: `文字样式 (Alt+C)`,
    en: `Text Style (Alt+C)`,
  },
  bg_color: {
    zh: `样式颜色`,
    en: `Style Color`,
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
    en: `Personal Rules`,
  },
  subscribe_rules: {
    zh: `订阅规则`,
    en: `Subscribe Rules`,
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
  sync_warn: {
    zh: `如果服务器存在其他客户端同步的数据，第一次同步将直接覆盖本地配置，后面则根据修改时间，新的覆盖旧的。`,
    en: `If the server has data synchronized by other clients, the first synchronization will directly overwrite the local configuration, and later, according to the modification time, the new one will overwrite the old one.`,
  },
  about_sync_api: {
    zh: `查看关于数据同步接口部署`,
    en: `View About Data Synchronization Interface Deployment`,
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
  diy_style: {
    zh: `自定义样式`,
    en: `Custom Style`,
  },
  diy_style_helper: {
    zh: `遵循“styled-components”的语法`,
    en: `Follow the syntax of "styled-components"`,
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
    zh: `1、支持星号(*)通配符。2、多个URL支持英文逗号“,”分隔。`,
    en: `1. The asterisk (*) wildcard is supported. 2. Multiple URLs can be separated by English commas ",".`,
  },
  selector_helper: {
    zh: `1、遵循CSS选择器语法。2、留空表示采用全局设置。3、多个CSS选择器之间用“;”隔开。4、“shadow root”选择器和内部选择器用“>>>”隔开。`,
    en: `1. Follow CSS selector syntax. 2. Leave blank to adopt the global setting. 3. Separate multiple CSS selectors with ";". 4. The "shadow root" selector and the internal selector are separated by ">>>".`,
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
  import: {
    zh: `导入`,
    en: `Import`,
  },
  export: {
    zh: `导出`,
    en: `Export`,
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
  clear_cache: {
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
  data_sync_url: {
    zh: `数据同步接口`,
    en: `Data Sync API`,
  },
  data_sync_key: {
    zh: `数据同步密钥`,
    en: `Data Sync Key`,
  },
  data_sync_test: {
    zh: `数据同步测试`,
    en: `Data Sync Test`,
  },
  data_sync_success: {
    zh: `数据同步成功！`,
    en: `Data Sync Success`,
  },
  data_sync_error: {
    zh: `数据同步失败！`,
    en: `Data Sync Error`,
  },
  error_got_some_wrong: {
    zh: `抱歉，出错了！`,
    en: `Sorry, something went wrong!`,
  },
  error_sync_setting: {
    zh: `您的同步设置未填写，无法在线分享。`,
    en: `Your sync settings are missing and cannot be shared online.`,
  },
};
