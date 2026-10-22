import { I18N } from "../../config/i18n";

// Index labels instead of mounted pages: advanced controls and other routes may
// not exist in the DOM yet. Never include user-entered values or credentials.
export const SETTINGS_SEARCH_KEYS = {
  overview: [
    "ui_lang",
    "popup_default_view",
    "if_pre_init",
    "auto_translate_clipboard",
    "fab_click_action",
    "min_translate_length",
    "max_translate_length",
    "num_of_newline_characters",
    "translate_interval",
    "http_timeout",
    "touch_translate_shortcut",
    "context_menus",
    "detected_lang",
    "translate_variants",
    "parse_latex",
    "log_level",
    "check_update",
    "skip_langs",
    "hide_fab_button",
    "fab_half_hide",
    "fab_exception_list",
    "fab_appearance",
    "fab_opacity",
    "fab_size",
    "translate_blacklist",
    "if_clear_cache",
    "clear_all_cache_now",
    "disabled_orilist",
    "disabled_csplist",
    "options_shortcuts",
    "toggle_translate_shortcut",
    "toggle_transonly_shortcut",
    "toggle_style_shortcut",
    "toggle_popup_shortcut",
    "open_setting_shortcut",
  ],
  appearance: [
    "settings_appearance_mode",
    "settings_textarea_grip_style",
    "settings_custom_css",
    "settings_style_library",
    "style_name",
    "style_code",
  ],
  web: [
    "pattern",
    "root_selector",
    "ignore_selector",
    "target_selector",
    "keep_selector",
    "block_selector",
    "translate_alt",
    "translate_service",
    "from_lang",
    "to_lang",
    "auto_scan_page",
    "has_rich_text",
    "has_shadowroot",
    "scan_all_nodes",
    "plain_text_translate",
    "show_only_translations",
    "trans_order",
    "transonly_revert",
    "transonly_revert_delay",
    "split_paragraph",
    "split_length",
    "highlight_words",
    "translate_page_title",
    "translation_element_tag",
    "text_style",
    "wrap_original",
    "original_text_style",
    "terms",
    "ai_terms",
    "terms_style",
    "highlight_style",
    "text_ext_style",
    "selector_style",
    "selector_parent_style",
    "selector_grand_style",
    "translate_start_hook",
    "translate_end_hook",
    "inject_css",
    "inject_js",
    "inject_rules",
    "subscribe_rules",
    "subscribe_url",
  ],
  selection: [
    "selection_translate",
    "selection_skip_langs",
    "trigger_mode",
    "follow_selection",
    "trigger_tranbox_shortcut",
    "single_word_no_trans",
    "english_dict",
    "ai_dict_api",
    "auto_fav_word",
    "use_simple_style",
    "translate_service_multiple",
    "from_lang",
    "to_lang",
    "to_lang2",
    "ai_dict_prompt",
    "english_suggest",
    "tranbtn_position_mode",
    "hide_tran_button",
    "hide_click_away",
    "tranbtn_offset_x",
    "tranbtn_offset_y",
    "tranbox_offset_x",
    "tranbox_offset_y",
    "tranbox_auto_height",
    "tranbox_interact_mode",
    "blacklist",
  ],
  hover: [
    "touch_mode",
    "touch_direction",
    "use_mousehover_translation",
    "trigger_trans_shortcut",
    "mousehover_hold_key",
    "mousehover_display_mode",
    "translate_service",
    "mousehover_hold_button",
    "mousehover_hold_delay",
    "mousehover_hold_scope",
    "mousehover_hold_display",
    "mousehover_hold_suppress_menu",
    "mousehover_hold_revert_on_gesture",
    "mousehover_hold_prevent_click",
    "mousehover_bubble_style",
    "blacklist",
  ],
  input: [
    "use_input_box_translation",
    "trigger_trans_shortcut",
    "shortcut_press_count",
    "input_trans_start_sign",
    "to_lang",
    "show_translation_dot",
    "translate_service",
    "from_lang",
    "combo_timeout",
    "blacklist",
  ],
  subtitle: [
    "toggle_subtitle_translate",
    "settings_subtitle_auto_start",
    "is_bilingual_view",
    "trans_order",
    "translate_service",
    "ai_segmentation",
    "is_skip_ad",
    "is_blur_translation",
    "subtitle_hover_lookup",
    "auto_fav_word",
    "seg_prompt_mode",
    "force_subtitle_retranslate",
    "builtin_sentence_break",
    "ai_enhanced_context",
    "ai_chunk_length",
    "long_sentence_threshold",
    "pre_trans_seconds",
    "throttle_trans_interval",
    "to_lang",
    "show_subtitle_list",
    "subtitle_loading_notification",
    "hide_subtitle_button",
    "remember_subtitle_position",
    "origin_styles",
    "translation_styles",
    "background_styles",
    "font_size",
    "font_color",
    "background_color",
    "opacity",
    "line_height",
    "padding",
    "text_shadow",
    "advanced_css",
  ],
  apis: [
    "is_disabled",
    "is_pinned",
    "api_name",
    "model_list_url",
    "translation_style",
    "use_batch_fetch",
    "use_stream",
    "stream_render_mode",
    "use_context",
    "context_size",
    "translation_prompt",
    "subtitle_prompt",
    "ai_dict_prompt",
    "thinking_mode",
    "thinking_effort",
    "batch_interval",
    "batch_size",
    "batch_length",
    "batch_concurrency",
    "fetch_limit",
    "fetch_interval",
    "http_timeout",
    "trigger_mode",
    "pagescroll_root_margin",
    "api_placeholder",
    "api_placetag",
    "placetag_format",
    "ai_terms",
    "custom_header",
    "custom_body",
    "api_url",
    "api_key",
    "api_model",
    "api_region",
    "api_folder_id",
    "api_temperature",
    "api_max_tokens",
    "api_request_hook",
    "api_response_hook",
  ],
  prompts: ["prompt_name", "system_prompt", "user_prompt"],
  sync: [
    "data_sync_type",
    "data_sync_url",
    "data_sync_user",
    "data_sync_key",
    "data_sync_encrypt_key",
    "sync_now",
  ],
  words: ["export_translation"],
  playground: [
    "playground_merge_single_line_breaks",
    "subtitle_segmentation",
    "terminology_playground",
  ],
  about: [
    "settings_check_updates",
    "settings_project_website",
    "settings_project_details",
  ],
};

