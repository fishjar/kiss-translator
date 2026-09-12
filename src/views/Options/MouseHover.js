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
  DEFAULT_MOUSE_HOVER_HOLD_DELAY,
  GLOBAL_KEY,
  OPT_MOUSE_HOVER_DISPLAY_BILINGUAL,
  OPT_MOUSE_HOVER_DISPLAY_BUBBLE,
  OPT_MOUSE_HOVER_TRANS_DISPLAY_BLOCK,
  OPT_MOUSE_HOVER_TRANS_DISPLAY_INLINE,
  OPT_MOUSE_HOVER_TRANS_AREA,
  OPT_MOUSE_HOVER_TRANS_PARAGRAPH,
  OPT_MOUSE_HOVER_TRANS_REGION,
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

  // Enable holding the left mouse button for the primary trigger.
  const handleHoldKeyChange = useCallback(
    (checked) => {
      updateMouseHoverSetting({ mouseHoverKeyHold: checked });
    },
    [updateMouseHoverSetting]
  );

  // Enable holding the left mouse button for the alternative trigger.
  const handleAltHoldKeyChange = useCallback(
    (checked) => {
      updateMouseHoverSetting({ mouseHoverKey2Hold: checked });
    },
    [updateMouseHoverSetting]
  );

  // Match the runtime fallback for invalid or non-positive hold delays.
  const handleHoldDelayChange = useCallback(
    (e) => {
      const value = Number(e.target.value);
      updateMouseHoverSetting({
        mouseHoverHoldDelay:
          Number.isFinite(value) && value > 0
            ? value
            : DEFAULT_MOUSE_HOVER_HOLD_DELAY,
      });
    },
    [updateMouseHoverSetting]
  );

  // Update the translation scope used by either hold trigger.
  const handleTransModeChange = useCallback(
    (e) => {
      updateMouseHoverSetting({ mouseHoverTransMode: e.target.value });
    },
    [updateMouseHoverSetting]
  );

  // Update the translation layout used by either hold trigger.
  const handleTransDisplayChange = useCallback(
    (e) => {
      updateMouseHoverSetting({ mouseHoverTransDisplay: e.target.value });
    },
    [updateMouseHoverSetting]
  );

  // Suppress navigation after translating a link or button with a hold trigger.
  const handlePreventClickChange = useCallback(
    (checked) => {
      updateMouseHoverSetting({ mouseHoverPreventClick: checked });
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
    mouseHoverKeyHold = false,
    mouseHoverKey2Hold = false,
    mouseHoverHoldDelay = DEFAULT_MOUSE_HOVER_HOLD_DELAY,
    mouseHoverTransMode = OPT_MOUSE_HOVER_TRANS_AREA,
    mouseHoverTransDisplay = OPT_MOUSE_HOVER_TRANS_DISPLAY_BLOCK,
    mouseHoverPreventClick = false,
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
      <SettingsSection title={i18n("touch_controls")}>
        <SettingsCard>
          <SettingsRow
            label={i18n("touch_mode")}
            description={i18n("touch_help")}
          >
            <SettingsSegmented
              value={mouseHoverSetting.touchMode || "tap"}
              label={i18n("touch_mode")}
              onChange={(touchMode) => updateMouseHoverSetting({ touchMode })}
              items={[
                { value: "tap", label: i18n("touch_tap") },
                { value: "swipe", label: i18n("touch_swipe") },
              ]}
            />
          </SettingsRow>
          <SettingsRow label={i18n("touch_direction")}>
            <SettingsSegmented
              value={mouseHoverSetting.touchDirection || "right"}
              label={i18n("touch_direction")}
              onChange={(touchDirection) =>
                updateMouseHoverSetting({ touchDirection })
              }
              items={[
                { value: "right", label: i18n("touch_right") },
                { value: "left", label: i18n("touch_left") },
              ]}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={i18n("touch_mouse")}>
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
          <SettingsRow
            label={i18n("mousehover_hold_key")}
            description={i18n("mousehover_hold_key_helper")}
          >
            <SettingsSwitch
              checked={mouseHoverKeyHold}
              label={i18n("mousehover_hold_key")}
              onChange={handleHoldKeyChange}
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

      {(mouseHoverKeyHold || mouseHoverKey2Hold) && (
        <SettingsSection>
          <SettingsCard>
            <SettingsRow
              label={i18n("mousehover_hold_delay")}
              description={i18n("mousehover_hold_delay_helper")}
            >
              <TextField
                hiddenLabel
                size="small"
                variant="filled"
                type="number"
                inputProps={{
                  min: 1,
                  step: 50,
                  "aria-label": i18n("mousehover_hold_delay"),
                }}
                name="mouseHoverHoldDelay"
                value={mouseHoverHoldDelay}
                onChange={handleHoldDelayChange}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("mousehover_hold_scope")}
              description={i18n("mousehover_hold_scope_helper")}
            >
              <TextField
                select
                hiddenLabel
                size="small"
                variant="filled"
                className="kt-settings-select"
                name="mouseHoverTransMode"
                value={mouseHoverTransMode}
                inputProps={{ "aria-label": i18n("mousehover_hold_scope") }}
                onChange={handleTransModeChange}
              >
                <MenuItem value={OPT_MOUSE_HOVER_TRANS_PARAGRAPH}>
                  {i18n("mousehover_hold_scope_paragraph")}
                </MenuItem>
                <MenuItem value={OPT_MOUSE_HOVER_TRANS_REGION}>
                  {i18n("mousehover_hold_scope_region")}
                </MenuItem>
                <MenuItem value={OPT_MOUSE_HOVER_TRANS_AREA}>
                  {i18n("mousehover_hold_scope_area")}
                </MenuItem>
              </TextField>
            </SettingsRow>
            <SettingsRow
              label={i18n("mousehover_hold_display")}
              description={i18n("mousehover_hold_display_helper")}
            >
              <TextField
                select
                hiddenLabel
                size="small"
                variant="filled"
                className="kt-settings-select"
                name="mouseHoverTransDisplay"
                value={mouseHoverTransDisplay}
                inputProps={{ "aria-label": i18n("mousehover_hold_display") }}
                onChange={handleTransDisplayChange}
              >
                <MenuItem value={OPT_MOUSE_HOVER_TRANS_DISPLAY_BLOCK}>
                  {i18n("mousehover_hold_display_block")}
                </MenuItem>
                <MenuItem value={OPT_MOUSE_HOVER_TRANS_DISPLAY_INLINE}>
                  {i18n("mousehover_hold_display_inline")}
                </MenuItem>
              </TextField>
            </SettingsRow>
            <SettingsRow
              label={i18n("mousehover_hold_prevent_click")}
              description={
                mouseHoverPreventClick
                  ? i18n("mousehover_hold_prevent_click_helper")
                  : undefined
              }
            >
              <SettingsSwitch
                checked={mouseHoverPreventClick}
                label={i18n("mousehover_hold_prevent_click")}
                onChange={handlePreventClickChange}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      )}

      <SettingsAdvanced label={i18n("settings_detailed_controls")}>
        <Stack spacing={2} sx={{ py: 1 }}>
          <SettingsCard>
            <SettingsRow
              label={`${i18n("trigger_trans_shortcut")} 2`}
              description={i18n("mousehover_key_help")}
            >
              <ShortcutInput
                compact
                value={mouseHoverKey2}
                onChange={handleAltShortcutInput}
                label={`${i18n("trigger_trans_shortcut")} 2`}
              />
            </SettingsRow>
            <SettingsRow
              label={`${i18n("mousehover_hold_key")} 2`}
              description={i18n("mousehover_hold_key_helper")}
            >
              <SettingsSwitch
                checked={mouseHoverKey2Hold}
                label={`${i18n("mousehover_hold_key")} 2`}
                onChange={handleAltHoldKeyChange}
              />
            </SettingsRow>
          </SettingsCard>
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
