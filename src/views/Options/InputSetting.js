import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  OPT_INPUT_TRANS_SIGNS,
  OPT_INPUT_DOT_DISABLE,
  OPT_INPUT_DOT_MOBILE,
  OPT_INPUT_DOT_ALWAYS,
  DEFAULT_INPUT_RULE,
} from "../../config";
import ShortcutInput from "./ShortcutInput";
import { useInputRule } from "../../hooks/InputRule";
import { useCallback } from "react";
import { useApiList } from "../../hooks/Api";
import { limitNumber } from "../../libs/utils";
import {
  SettingsAdvanced,
  SettingsCard,
  SettingsRange,
  SettingsRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSelect,
  SettingsSwitch,
} from "./SettingsCard";

const MIN_TRIGGER_TIME = 10;
const MAX_TRIGGER_TIME = 1000;

export function normalizeTriggerTime(value) {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_INPUT_RULE.triggerTime;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_INPUT_RULE.triggerTime;
  }

  return limitNumber(numericValue, MIN_TRIGGER_TIME, MAX_TRIGGER_TIME);
}

/**
 * 网页输入框快捷输入翻译设置页面 (InputSetting)
 * 用户在输入框中输入指定文本后，通过快捷键/特殊结束标点自动在输入框内将源文本翻译成目标语言
 */
export default function InputSetting() {
  const i18n = useI18n();
  // 输入查词规则 Hook 状态
  const { inputRule, updateInputRule } = useInputRule();
  // 全局启用的 API 服务商列表
  const { enabledApis } = useApiList();

  // 通用表单更改提交方法
  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    updateInputRule({
      [name]: value,
    });
  };

  // 触发快捷键组合修改回调
  const handleShortcutInput = useCallback(
    (val) => {
      updateInputRule({ triggerShortcut: val });
    },
    [updateInputRule]
  );

  // 解构当前输入查词翻译的各项具体设置
  const {
    transOpen,
    apiSlug,
    fromLang,
    toLang,
    triggerShortcut,
    triggerCount,
    triggerTime,
    transSign,
    showDot,
    blacklist = "",
  } = inputRule;
  const normalizedTriggerTime = normalizeTriggerTime(triggerTime);

  return (
    <Box>
      <SettingsSection>
        <SettingsCard>
          <SettingsRow label={i18n("use_input_box_translation")}>
            <SettingsSwitch
              checked={transOpen}
              label={i18n("use_input_box_translation")}
              onChange={(checked) => updateInputRule({ transOpen: checked })}
            />
          </SettingsRow>
          <SettingsRow
            label={i18n("trigger_trans_shortcut")}
            description={i18n("trigger_trans_shortcut_help")}
          >
            <ShortcutInput
              compact
              value={triggerShortcut}
              onChange={handleShortcutInput}
              label={i18n("trigger_trans_shortcut")}
            />
          </SettingsRow>
          <SettingsRow label={i18n("shortcut_press_count")}>
            <SettingsSegmented
              value={Number(triggerCount)}
              label={i18n("shortcut_press_count")}
              onChange={(value) => updateInputRule({ triggerCount: value })}
              items={[1, 2, 3, 4, 5].map((value) => ({
                value,
                label: `${value}×`,
              }))}
            />
          </SettingsRow>
          <SettingsRow
            label={i18n("input_trans_start_sign")}
            description={i18n("input_trans_start_sign_help")}
          >
            <SettingsSelect
              value={transSign}
              label={i18n("input_trans_start_sign")}
              onChange={(value) => updateInputRule({ transSign: value })}
              options={[
                { value: "", label: i18n("style_none") },
                ...OPT_INPUT_TRANS_SIGNS.map((value) => ({
                  value,
                  label: value,
                })),
              ]}
            />
          </SettingsRow>
          <SettingsRow label={i18n("to_lang")}>
            <SettingsSelect
              value={toLang}
              label={i18n("to_lang")}
              onChange={(value) => updateInputRule({ toLang: value })}
              options={OPT_LANGS_TO}
            />
          </SettingsRow>
          <SettingsRow label={i18n("show_translation_dot")}>
            <SettingsSegmented
              value={showDot || OPT_INPUT_DOT_MOBILE}
              label={i18n("show_translation_dot")}
              onChange={(value) => updateInputRule({ showDot: value })}
              items={[
                {
                  value: OPT_INPUT_DOT_DISABLE,
                  label: i18n("show_dot_disable"),
                },
                {
                  value: OPT_INPUT_DOT_MOBILE,
                  label: i18n("show_dot_mobile"),
                },
                {
                  value: OPT_INPUT_DOT_ALWAYS,
                  label: i18n("show_dot_always"),
                },
              ]}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsAdvanced rows label={i18n("settings_detailed_controls")}>
        <SettingsRow label={i18n("translate_service")}>
          <SettingsSelect
            value={apiSlug}
            label={i18n("translate_service")}
            onChange={(value) => updateInputRule({ apiSlug: value })}
            options={enabledApis.map((api) => ({
              value: api.apiSlug,
              label: api.apiName,
            }))}
          />
        </SettingsRow>
        <SettingsRow label={i18n("from_lang")}>
          <SettingsSelect
            value={fromLang}
            label={i18n("from_lang")}
            onChange={(value) => updateInputRule({ fromLang: value })}
            options={OPT_LANGS_FROM}
          />
        </SettingsRow>
        <SettingsRow label={i18n("combo_timeout")}>
          <SettingsRange
            value={normalizedTriggerTime}
            min={MIN_TRIGGER_TIME}
            max={MAX_TRIGGER_TIME}
            step={1}
            unit=" ms"
            label={i18n("combo_timeout")}
            onChange={(value) => updateInputRule({ triggerTime: value })}
          />
        </SettingsRow>
      </SettingsAdvanced>

      <SettingsSection title={i18n("blacklist")}>
        <TextField
          fullWidth
          size="small"
          label={i18n("blacklist")}
          helperText={i18n("pattern_helper")}
          name="blacklist"
          value={blacklist}
          onChange={handleChange}
          maxRows={10}
          multiline
        />
      </SettingsSection>
    </Box>
  );
}
