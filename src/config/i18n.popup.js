const labels = {
  popup_text_request_failed: [
    "请求失败（{status}）",
    "Request failed ({status})",
    "請求失敗（{status}）",
  ],
  popup_text_auth_failed: [
    "请在设置中检查 API Key",
    "Check the API key in settings",
    "請在設定中檢查 API Key",
  ],
  popup_text_failed: [
    "翻译失败，请重试",
    "Translation failed. Please try again.",
    "翻譯失敗，請重試",
  ],
  popup_text_auto_badge: ["自动", "Auto", "自動"],
  popup_text_source_placeholder: [
    "输入要翻译的文本",
    "Enter text to translate",
    "輸入要翻譯的文字",
  ],
  popup_text_clear: ["清空原文", "Clear source text", "清空原文"],
  popup_text_reload: ["重新翻译", "Translate again", "重新翻譯"],
  popup_text_split_label: [
    "调整原文和译文高度",
    "Adjust source and translation heights",
    "調整原文和譯文高度",
  ],
  popup_text_split_hint: [
    "拖动调整高度，双击恢复；方向键调整",
    "Drag to resize, double-click to reset; use arrow keys to adjust",
    "拖曳調整高度，連按兩下恢復；方向鍵調整",
  ],
  popup_text_service_menu: [
    "翻译服务 · 可多选，结果上下平铺",
    "Translation services · Select multiple to stack results",
    "翻譯服務 · 可多選，結果上下排列",
  ],
  popup_text_service_count: [
    "{count} 个服务",
    "{count} services",
    "{count} 個服務",
  ],
  popup_text_select_service: [
    "选择翻译服务",
    "Choose translation services",
    "選擇翻譯服務",
  ],
  popup_text_no_services: [
    "请选择翻译服务以查看译文",
    "Select a translation service to see results",
    "請選擇翻譯服務以查看譯文",
  ],
  popup_text_result_empty: [
    "译文将在这里显示",
    "Translation will appear here.",
    "譯文將在這裡顯示",
  ],
  popup_no_services: [
    "未启用翻译服务",
    "No translation services enabled",
    "未啟用翻譯服務",
  ],
  popup_auto_detect: ["自动检测", "Auto detect", "自動偵測"],
  popup_global_features: ["全局功能", "Global features", "全域功能"],
  popup_global_feature_scope: [
    "{feature}：对所有网站生效",
    "{feature}: applies to all websites",
    "{feature}：對所有網站生效",
  ],
  popup_global_features_hint: ["全局功能", "Global features", "全域功能"],
  popup_global_toggle_failed: ["失败", "Failed", "失敗"],
  popup_hover_translation: ["悬停翻译", "Hover translation", "懸停翻譯"],
  popup_restore_site: ["恢复启用", "Enable again", "恢復啟用"],
  popup_restore_scope_hint: [
    "从黑名单移除 {domain}",
    "Remove {domain} from the blacklist",
    "從黑名單移除 {domain}",
  ],
  popup_show_original: ["显示原文", "Show original", "顯示原文"],
  popup_translated: ["已翻译", "Translated", "已翻譯"],
  popup_match_scope: ["匹配范围", "Match scope", "符合範圍"],
  popup_match_scope_hint: [
    "规则与黑名单的匹配范围",
    "Rule and blacklist match scope",
    "規則與黑名單的符合範圍",
  ],
  popup_scope_exact: ["仅此域名", "This domain only", "僅此網域"],
  popup_scope_subdomains: [
    "包含所有子域名",
    "Include subdomains",
    "包含所有子網域",
  ],
  popup_site_disabled: [
    "已在此网站停用",
    "Disabled on this site",
    "已在此網站停用",
  ],
  popup_display_mode: ["显示方式", "Display mode", "顯示方式"],
  popup_bilingual: ["双语对照", "Bilingual", "雙語對照"],
  popup_translation_only: ["仅译文", "Translation only", "僅譯文"],
  popup_style: ["样式", "Style", "樣式"],
  popup_save_site: ["保存到本站", "Save for this site", "儲存至本站"],
  popup_save_changes: [
    "保存 {count} 项修改",
    "Save {count} changes",
    "儲存 {count} 項修改",
  ],
  popup_saving: ["保存中…", "Saving…", "儲存中…"],
  popup_saved: ["已保存", "Saved", "已儲存"],
  popup_save_failed: [
    "保存失败 · 重试",
    "Save failed · Retry",
    "儲存失敗 · 重試",
  ],
  popup_save_site_hint: [
    "把当前语言、服务、样式和页面选项保存为 {domain} 的规则",
    "Save languages, service, style and page options for {domain}",
    "將目前語言、服務、樣式和頁面選項儲存為 {domain} 的規則",
  ],
  popup_save_changes_hint: [
    "将保存到 {domain}：{fields}",
    "Save for {domain}: {fields}",
    "將儲存至 {domain}：{fields}",
  ],
  popup_list_separator: ["、", ", ", "、"],
  popup_edit_rule: ["编辑网站规则", "Edit site rule", "編輯網站規則"],
  popup_editor_opening: [
    "正在页面中打开…",
    "Opening in page…",
    "正在頁面中開啟…",
  ],
  popup_editor_failed: [
    "打开失败 · 重试",
    "Open failed · Retry",
    "開啟失敗 · 重試",
  ],
  popup_disable_site: ["在此网站停用", "Disable on this site", "在此網站停用"],
  popup_cache_cleared: ["已清除", "Cleared", "已清除"],
  popup_cache_failed: ["清除失败", "Clear failed", "清除失敗"],
};

// Provide English fallbacks for languages without popup-specific translations.
export const POPUP_I18N = Object.fromEntries(
  Object.entries(labels).map(([key, [zh, en, zh_TW]]) => [
    key,
    { zh, en, zh_TW, ja: en, ko: en, tr: en, vi: en, ru: en },
  ])
);
