import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  OPT_INPUT_TRANS_SIGNS,
  OPT_INPUT_DOT_DISABLE,
  OPT_INPUT_DOT_MOBILE,
  OPT_INPUT_DOT_ALWAYS,
} from "../../config";
import ShortcutInput from "./ShortcutInput";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useInputRule } from "../../hooks/InputRule";
import { useCallback } from "react";
import Grid from "@mui/material/Grid";
import { useApiList } from "../../hooks/Api";
import ValidationInput from "../../hooks/ValidationInput";

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

  return (
    <Box>
      <Stack spacing={3}>
        {/* 开关：是否启用输入框翻译功能 */}
        <FormControlLabel
          control={
            <Switch
              size="small"
              name="transOpen"
              checked={transOpen}
              onChange={() => {
                updateInputRule({ transOpen: !transOpen });
              }}
            />
          }
          label={i18n("use_input_box_translation")}
          sx={{ width: "fit-content" }}
        />

        {/* 翻译引擎、源与目标语言、触发结束标点选择网格区 */}
        <Box>
          <Grid container spacing={2} columns={12}>
            {/* 首选翻译引擎服务商 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="apiSlug"
                value={apiSlug}
                label={i18n("translate_service")}
                onChange={handleChange}
              >
                {enabledApis.map((api) => (
                  <MenuItem key={api.apiSlug} value={api.apiSlug}>
                    {api.apiName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 输入源语言 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="fromLang"
                value={fromLang}
                label={i18n("from_lang")}
                onChange={handleChange}
              >
                {OPT_LANGS_FROM.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 翻译出的目标语言 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="toLang"
                value={toLang}
                label={i18n("to_lang")}
                onChange={handleChange}
              >
                {OPT_LANGS_TO.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 结束触发翻译的符号标点 (如打完字后在尾部加上三个问号/斜杠/空格等字符直接触发翻译并自动消除标点) */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="transSign"
                value={transSign}
                label={i18n("input_trans_start_sign")}
                onChange={handleChange}
                helperText={i18n("input_trans_start_sign_help")}
              >
                <MenuItem value={""}>{i18n("style_none")}</MenuItem>
                {OPT_INPUT_TRANS_SIGNS.map((item) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </Box>

        {/* 触发快捷组合键、按击次数限制、连击判定超时、查词浮球按钮显示状态网格区 */}
        <Box>
          <Grid container spacing={2} columns={12}>
            {/* 触发输入翻译的键盘快捷键 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ShortcutInput
                value={triggerShortcut}
                onChange={handleShortcutInput}
                label={i18n("trigger_trans_shortcut")}
                helperText={i18n("trigger_trans_shortcut_help")}
              />
            </Grid>
            {/* 需要连续按下几次快捷键触发翻译 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="triggerCount"
                value={triggerCount}
                label={i18n("shortcut_press_count")}
                onChange={handleChange}
              >
                {[1, 2, 3, 4, 5].map((val) => (
                  <MenuItem key={val} value={val}>
                    {val}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 连击组合键判定超时阈值 (ms) */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("combo_timeout")}
                type="number"
                name="triggerTime"
                value={triggerTime}
                onChange={handleChange}
                min={10}
                max={1000}
              />
            </Grid>
            {/* 移动端或全局是否在聚焦输入框时显示右下角翻译悬浮球点 (Dot) 触发图标 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="showDot"
                value={showDot || OPT_INPUT_DOT_MOBILE}
                label={i18n("show_translation_dot")}
                onChange={handleChange}
              >
                <MenuItem value={OPT_INPUT_DOT_MOBILE}>
                  {i18n("show_dot_mobile")}
                </MenuItem>
                <MenuItem value={OPT_INPUT_DOT_ALWAYS}>
                  {i18n("show_dot_always")}
                </MenuItem>
                <MenuItem value={OPT_INPUT_DOT_DISABLE}>
                  {i18n("show_dot_disable")}
                </MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Box>

        {/* 输入框翻译不生效的黑名单域名及正则规则列表 */}
        <TextField
          size="small"
          label={i18n("blacklist")}
          helperText={i18n("pattern_helper")}
          name="blacklist"
          value={blacklist}
          onChange={handleChange}
          maxRows={10}
          multiline
        />
      </Stack>
    </Box>
  );
}
