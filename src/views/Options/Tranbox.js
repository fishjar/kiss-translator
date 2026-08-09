import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  OPT_TRANBOX_TRIGGER_CLICK,
  OPT_TRANBOX_TRIGGER_ALL,
  OPT_TRANBOX_BTN_POSITION_FIXED,
  OPT_TRANBOX_BTN_POSITION_ALL,
  OPT_TRANBOX_INTERACT_CLICK,
  OPT_TRANBOX_INTERACT_DBLCLICK,
  OPT_DICT_BING,
  OPT_DICT_ALL,
  OPT_SUG_ALL,
  OPT_SUG_YOUDAO,
  PROMPT_MODE_FOLLOW_API,
  getDictionaryPromptOptions,
  getPromptDisplayName,
  OPT_SKIPLANGS_SELECTION,
} from "../../config";
import ShortcutInput from "./ShortcutInput";
import { useCallback, useMemo } from "react";
import { limitNumber } from "../../libs/utils";
import { useTranbox } from "../../hooks/Tranbox";
import { isExt } from "../../libs/client";
import { useApiList } from "../../hooks/Api";
import ValidationInput from "../../hooks/ValidationInput";
import { usePromptList } from "../../hooks/Prompt";
import { useOverviewShortcuts } from "../../hooks/Commands";
import {
  SettingsAdvanced,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSelect,
  SettingsSwitch,
  ShortcutKeys,
} from "./SettingsCard";

/**
 * 划词翻译框 (Tranbox) 样式与交互配置面板组件
 */
