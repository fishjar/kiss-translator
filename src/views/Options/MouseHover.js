import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import ShortcutInput from "./ShortcutInput";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Switch from "@mui/material/Switch";
import { useMouseHoverSetting } from "../../hooks/MouseHover";
import { useCallback } from "react";
import Grid from "@mui/material/Grid";
import { DEFAULT_MOUSEHOVER_KEY } from "../../config";

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

  // 解构当前鼠标悬停状态配置
  const {
    useMouseHover = true,
    mouseHoverKey = DEFAULT_MOUSEHOVER_KEY,
    mouseHoverKey2 = [],
    blacklist = "",
  } = mouseHoverSetting;

  return (
    <Box>
      <Stack spacing={3}>
        {/* 开关：是否启用鼠标悬停查词翻译功能 */}
        <FormControlLabel
          control={
            <Switch
              size="small"
              name="useMouseHover"
              checked={useMouseHover}
              onChange={() => {
                updateMouseHoverSetting({ useMouseHover: !useMouseHover });
              }}
            />
          }
          label={i18n("use_mousehover_translation")}
          sx={{ width: "fit-content" }}
        />

        {/* 触发按键配置格栅区域 */}
        <Box>
          <Grid container spacing={2} columns={12}>
            {/* 首选悬浮快捷键录入框 */}
            <Grid item xs={12} sm={12} md={4} lg={4}>
              <ShortcutInput
                value={mouseHoverKey}
                onChange={handleShortcutInput}
                label={i18n("trigger_trans_shortcut")}
                helperText={i18n("mousehover_key_help")}
              />
            </Grid>
            {/* 备用悬浮快捷键录入框 */}
            <Grid item xs={12} sm={12} md={4} lg={4}>
              <ShortcutInput
                value={mouseHoverKey2}
                onChange={handleAltShortcutInput}
                label={`${i18n("trigger_trans_shortcut")} (Alternative)`}
                helperText={i18n("mousehover_key_help")}
              />
            </Grid>
          </Grid>
        </Box>

        {/* 黑名单域名/规则排除输入框 (一行一条规则) */}
        <TextField
          size="small"
          label={i18n("blacklist")}
          helperText={i18n("pattern_helper")}
          name="blacklist"
          value={blacklist}
          onChange={handleBlacklistChange}
          maxRows={10}
          multiline
        />
      </Stack>
    </Box>
  );
}