// These provider fields already use fixed English labels in the API editor.
export const SETTINGS_SEARCH_LABELS = {
  api_url: "URL",
  api_key: "Key",
  api_model: "Model",
  api_region: "Region",
  api_folder_id: "Folder ID",
  api_temperature: "Temperature (0.0-2.0)",
  api_max_tokens: "Max Tokens (0-1000000)",
  api_request_hook: "Request Hook",
  api_response_hook: "Response Hook",
};

const SEARCH_ALIASES = {
  api_url: "API URL endpoint 接口地址",
  api_key: "API Key 密钥",
  api_model: "模型",
  api_temperature: "温度",
  api_max_tokens: "最大令牌数",
  api_request_hook: "请求钩子",
  api_response_hook: "响应钩子",
  use_batch_fetch: "批量",
  batch_size: "批量",
  batch_interval: "批量",
  batch_length: "批量",
  batch_concurrency: "批量",
};

const OPTION_KEYS = {
  settings_appearance_mode: [
    "settings_theme_light",
    "settings_theme_dark",
    "settings_theme_system",
  ],
  context_menus: [
    "hide_context_menus",
    "simple_context_menus",
    "secondary_context_menus",
  ],
  popup_default_view: ["popup_default_view_page", "popup_default_view_text"],
  touch_mode: ["touch_tap", "touch_swipe"],
  trans_order: ["original_first", "translation_first"],
  mousehover_display_mode: [
    "mousehover_display_bilingual",
    "mousehover_display_bubble",
  ],
  if_clear_cache: ["clear_cache_never", "clear_cache_restart"],
};

export const getSettingsSearchLabel = (key, i18n) =>
  SETTINGS_SEARCH_LABELS[key] || i18n(key);

// Some fields require an enabled feature. Guide users to its controlling
// setting without changing their preferences merely by following a result.
const SEARCH_PREREQUISITES = {
  original_text_style: "wrap_original",
  seg_prompt_mode: "ai_segmentation",
  data_sync_url: "data_sync_type",
  data_sync_user: "data_sync_type",
  mousehover_hold_button: "mousehover_hold_key",
  mousehover_hold_delay: "mousehover_hold_key",
  mousehover_hold_scope: "mousehover_hold_key",
  mousehover_hold_display: "mousehover_hold_key",
  mousehover_hold_suppress_menu: "mousehover_hold_key",
  mousehover_hold_revert_on_gesture: "mousehover_hold_key",
  mousehover_hold_prevent_click: "mousehover_hold_key",
  mousehover_bubble_style: "mousehover_display_mode",
};

