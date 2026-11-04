import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_ONLY,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_PUTRULE,
  MSG_TRANSBOX_TOGGLE,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  OPT_STYLE_FUZZY,
  OPT_STYLE_NONE,
} from "../config";

export const SESSION_MESSAGE = "kiss_page_session";
export const SESSION_PROBE = "kiss_page_probe";
export const SESSION_SNAPSHOT = "kiss_page_snapshot";
export const SESSION_SELECTION = "kiss_page_selection";
export const SESSION_EDITING = "kiss_page_editing";
export const SESSION_FOCUS = "kiss_page_focus";
export const SESSION_ACTIONS = new Set([
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_ONLY,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_PUTRULE,
  MSG_TRANSBOX_TOGGLE,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  SESSION_EDITING,
]);
const overrideKeys = new Set([
  "transOpen",
  "apiSlug",
  "fromLang",
  "toLang",
  "transOnly",
  "textStyle",
]);

export function createPageSession(url, rule, setting, id) {
  return {
    sessionId: id,
    revision: 1,
    url,
    rule: { ...rule },
    overrides: {},
    features: {
      selection: Boolean(setting.tranboxSetting?.transOpen),
      hover: Boolean(setting.mouseHoverSetting?.useMouseHover),
      input: Boolean(setting.inputRule?.transOpen),
      touch: setting.mouseHoverSetting?.touchMode || "off",
    },
    editing: false,
  };
}

export function reducePageSession(state, action, args = {}) {
  const rule = { ...state.rule };
  const features = { ...state.features };
  const overrides = { ...state.overrides };
  let editing = state.editing;
  const enabled = (current) =>
    typeof args.enabled === "boolean" ? args.enabled : !current;
  switch (action) {
    case MSG_TRANS_TOGGLE:
      rule.transOpen = String(enabled(rule.transOpen === "true"));
      break;
    case MSG_TRANS_TOGGLE_ONLY:
      rule.transOnly =
        rule.transOpen !== "true" ? "true" : String(rule.transOnly !== "true");
      rule.transOpen = "true";
      break;
    case MSG_TRANS_TOGGLE_STYLE:
      rule.textStyle =
        rule.textStyle === OPT_STYLE_FUZZY ? OPT_STYLE_NONE : OPT_STYLE_FUZZY;
      break;
    case MSG_TRANS_PUTRULE:
      for (const key of Object.keys(rule)) {
        if (Object.prototype.hasOwnProperty.call(args, key))
          rule[key] = args[key];
      }
      break;
    case MSG_TRANSBOX_TOGGLE:
      features.selection = enabled(features.selection);
      break;
    case MSG_MOUSEHOVER_TOGGLE:
      features.hover = enabled(features.hover);
      break;
    case MSG_TRANSINPUT_TOGGLE:
      features.input = enabled(features.input);
      break;
    case MSG_TOUCH_TRANSLATE_MODE_SET:
      if (["off", "tap", "swipe"].includes(args.mode))
        features.touch = args.mode;
      break;
    case SESSION_EDITING:
      editing = args.enabled === true;
      break;
    default:
      return state;
  }
  for (const key of overrideKeys) {
    if (
      rule[key] !== state.rule[key] ||
      (action === MSG_TRANS_PUTRULE &&
        Object.prototype.hasOwnProperty.call(args, key)) ||
      (action === MSG_TRANS_TOGGLE && key === "transOpen")
    )
      overrides[key] = rule[key];
  }
  return {
    ...state,
    revision: state.revision + 1,
    rule,
    features,
    overrides,
    editing,
  };
}

export function navigatePageSession(state, url, rule) {
  return {
    ...state,
    url,
    editing: false,
    rule: { ...rule, ...state.overrides },
    revision: state.revision + 1,
  };
}

// Only rule/configuration data travels over the userscript page channel.
// API credentials and the complete settings object remain in privileged storage.
export function selectionPayload(args = {}) {
  return {
    text: String(args.text || "").slice(0, 100000),
    context: String(args.context || "").slice(0, 1000),
    selectionSource: args.selectionSource && {
      sentence: String(args.selectionSource.sentence || "").slice(0, 1000),
      text: String(args.text || "").slice(0, 100000),
      url: String(args.selectionSource.url || "").slice(0, 4096),
    },
    close: args.close === true,
    requestId: typeof args.requestId === "string" ? args.requestId : undefined,
  };
}
