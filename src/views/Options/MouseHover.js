import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import ShortcutInput from "./ShortcutInput";
import TextField from "@mui/material/TextField";
import { useMouseHoverSetting } from "../../hooks/MouseHover";
import { useCallback } from "react";
import {
  DEFAULT_MOUSEHOVER_KEY,
  DEFAULT_MOUSE_HOVER_BUBBLE_STYLE,
  OPT_MOUSE_HOVER_DISPLAY_BILINGUAL,
  OPT_MOUSE_HOVER_DISPLAY_BUBBLE,
} from "../../config";
import {
  SettingsAdvanced,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSwitch,
} from "./SettingsCard";

/**
 * 鼠标悬停翻译 (MouseHover) 设置面板组件
 */
export default function MouseHoverSetting() {
  const i18n = useI18n();
  // 全局鼠标悬浮翻译配置 Hook
  const { mouseHoverSetting, updateMouseHoverSetting } = useMouseHoverSetting();

  // 首选触发快捷键变化时的处理回调
  const handleShortcutInput = useCallback(
    (val) => {
      updateMouseHoverSetting({ mouseHoverKey: val });
    },
    [updateMouseHoverSetting]
  );

  // 备选触发快捷键变化时的处理回调
  const handleAltShortcutInput = useCallback(
    (val) => {
      updateMouseHoverSetting({ mouseHoverKey2: val });
    },
    [updateMouseHoverSetting]
  );

  // 悬浮查词黑名单 (正则/字符串规则匹配) 文本变化回调
  const handleBlacklistChange = useCallback(
    (e) => {
      const { value } = e.target;
      updateMouseHoverSetting({ blacklist: value });
    },
    [updateMouseHoverSetting]
  );

  const handleBubbleStyleChange = useCallback(
    (e) => {
      updateMouseHoverSetting({ bubbleStyle: e.target.value });
    },
    [updateMouseHoverSetting]
  );

  // 解构当前鼠标悬停状态配置
  const {
    useMouseHover = true,
    mouseHoverKey = DEFAULT_MOUSEHOVER_KEY,
    mouseHoverKey2 = [],
    blacklist = "",
    displayMode = OPT_MOUSE_HOVER_DISPLAY_BILINGUAL,
    bubbleStyle = DEFAULT_MOUSE_HOVER_BUBBLE_STYLE,
  } = mouseHoverSetting;

  return (
    <Box>
      <SettingsSection>
        <SettingsCard>
          <SettingsRow label={i18n("use_mousehover_translation")}>
            <SettingsSwitch
              checked={useMouseHover}
              label={i18n("use_mousehover_translation")}
              onChange={(checked) =>
                updateMouseHoverSetting({ useMouseHover: checked })
              }
            />
          </SettingsRow>
          <SettingsRow
            label={i18n("trigger_trans_shortcut")}
            description={i18n("mousehover_key_help")}
          >
            <ShortcutInput
              compact
              value={mouseHoverKey}
              onChange={handleShortcutInput}
              label={i18n("trigger_trans_shortcut")}
            />
          </SettingsRow>
          <SettingsRow label={i18n("mousehover_display_mode")}>
            <SettingsSegmented
              value={displayMode}
              label={i18n("mousehover_display_mode")}
              onChange={(value) =>
                updateMouseHoverSetting({ displayMode: value })
              }
              items={[
                {
                  value: OPT_MOUSE_HOVER_DISPLAY_BILINGUAL,
                  label: i18n("mousehover_display_bilingual"),
                },
                {
                  value: OPT_MOUSE_HOVER_DISPLAY_BUBBLE,
                  label: i18n("mousehover_display_bubble"),
                },
              ]}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsAdvanced label={i18n("settings_detailed_controls")}>
        <Stack spacing={2} sx={{ py: 1 }}>
          <ShortcutInput
            value={mouseHoverKey2}
            onChange={handleAltShortcutInput}
            label={`${i18n("trigger_trans_shortcut")} (Alternative)`}
            helperText={i18n("mousehover_key_help")}
          />
          {displayMode === OPT_MOUSE_HOVER_DISPLAY_BUBBLE && (
            <TextField
              size="small"
              label={i18n("mousehover_bubble_style")}
              helperText={i18n("mousehover_bubble_style_helper")}
              name="bubbleStyle"
              value={bubbleStyle}
              onChange={handleBubbleStyleChange}
              maxRows={12}
              multiline
            />
          )}
        </Stack>
      </SettingsAdvanced>

      <SettingsSection title={i18n("blacklist")}>
        <TextField
          fullWidth
          size="small"
          label={i18n("blacklist")}
          helperText={i18n("pattern_helper")}
          name="blacklist"
          value={blacklist}
          onChange={handleBlacklistChange}
          maxRows={10}
          multiline
        />
      </SettingsSection>
    </Box>
  );
}