export function getSettingsSearchPrerequisite(pathname, key) {
  if (pathname === "/mousehover" && key === "translate_service")
    return "mousehover_display_mode";
  return SEARCH_PREREQUISITES[key] || "";
}

export const SETTINGS_SEARCH_PAGES = {
  "/": "overview",
  "/styles": "appearance",
  "/rules": "web",
  "/tranbox": "selection",
  "/mousehover": "hover",
  "/input": "input",
  "/subtitle": "subtitle",
  "/apis": "apis",
  "/prompts": "prompts",
  "/sync": "sync",
  "/words": "words",
  "/playground": "playground",
  "/about": "about",
};

export function getSettingsSearchTarget(pathname, search) {
  const key = new URLSearchParams(search).get("setting") || "";
  return SETTINGS_SEARCH_KEYS[SETTINGS_SEARCH_PAGES[pathname]]?.includes(key)
    ? key
    : "";
}

const DESCRIPTION_KEYS = {
  follow_selection: "settings_follow_selection_description",
  trigger_tranbox_shortcut: "settings_selection_shortcut_description",
  single_word_no_trans: "settings_single_word_dictionary_description",
  ai_dict_api: "settings_ai_dictionary_description",
  auto_fav_word: "settings_auto_favorite_description",
  use_simple_style: "settings_simple_style_description",
  trigger_trans_shortcut: "trigger_trans_shortcut_help",
  input_trans_start_sign: "input_trans_start_sign_help",
  touch_mode: "touch_help",
  settings_textarea_grip_style: "settings_textarea_grip_style_desc",
  settings_custom_css: "settings_custom_css_description",
  settings_style_library: "settings_style_library_description",
  settings_subtitle_auto_start: "settings_subtitle_auto_start_description",
  is_skip_ad: "settings_skip_ad_description",
  is_blur_translation: "settings_blur_translation_description",
};

export function normalizeSearchText(text, uiLang) {
  const normalized = String(text).normalize("NFKC");
  try {
    return normalized.toLocaleLowerCase(
      uiLang?.replace(/_/g, "-") || undefined
    );
  } catch {
    return normalized.toLocaleLowerCase();
  }
}

export function getSettingsSearchEntries(
  id,
  i18n,
  uiLang,
  { isExt, isAutoTranslateClipboardSupported } = {}
) {
  return (SETTINGS_SEARCH_KEYS[id] || [])
    .filter((key) => {
      if (id !== "overview") return true;
      if (
        isExt === true &&
        [
          "toggle_translate_shortcut",
          "toggle_transonly_shortcut",
          "toggle_style_shortcut",
          "toggle_popup_shortcut",
          "open_setting_shortcut",
        ].includes(key)
      )
        return false;
      if (
        isExt === false &&
        [
          "popup_default_view",
          "if_clear_cache",
          "clear_all_cache_now",
          "disabled_orilist",
          "disabled_csplist",
        ].includes(key)
      )
        return false;
      return (
        key !== "auto_translate_clipboard" ||
        isAutoTranslateClipboardSupported !== false
      );
    })
    .map((key) => {
      const descriptionKeys = [
        `${key}_helper`,
        `${key}_help`,
        DESCRIPTION_KEYS[key],
      ].filter(Boolean);
      const description = descriptionKeys
        .map((item) => i18n(item, ""))
        .filter(Boolean)
        .join(" ");
      const label = getSettingsSearchLabel(key, i18n);
      return {
        key,
        label,
        text: normalizeSearchText(
          [
            label,
            description,
            I18N[key]?.en || "",
            key.replace(/_/g, " "),
            SEARCH_ALIASES[key] || "",
            ...(OPTION_KEYS[key] || []).flatMap((item) => [
              i18n(item, ""),
              I18N[item]?.en || "",
            ]),
            ...descriptionKeys.map((item) => I18N[item]?.en || ""),
          ].join(" "),
          uiLang
        ),
      };
    });
}

export function searchSettingsGroups(groups, query, uiLang) {
  const terms = normalizeSearchText(query.trim(), uiLang)
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map(([id, label, path, Icon, entries]) => {
          const pageText = normalizeSearchText(
            `${group.label} ${label}`,
            uiLang
          );
          const matches = entries.filter((entry) =>
            terms.every((term) => `${pageText} ${entry.text}`.includes(term))
          );
          const pageMatches = terms.every((term) => pageText.includes(term));
          return pageMatches || matches.length
            ? [id, label, path, Icon, matches]
            : null;
        })
        .filter(Boolean),
    }))
    .filter((group) => group.items.length);
}
