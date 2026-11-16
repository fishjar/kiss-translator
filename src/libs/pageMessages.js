import {
  GLOBAL_KEY,
  OPT_STYLE_ALL,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_TOGGLE_ONLY,
  MSG_POPUP_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_HOVERNODE_TOGGLE,
  MSG_INPUT_TRANSLATE,
  MSG_OPEN_TRANBOX,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_TOUCH_TRANSLATE_STATE,
  MSG_TRANS_PUTRULE,
} from "../config";

const externalActions = new Set([
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANS_TOGGLE_ONLY,
  MSG_POPUP_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_HOVERNODE_TOGGLE,
  MSG_INPUT_TRANSLATE,
  MSG_OPEN_TRANBOX,
]);
const frameActions = new Set([
  ...externalActions,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_TOUCH_TRANSLATE_STATE,
  MSG_TRANS_PUTRULE,
]);
const ruleFields = new Set([
  "fromLang",
  "toLang",
  "apiSlug",
  "textStyle",
  "transOnly",
  "autoScan",
  "scanAll",
  "hasRichText",
  "isPlainText",
]);
const toggleActions = new Set([
  MSG_TRANS_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
]);
const isObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

// Project trusted updates before broadcasting; reject unknown inbound fields.
export function frameRulePatch(rule, setting, project = false) {
  if (!isObject(rule)) return;
  const patch = {};
  for (const name of Object.keys(rule)) {
    if (!ruleFields.has(name)) {
      if (project) continue;
      return;
    }
    const value = rule[name];
    let valid = typeof value === "string";
    if (name === "apiSlug") {
      valid &&=
        value === GLOBAL_KEY ||
        setting.transApis?.some(
          (api) => api.apiSlug === value && !api.isDisabled
        );
    } else if (name === "textStyle") {
      valid &&=
        value === GLOBAL_KEY ||
        OPT_STYLE_ALL.includes(value) ||
        setting.customStyles?.some((style) => style.styleSlug === value);
    } else if (!["fromLang", "toLang"].includes(name)) {
      valid =
        typeof value === "boolean" ||
        ["true", "false", GLOBAL_KEY].includes(value);
    }
    if (!valid) return;
    patch[name] = value;
  }
  return Object.keys(patch).length ? patch : undefined;
}

// Never pass page-owned objects through to privileged action dispatch.
export function readPageMessage(raw, isFrame, setting) {
  if (!isObject(raw)) return;
  const action = raw.action;
  if (!(isFrame ? frameActions : externalActions).has(action)) return;
  let args;
  if (action === MSG_TRANS_PUTRULE) {
    args = frameRulePatch(raw.args, setting);
    if (!args) return;
  } else if (action === MSG_TOUCH_TRANSLATE_MODE_SET) {
    if (raw.args?.mode !== "off") return;
    args = { mode: "off" };
  } else if (toggleActions.has(action)) {
    const input = raw.args;
    if (input !== undefined) {
      if (!isObject(input)) return;
      const enabled = input.enabled;
      if (enabled !== undefined) {
        if (typeof enabled !== "boolean") return;
        args = { enabled };
      }
    }
  } else if (action === MSG_OPEN_TRANBOX) {
    const input = raw.args;
    if (input !== undefined) {
      if (!isObject(input)) return;
      const text = input.text;
      if (text !== undefined) {
        if (typeof text !== "string") return;
        args = { text };
      }
    }
  }
  return { action, args };
}
