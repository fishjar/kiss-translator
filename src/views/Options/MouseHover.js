import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import ShortcutInput from "./ShortcutInput";
import TextField from "@mui/material/TextField";
import { useMouseHoverSetting } from "../../hooks/MouseHover";
import { useApiList } from "../../hooks/Api";
import { useCallback } from "react";
import {
  DEFAULT_MOUSEHOVER_KEY,
  DEFAULT_MOUSE_HOVER_BUBBLE_STYLE,
  GLOBAL_KEY,
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
 * Mouse hover translation settings panel.
 */
export default function MouseHoverSetting() {
  const i18n = useI18n();
  // Global mouse hover translation settings.
  const { mouseHoverSetting, updateMouseHoverSetting } = useMouseHoverSetting();
  const { enabledApis } = useApiList();

  // Update the primary trigger shortcut.
  const handleShortcutInput = useCallback(
    (val) => {
      updateMouseHoverSetting({ mouseHoverKey: val });
    },
    [updateMouseHoverSetting]
  );

  // Update the alternative trigger shortcut.
  const handleAltShortcutInput = useCallback(
    (val) => {
      updateMouseHoverSetting({ mouseHoverKey2: val });
    },
    [updateMouseHoverSetting]
  );

  // Update blacklist patterns used by mouse hover translation.
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

  const handleApiChange = useCallback(
    (e) => {
      updateMouseHoverSetting({ apiSlug: e.target.value });
    },
    [updateMouseHoverSetting]
  );

  // Normalize the current mouse hover settings.
  const {
    useMouseHover = true,
    mouseHoverKey = DEFAULT_MOUSEHOVER_KEY,
    mouseHoverKey2 = [],
    blacklist = "",
    displayMode = OPT_MOUSE_HOVER_DISPLAY_BILINGUAL,
    apiSlug = GLOBAL_KEY,
    bubbleStyle = DEFAULT_MOUSE_HOVER_BUBBLE_STYLE,
  } = mouseHoverSetting;
  const selectedApiSlug = enabledApis.some((api) => api.apiSlug === apiSlug)
    ? apiSlug
    : GLOBAL_KEY;

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
          {displayMode === OPT_MOUSE_HOVER_DISPLAY_BUBBLE && (
            <SettingsRow
              label={i18n("translate_service")}
              description={i18n("mousehover_bubble_api_helper")}
            >
              <TextField
                select
                hiddenLabel
                size="small"
                variant="filled"
                className="kt-settings-select"
                name="apiSlug"
                value={selectedApiSlug}
                inputProps={{ "aria-label": i18n("translate_service") }}
                onChange={handleApiChange}
              >
                <MenuItem value={GLOBAL_KEY}>
                  {i18n("mousehover_follow_page_rule")}
                </MenuItem>
                {enabledApis.map((api) => (
                  <MenuItem key={api.apiSlug} value={api.apiSlug}>
                    {api.apiName}
                  </MenuItem>
                ))}
              </TextField>
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsAdvanced label={i18n("settings_detailed_controls")}>
        <Stack spacing={2} sx={{ py: 1 }}>
          <ShortcutInput
            value={mouseHoverKey2}
            onChange={handleAltShortcutInput}
            label={`${i18n("trigger_trans_shortcut")} 2`}
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