export default function Tranbox() {
  const i18n = useI18n();
  // 查词翻译框配置管理 Hook
  const { tranboxSetting, updateTranbox } = useTranbox();
  const shortcutMap = useOverviewShortcuts({ tranboxSetting });
  // 启用的 API 引擎
  // AI 词典只能调用大模型接口，因此这里额外读取已启用的 AI API 列表。
  const { enabledApis, aiEnabledApis } = useApiList();
  const { prompts } = usePromptList();
  // 仅展示词典分类提示词，避免误选翻译或字幕断句提示词。
  const dictionaryPromptOptions = useMemo(
    () => getDictionaryPromptOptions(prompts),
    [prompts]
  );

  // 基础表单输入值变动处理
  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    // 特殊处理：限制小按钮与翻译框偏移量的安全输入界限在 [-200, 200] 像素内以防 UI 飞出视区
    switch (name) {
      case "btnOffsetX":
      case "btnOffsetY":
      case "boxOffsetX":
      case "boxOffsetY":
        value = limitNumber(value, -200, 200);
        break;
      default:
    }
    updateTranbox({
      [name]: value,
    });
  };

  // 快捷键组合变更处理回调
  const handleShortcutInput = useCallback(
    (val) => {
      updateTranbox({ tranboxShortcut: val });
    },
    [updateTranbox]
  );

  // 解构当前划词翻译配置
  const {
    transOpen,
    apiSlugs,
    singleWordNoTrans = false,
    autoFavWord = false,
    fromLang,
    toLang,
    toLang2 = "en",
    tranboxShortcut,
    btnOffsetX,
    btnOffsetY,
    boxOffsetX = 0,
    boxOffsetY = 10,
    hideTranBtn = false,
    hideClickAway = false,
    simpleStyle = false,
    followSelection = false,
    autoHeight = false,
    triggerMode = OPT_TRANBOX_TRIGGER_CLICK,
    tranboxInteractMode = "-",
    btnPositionMode = OPT_TRANBOX_BTN_POSITION_FIXED,
    enDict = OPT_DICT_BING,
    enSug = OPT_SUG_YOUDAO,
    aiDictApiSlug = "-",
    aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
    blacklist = "",
    skipLangs = [],
  } = tranboxSetting;

  return (
    <Box>
      <Stack spacing={3}>
        <SettingsSection title={i18n("settings_trigger_group")}>
          <SettingsCard>
            <SettingsRow label={i18n("toggle_selection_translate")}>
              <SettingsSwitch
                checked={transOpen}
                label={i18n("toggle_selection_translate")}
                onChange={(checked) => updateTranbox({ transOpen: checked })}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("selection_skip_langs")}
              description={i18n("selection_skip_langs_helper")}
            >
              <SettingsSelect
                multiple
                value={skipLangs}
                label={i18n("selection_skip_langs")}
                onChange={(value) => updateTranbox({ skipLangs: value })}
                options={OPT_SKIPLANGS_SELECTION}
              />
            </SettingsRow>
            <SettingsRow label={i18n("trigger_mode")}>
              <SettingsSegmented
                className="kt-settings-segmented--trigger"
                value={triggerMode}
                label={i18n("trigger_mode")}
                onChange={(value) => updateTranbox({ triggerMode: value })}
                items={OPT_TRANBOX_TRIGGER_ALL.map((value) => ({
                  value,
                  label: i18n(`trigger_${value}`),
                }))}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("follow_selection")}
              description={i18n("settings_follow_selection_description")}
            >
              <SettingsSwitch
                checked={followSelection}
                label={i18n("follow_selection")}
                onChange={(checked) =>
                  updateTranbox({ followSelection: checked })
                }
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("trigger_tranbox_shortcut")}
              description={i18n("settings_selection_shortcut_description")}
            >
              {isExt ? (
                <ShortcutKeys keys={shortcutMap.selection} />
              ) : (
                <ShortcutInput
                  compact
                  value={tranboxShortcut}
                  onChange={handleShortcutInput}
                  label={i18n("trigger_tranbox_shortcut")}
                />
              )}
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title={i18n("dictionary")}>
          <SettingsCard>
            <SettingsRow
              label={i18n("single_word_no_trans")}
              description={i18n("settings_single_word_dictionary_description")}
            >
              <SettingsSwitch
                checked={singleWordNoTrans}
                label={i18n("single_word_no_trans")}
                onChange={(checked) =>
                  updateTranbox({ singleWordNoTrans: checked })
                }
              />
            </SettingsRow>
            <SettingsRow label={i18n("english_dict")}>
              <SettingsSelect
                value={enDict}
                label={i18n("english_dict")}
                onChange={(value) => updateTranbox({ enDict: value })}
                options={[
                  { value: "-", label: i18n("disable") },
                  ...OPT_DICT_ALL.map((value) => ({ value, label: value })),
                ]}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("ai_dict_api", "AI Dictionary API")}
              description={i18n("settings_ai_dictionary_description")}
            >
              <SettingsSelect
                value={aiDictApiSlug}
                label={i18n("ai_dict_api", "AI Dictionary API")}
                onChange={(value) => updateTranbox({ aiDictApiSlug: value })}
                options={[
                  { value: "-", label: i18n("disable") },
                  ...aiEnabledApis.map((api) => ({
                    value: api.apiSlug,
                    label: api.apiName,
                  })),
                ]}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("auto_fav_word")}
              description={i18n("settings_auto_favorite_description")}
            >
              <SettingsSwitch
                checked={autoFavWord}
                label={i18n("auto_fav_word")}
                onChange={(checked) => updateTranbox({ autoFavWord: checked })}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title={i18n("settings_appearance_group")}>
          <SettingsCard>
            <SettingsRow
              label={i18n("use_simple_style")}
              description={i18n("settings_simple_style_description")}
            >
              <SettingsSwitch
                checked={simpleStyle}
                label={i18n("use_simple_style")}
                onChange={(checked) => updateTranbox({ simpleStyle: checked })}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsAdvanced label={i18n("settings_detailed_controls")}>
          {/* 各项具体参数网格配置区 */}
          <Box>
            <Grid container spacing={2} columns={12}>
              {/* 划词翻译框中支持多选并存展示的并行翻译服务 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="apiSlugs"
                  value={apiSlugs}
                  label={i18n("translate_service_multiple")}
                  onChange={handleChange}
                  SelectProps={{
                    multiple: true,
                  }}
                >
                  {enabledApis.map((api) => (
                    <MenuItem key={api.apiSlug} value={api.apiSlug}>
                      {api.apiName}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {/* 默认源语言 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
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
              {/* 首选翻译出的目标语言 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
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
              {/* 次选目标语言 (例如：如果划词内容本身就是首选语言，则翻译为次选语言) */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="toLang2"
                  value={toLang2}
                  label={i18n("to_lang2")}
                  helperText={i18n("to_lang2_helper")}
                  onChange={handleChange}
                >
                  <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                  {OPT_LANGS_TO.map(([lang, name]) => (
                    <MenuItem key={lang} value={lang}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* AI 词典提示词来源：跟随接口默认配置，或指定全局词典提示词。 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="aiDictPromptSlug"
                  value={aiDictPromptSlug}
                  label={i18n("ai_dict_prompt", "AI词典提示词")}
                  onChange={handleChange}
                >
                  <MenuItem value={PROMPT_MODE_FOLLOW_API}>
                    {i18n("follow_api_prompt", "接口默认")}
                  </MenuItem>
                  {dictionaryPromptOptions.map((prompt) => (
                    <MenuItem value={prompt.slug} key={prompt.slug}>
                      {getPromptDisplayName(prompt, i18n)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="enSug"
                  value={enSug}
                  label={i18n("english_suggest")}
                  onChange={handleChange}
                >
                  <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                  {OPT_SUG_ALL.map((item) => (
                    <MenuItem value={item} key={item}>
                      {item}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {/* 划词后弹出按钮的定位模式：沿用选区右下角，或跟随鼠标/触摸结束位置 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="btnPositionMode"
                  value={btnPositionMode}
                  label={i18n("tranbtn_position_mode")}
                  onChange={handleChange}
                >
                  {OPT_TRANBOX_BTN_POSITION_ALL.map((item) => (
                    <MenuItem key={item} value={item}>
                      {i18n(`tranbtn_position_${item}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {/* 是否隐藏触发划词翻译的浮动 FAB 小按钮 (隐藏后通常只能通过快捷键调起翻译框) */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="hideTranBtn"
                  value={hideTranBtn}
                  label={i18n("hide_tran_button")}
                  onChange={handleChange}
                >
                  <MenuItem value={false}>{i18n("show")}</MenuItem>
                  <MenuItem value={true}>{i18n("hide")}</MenuItem>
                </TextField>
              </Grid>
              {/* 点击翻译框外任意处时，是否关闭并自动销毁翻译框 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="hideClickAway"
                  value={hideClickAway}
                  label={i18n("hide_click_away")}
                  onChange={handleChange}
                >
                  <MenuItem value={false}>{i18n("disable")}</MenuItem>
                  <MenuItem value={true}>{i18n("enable")}</MenuItem>
                </TextField>
              </Grid>

              {/* 浮动 FAB 触发按钮相对于光标的物理水平偏移量 (X 轴像素) */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  fullWidth
                  size="small"
                  label={i18n("tranbtn_offset_x")}
                  type="number"
                  name="btnOffsetX"
                  value={btnOffsetX}
                  onChange={handleChange}
                  min={-200}
                  max={200}
                />
              </Grid>
              {/* 浮动 FAB 触发按钮相对于光标的物理垂直偏移量 (Y 轴像素) */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  fullWidth
                  size="small"
                  label={i18n("tranbtn_offset_y")}
                  type="number"
                  name="btnOffsetY"
                  value={btnOffsetY}
                  onChange={handleChange}
                  min={-200}
                  max={200}
                />
              </Grid>
              {/* 悬浮翻译框相对于光标/按钮的物理水平偏移量 (X 轴像素) */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  fullWidth
                  size="small"
                  label={i18n("tranbox_offset_x")}
                  type="number"
                  name="boxOffsetX"
                  value={boxOffsetX}
                  onChange={handleChange}
                  min={-200}
                  max={200}
                />
              </Grid>
              {/* 悬浮翻译框相对于光标/按钮的物理垂直偏移量 (Y 轴像素) */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  fullWidth
                  size="small"
                  label={i18n("tranbox_offset_y")}
                  type="number"
                  name="boxOffsetY"
                  value={boxOffsetY}
                  onChange={handleChange}
                  min={-200}
                  max={200}
                />
              </Grid>
              {/* 翻译文本较多时，翻译框高度是否随着文字自动拉伸，否则启用内部局部纵向滚动条 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="autoHeight"
                  value={autoHeight}
                  label={i18n("tranbox_auto_height")}
                  onChange={handleChange}
                >
                  <MenuItem value={false}>{i18n("disable")}</MenuItem>
                  <MenuItem value={true}>{i18n("enable")}</MenuItem>
                </TextField>
              </Grid>

              {/* 翻译框内部交互：单击或双击选中文本触发新翻译 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="tranboxInteractMode"
                  value={tranboxInteractMode}
                  label={i18n("tranbox_interact_mode")}
                  onChange={handleChange}
                >
                  <MenuItem value="-">{i18n("disable")}</MenuItem>
                  <MenuItem value={OPT_TRANBOX_INTERACT_CLICK}>
                    {i18n("tranbox_interact_click")}
                  </MenuItem>
                  <MenuItem value={OPT_TRANBOX_INTERACT_DBLCLICK}>
                    {i18n("tranbox_interact_dblclick")}
                  </MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Box>

          {/* 划词翻译不生效的黑名单域名及正则规则列表 */}
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
        </SettingsAdvanced>
      </Stack>
    </Box>
  );
}
