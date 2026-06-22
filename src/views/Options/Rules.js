import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import CodeField from "./CodeField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import {
  GLOBAL_KEY,
  DEFAULT_RULE,
  GLOBLA_RULE,
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  URL_KISS_RULES_NEW_ISSUE,
  OPT_SYNCTYPE_WORKER,
  DEFAULT_TRANS_TAG,
  OPT_SPLIT_PARAGRAPH_DISABLE,
  OPT_HIGHLIGHT_WORDS_DISABLE,
  OPT_SPLIT_PARAGRAPH_ALL,
  OPT_HIGHLIGHT_WORDS_ALL,
} from "../../config";
import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useRules } from "../../hooks/Rules";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import { useSetting } from "../../hooks/Setting";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import DeleteIcon from "@mui/icons-material/Delete";
import IconButton from "@mui/material/IconButton";
import ShareIcon from "@mui/icons-material/Share";
import SyncIcon from "@mui/icons-material/Sync";
import { useSubRules } from "../../hooks/SubRules";
import { syncSubRules } from "../../libs/subRules";
import { loadOrFetchSubRules } from "../../libs/subRules";
import { useAlert } from "../../hooks/Alert";
import { syncShareRules } from "../../libs/sync";
import { debounce } from "../../libs/utils";
import {
  delSubRules,
  getSyncWithDefault,
  getDisabledSubRules,
  setDisabledSubRules,
  removeDisabledSubRules,
} from "../../libs/storage";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import HelpButton from "./HelpButton";
import { useSyncCaches } from "../../hooks/Sync";
import DownloadButton from "./DownloadButton";
import UploadButton from "./UploadButton";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import CancelIcon from "@mui/icons-material/Cancel";
import SaveIcon from "@mui/icons-material/Save";
import ValidationInput from "../../hooks/ValidationInput";
import { kissLog } from "../../libs/log";
import { useApiList } from "../../hooks/Api";
import ShowMoreButton from "./ShowMoreButton";
import { useConfirm } from "../../hooks/Confirm";
import { useAllTextStyles } from "../../hooks/CustomStyles";

// 计算规则的初始表单值
const calculateInitialValues = (rule) => {
  // REVIEW: GLOBLA_RULE 存在拼写错误，疑似应为 GLOBAL_RULE。此处为兼容底层导出的拼写而沿用。
  const base = rule?.pattern === "*" ? GLOBLA_RULE : DEFAULT_RULE;
  return { ...base, ...(rule || {}) };
};

// 规则编辑/添加表单字段组件
function RuleFields({ rule, rules, setShow, setKeyword }) {
  // 判断当前是编辑已有规则模式还是添加新规则模式
  const editMode = useMemo(() => !!rule, [rule]);

  const i18n = useI18n();
  // 编辑模式下默认禁用输入框，点击编辑按钮后才允许修改
  const [disabled, setDisabled] = useState(editMode);
  // 表单错误信息状态
  const [errors, setErrors] = useState({});
  // 记录表单的初始值，以便在取消编辑时恢复
  const [initialFormValues, setInitialFormValues] = useState(() =>
    calculateInitialValues(rule)
  );
  // 当前表单输入值的状态
  const [formValues, setFormValues] = useState(initialFormValues);
  // 是否展示高级选项（订阅规则查看时不显示 rules，默认展示高级；自定义规则默认折叠高级选项）
  const [showMore, setShowMore] = useState(!rules);
  // 获取当前已启用的翻译服务 API 列表
  const { enabledApis } = useApiList();
  // 获取自定义文本样式列表
  const { allTextStyles } = useAllTextStyles();

  // 当传入的 rule 发生改变时（如切换了编辑的规则），同步更新表单的初始值和当前值
  useEffect(() => {
    const newInitialValues = calculateInitialValues(rule);
    setInitialFormValues(newInitialValues);
    setFormValues(newInitialValues);
  }, [rule]);

  // 从当前表单状态中解构各个字段，提供默认值
  const {
    pattern, // 匹配的域名或 URL 规则
    selector, // 翻译的目标 CSS 选择器
    keepSelector = "", // 保留不翻译的 CSS 选择器
    blockSelector = "", // 自定义块级元素 CSS 选择器
    rootsSelector = "", // 翻译的根容器 CSS 选择器
    ignoreSelector = "", // 忽略不翻译的 CSS 选择器
    terms, // 专有名词对照表（普通）
    aiTerms, // AI 专有名词对照表
    termsStyle = "", // 专有名词样式
    highlightStyle = "color: red;", // 高亮单词样式
    textExtStyle = "", // 译文额外 CSS 样式
    selectStyle = "", // 针对特定选择器的样式
    parentStyle = "", // 针对选择器父元素的样式
    grandStyle = "", // 针对选择器祖父元素的样式
    injectJs = "", // 页面注入 JS 脚本
    injectCss = "", // 页面注入 CSS 样式
    apiSlug, // 指定的翻译服务标识
    fromLang, // 源语言
    toLang, // 目标语言
    textStyle, // 预设译文样式 slug
    transOpen, // 是否开启翻译
    // bgColor,
    // textDiyStyle,
    transOnly = "false", // 是否仅显示译文
    transOnlyRevert = "false", // 是否在鼠标悬停时恢复原文
    transOnlyRevertDelay = "0.5", // 鼠标悬停恢复原文的延迟时间（秒）
    autoScan = "true", // 是否自动扫描页面
    hasRichText = "true", // 是否包含富文本
    hasShadowroot = "false", // 是否包含 Shadow Root
    scanAll = "false", // 是否扫描所有节点
    // transTiming = OPT_TIMING_PAGESCROLL,
    transTag = DEFAULT_TRANS_TAG, // 翻译结果容器标签 (span / font)
    transTitle = "false", // 是否翻译网页标题
    // detectRemote = "true",
    // skipLangs = [],
    // fixerSelector = "",
    // fixerFunc = "-",
    transStartHook = "", // 翻译开始前的钩子函数
    transEndHook = "", // 翻译结束后的钩子函数
    // transRemoveHook = "",
    splitParagraph = OPT_SPLIT_PARAGRAPH_DISABLE, // 段落切分策略
    splitLength = 0, // 段落切分最大长度
    highlightWords = OPT_HIGHLIGHT_WORDS_DISABLE, // 单词高亮策略
    transOrder, // 文本顺序：由 DEFAULT_RULE / GLOBLA_RULE 提供初始值
  } = formValues;

  // 判断当前表单值是否与初始值不同，决定是否激活“保存”按钮
  const isModified = useMemo(() => {
    return JSON.stringify(initialFormValues) !== JSON.stringify(formValues);
  }, [initialFormValues, formValues]);

  // 校验当前输入的 pattern 是否与已有的其他规则冲突（重复的域名规则）
  const hasSamePattern = (str) => {
    for (const item of rules.list) {
      if (item.pattern === str && rule?.pattern !== str) {
        return true;
      }
    }
    return false;
  };

  // 输入框聚焦事件：清空对应输入框的错误提示
  const handleFocus = (e) => {
    e.preventDefault();
    const { name } = e.target;
    setErrors((pre) => ({ ...pre, [name]: "" }));
  };

  // 防抖处理：在新增规则时，随着用户输入 pattern，自动将其作为过滤关键字同步给父组件进行列表过滤显示
  const handlePatternChange = useMemo(
    () =>
      debounce(async (patterns) => {
        setKeyword(patterns.trim());
      }, 500),
    [setKeyword]
  );

  // 通用的表单输入变化处理器
  const handleChange = (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    setFormValues((pre) => ({ ...pre, [name]: value }));
    if (name === "pattern" && !editMode) {
      handlePatternChange(value);
    }
  };

  // 取消按钮处理器：编辑状态下重新禁用表单并回滚修改；新增状态下直接关闭新增面板
  const handleCancel = (e) => {
    e.preventDefault();
    if (editMode) {
      setDisabled(true);
    } else {
      setShow(false);
    }
    setErrors({});
    setFormValues(initialFormValues);
  };

  // 恢复默认设置处理器：将当前规则配置内容还原为系统预置规则
  const handleRestore = (e) => {
    e.preventDefault();
    setFormValues(({ pattern }) => ({
      // REVIEW: GLOBLA_RULE 存在拼写错误。此处继续沿用。
      ...(pattern === "*" ? GLOBLA_RULE : DEFAULT_RULE),
      pattern,
    }));
  };

  // 规则表单保存/新增提交处理器
  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = {};
    // 校验 pattern 不能为空
    if (!pattern.trim()) {
      errors.pattern = i18n("error_cant_be_blank");
    }
    // 校验 pattern 不能重复
    if (hasSamePattern(pattern)) {
      errors.pattern = i18n("error_duplicate_values");
    }
    // 全局规则模式下，目标选择器 selector 不能为空
    if (pattern === "*" && !errors.pattern && !selector.trim()) {
      errors.selector = i18n("error_cant_be_blank");
    }
    if (Object.keys(errors).length > 0) {
      setErrors(errors);
      return;
    }

    if (editMode) {
      // 编辑保存现有规则
      setDisabled(true);
      rules.put(rule.pattern, formValues);
    } else {
      // 提交添加新规则
      rules.add(formValues);
      setShow(false);
      setFormValues(initialFormValues);
    }
  };

  // 全局继承选项（仅在非全局配置项本身编辑时展示，用于子配置继承全局配置值）
  const GlobalItem = rule?.pattern !== "*" && (
    <MenuItem key={GLOBAL_KEY} value={GLOBAL_KEY}>
      {GLOBAL_KEY}
    </MenuItem>
  );

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={2}>
        {/* 规则匹配模式输入框（如域名或通配符 '*'） */}
        <CodeField
          size="small"
          label={i18n("pattern")}
          error={!!errors.pattern}
          helperText={errors.pattern || i18n("pattern_helper")}
          name="pattern"
          value={pattern}
          disabled={rule?.pattern === "*" || disabled}
          onChange={handleChange}
          onFocus={handleFocus}
        />
        {/* 翻译根容器选择器配置 */}
        <CodeField
          size="small"
          label={i18n("root_selector")}
          helperText={i18n("root_selector_helper")}
          name="rootsSelector"
          value={rootsSelector}
          disabled={disabled}
          onChange={handleChange}
        />
        {/* 忽略翻译的元素选择器配置 */}
        <CodeField
          size="small"
          label={i18n("ignore_selector")}
          helperText={i18n("ignore_selector_helper")}
          name="ignoreSelector"
          value={ignoreSelector}
          disabled={disabled}
          onChange={handleChange}
        />
        {/* 目标翻译元素选择器配置 */}
        <CodeField
          size="small"
          label={i18n("target_selector")}
          error={!!errors.selector}
          helperText={errors.selector || i18n("selector_helper")}
          name="selector"
          value={selector}
          disabled={autoScan === "true" || disabled}
          onChange={handleChange}
          onFocus={handleFocus}
        />
        {/* 保持不翻译元素选择器配置 */}
        <CodeField
          size="small"
          label={i18n("keep_selector")}
          helperText={i18n("keep_selector_helper")}
          name="keepSelector"
          value={keepSelector}
          disabled={disabled}
          onChange={handleChange}
        />
        {/* 自定义块级元素选择器配置 */}
        <CodeField
          size="small"
          label={i18n("block_selector")}
          helperText={i18n("block_selector_helper")}
          name="blockSelector"
          value={blockSelector}
          disabled={disabled}
          onChange={handleChange}
        />

        <Box>
          <Grid container spacing={2} columns={12}>
            {/* 翻译开关设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="transOpen"
                value={transOpen}
                label={i18n("translate_switch")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"true"}>{i18n("default_enabled")}</MenuItem>
                <MenuItem value={"false"}>{i18n("default_disabled")}</MenuItem>
              </TextField>
            </Grid>
            {/* 翻译引擎服务设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="apiSlug"
                value={apiSlug}
                label={i18n("translate_service")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                {enabledApis.map((api) => (
                  <MenuItem key={api.apiSlug} value={api.apiSlug}>
                    {api.apiName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 源语言设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="fromLang"
                value={fromLang}
                label={i18n("from_lang")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                {OPT_LANGS_FROM.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 目标语言设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="toLang"
                value={toLang}
                label={i18n("to_lang")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                {OPT_LANGS_TO.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* 自动扫描页面设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="autoScan"
                value={autoScan}
                label={i18n("auto_scan_page")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>
            {/* 是否翻译富文本设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="hasRichText"
                value={hasRichText}
                label={i18n("has_rich_text")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>
            {/* 是否支持 Shadow Root 内部文本翻译设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="hasShadowroot"
                value={hasShadowroot}
                label={i18n("has_shadowroot")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>
            {/* 是否扫描处理页面中所有的节点设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="scanAll"
                value={scanAll}
                label={i18n("scan_all_nodes")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>

            {/* 仅显示译文设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="transOnly"
                value={transOnly}
                label={i18n("show_only_translations")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>

            {/* 文本顺序设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="transOrder"
                value={transOrder}
                label={i18n("trans_order")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value="original-first">
                  {i18n("original_first")}
                </MenuItem>
                <MenuItem value="translation-first">
                  {i18n("translation_first")}
                </MenuItem>
              </TextField>
            </Grid>

            {/* 悬停恢复原文设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="transOnlyRevert"
                value={transOnlyRevert}
                label={i18n("transonly_revert")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>

            {/* 悬停恢复原文延迟时长配置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                size="small"
                fullWidth
                name="transOnlyRevertDelay"
                value={transOnlyRevertDelay}
                label={i18n("transonly_revert_delay")}
                disabled={disabled}
                onChange={handleChange}
                type="number"
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>

            {/* 长段落切分翻译配置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="splitParagraph"
                value={splitParagraph}
                label={i18n("split_paragraph")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                {OPT_SPLIT_PARAGRAPH_ALL.map((item) => (
                  <MenuItem key={item} value={item}>
                    {i18n(item)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 长段落切分翻译的触发长度阈值 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("split_length")}
                type="number"
                name="splitLength"
                value={splitLength}
                disabled={disabled}
                onChange={handleChange}
                min={0}
                max={1000}
              />
            </Grid>
            {/* 单词高亮标记设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="highlightWords"
                value={highlightWords}
                label={i18n("highlight_words")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                {OPT_HIGHLIGHT_WORDS_ALL.map((item) => (
                  <MenuItem key={item} value={item}>
                    {i18n(item)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* 是否翻译网页 title 标签配置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="transTitle"
                value={transTitle}
                label={i18n("translate_page_title")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>
            {/* 插入译文所用的 HTML 标签设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="transTag"
                value={transTag}
                label={i18n("translation_element_tag")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                <MenuItem value={"span"}>{`<span>`}</MenuItem>
                <MenuItem value={"font"}>{`<font>`}</MenuItem>
              </TextField>
            </Grid>

            {/* 自定义译文样式模板设置 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="textStyle"
                value={textStyle}
                label={i18n("text_style")}
                disabled={disabled}
                onChange={handleChange}
              >
                {GlobalItem}
                {allTextStyles.map((item) => (
                  <MenuItem key={item.styleSlug} value={item.styleSlug}>
                    {item.styleName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </Box>

        {/* 高级选项面板 */}
        {showMore && (
          <>
            {/* 专有名词对照翻译设置 */}
            <TextField
              size="small"
              label={i18n("terms")}
              helperText={i18n("terms_helper")}
              name="terms"
              value={terms}
              disabled={disabled}
              onChange={handleChange}
              multiline
              maxRows={10}
            />
            {/* AI 翻译专有名词对照翻译设置 */}
            <TextField
              size="small"
              label={i18n("ai_terms")}
              helperText={i18n("ai_terms_helper")}
              name="aiTerms"
              value={aiTerms}
              disabled={disabled}
              onChange={handleChange}
              multiline
              maxRows={10}
            />

            {/* 术语高亮 CSS 样式定义 */}
            <CodeField
              size="small"
              label={i18n("terms_style")}
              name="termsStyle"
              value={termsStyle}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />
            {/* 重点词高亮 CSS 样式定义 */}
            <CodeField
              size="small"
              label={i18n("highlight_style")}
              name="highlightStyle"
              value={highlightStyle}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />
            {/* 译文额外 CSS 样式定义 */}
            <CodeField
              size="small"
              label={i18n("text_ext_style")}
              name="textExtStyle"
              value={textExtStyle}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />
            {/* 针对翻译元素自身的 CSS 样式定义 */}
            <CodeField
              size="small"
              label={i18n("selector_style")}
              name="selectStyle"
              value={selectStyle}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />
            {/* 针对翻译元素直接父级的 CSS 样式定义 */}
            <CodeField
              size="small"
              label={i18n("selector_parent_style")}
              name="parentStyle"
              value={parentStyle}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />
            {/* 针对翻译元素祖父级的 CSS 样式定义 */}
            <CodeField
              size="small"
              label={i18n("selector_grand_style")}
              name="grandStyle"
              value={grandStyle}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />

            {/* 翻译开始回调脚本配置 */}
            <CodeField
              size="small"
              label={i18n("translate_start_hook")}
              helperText={i18n("translate_start_hook_helper")}
              name="transStartHook"
              value={transStartHook}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />
            {/* 翻译结束回调脚本配置 */}
            <CodeField
              size="small"
              label={i18n("translate_end_hook")}
              helperText={i18n("translate_end_hook_helper")}
              name="transEndHook"
              value={transEndHook}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />

            {/* 页面注入的 CSS 样式代码 */}
            <CodeField
              size="small"
              label={i18n("inject_css")}
              helperText={i18n("inject_css_helper")}
              name="injectCss"
              value={injectCss}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />
            {/* 页面注入的 JS 脚本代码 */}
            <CodeField
              size="small"
              label={i18n("inject_js")}
              helperText={i18n("inject_js_helper")}
              name="injectJs"
              value={injectJs}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
            />
          </>
        )}

        {/* 规则保存/编辑/删除控制按钮区域 */}
        {rules &&
          (editMode ? (
            // 编辑已有规则模式
            <Stack direction="row" spacing={2}>
              {disabled ? (
                <>
                  {/* 点击开启表单编辑 */}
                  <Button
                    size="small"
                    variant="contained"
                    onClick={(e) => {
                      e.preventDefault();
                      setDisabled(false);
                    }}
                    startIcon={<EditIcon />}
                  >
                    {i18n("edit")}
                  </Button>
                  {/* 全局默认规则（'*'）不允许删除 */}
                  {rule?.pattern !== "*" && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => {
                        e.preventDefault();
                        rules.del(rule.pattern);
                      }}
                      startIcon={<DeleteIcon />}
                    >
                      {i18n("delete")}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {/* 保存编辑修改 */}
                  <Button
                    size="small"
                    variant="contained"
                    type="submit"
                    startIcon={<SaveIcon />}
                    disabled={!isModified}
                  >
                    {i18n("save")}
                  </Button>
                  {/* 取消并撤销更改 */}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleCancel}
                    startIcon={<CancelIcon />}
                  >
                    {i18n("cancel")}
                  </Button>
                  {/* 恢复至系统预置规则配置 */}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleRestore}
                  >
                    {i18n("restore_default")}
                  </Button>
                </>
              )}
              {/* 高级选项折叠展示开关 */}
              <ShowMoreButton showMore={showMore} onChange={setShowMore} />
            </Stack>
          ) : (
            // 新建添加规则模式
            <Stack direction="row" spacing={2}>
              {/* 新增规则保存 */}
              <Button
                size="small"
                variant="contained"
                type="submit"
                startIcon={<SaveIcon />}
              >
                {i18n("save")}
              </Button>
              {/* 新增规则取消 */}
              <Button
                size="small"
                variant="outlined"
                onClick={handleCancel}
                startIcon={<CancelIcon />}
              >
                {i18n("cancel")}
              </Button>
              {/* 高级选项折叠展示开关 */}
              <ShowMoreButton showMore={showMore} onChange={setShowMore} />
            </Stack>
          ))}
      </Stack>
    </form>
  );
}

// 规则折叠面板组件，用于展示和启用/禁用单个规则
function RuleAccordion({ rule, rules, sourceUrl, isExpanded = false }) {
  const i18n = useI18n();
  // 面板展开状态
  const [expanded, setExpanded] = useState(isExpanded);
  const isPersonalRule = !!rules && rule.pattern !== GLOBAL_KEY;
  const isSubRule = !rules;
  const isRuleEnabled = isPersonalRule ? rule.enabled !== false : true;

  // 用户是否手动禁用了该订阅规则
  const [disabledByUser, setDisabledByUser] = useState(false);
  const alert = useAlert();

  // 若为订阅规则（rules 不存在且 sourceUrl 存在），则在初始化时从存储中读取该 pattern 的启用/禁用状态
  useEffect(() => {
    if (!rules) {
      if (!sourceUrl) return;
      (async () => {
        try {
          const list = await getDisabledSubRules(sourceUrl);
          // REVIEW: 此异步回调在组件卸载时若被执行可能会造成未挂载组件状态更新的报错，虽然在多标签切换等低频场景下影响较小
          setDisabledByUser(Array.isArray(list) && list.includes(rule.pattern));
        } catch (err) {
          kissLog("getDisabledSubRules", err);
        }
      })();
    }
  }, [rule, rules, sourceUrl]);

  // 面板展开/折叠切换
  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  const stopSummaryToggle = (e) => {
    e.stopPropagation();
  };

  const titleOpacity = isPersonalRule
    ? isRuleEnabled
      ? 1
      : 0.5
    : rules
      ? 1
      : 0.5;

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ width: "100%" }}
        >
          {/* 对于个人规则，提供一个 Switch 按钮，控制该条规则在匹配时的生效状态 */}
          {isPersonalRule && (
            <Switch
              size="small"
              checked={isRuleEnabled}
              inputProps={{
                "aria-label": `Toggle personal rule ${rule.pattern}`,
              }}
              onPointerDown={stopSummaryToggle}
              onClick={stopSummaryToggle}
              onChange={(e) => {
                const enabled = e.target.checked;
                rules.put(rule.pattern, { enabled });
                alert.success(i18n(enabled ? "rule_enabled" : "rule_disabled"));
              }}
            />
          )}

          {/* 对于订阅规则，额外提供一个 Switch 按钮，控制该条规则在匹配时的生效状态 */}
          {isSubRule && (
            <Switch
              size="small"
              checked={!disabledByUser}
              onPointerDown={stopSummaryToggle} // 阻止事件传播，避免点击 Switch 触发折叠面板展开/收起
              onClick={stopSummaryToggle}
              onChange={async (e) => {
                const enabled = e.target.checked;
                const toDisable = !enabled;
                try {
                  const list = await getDisabledSubRules(sourceUrl);
                  const set = new Set(Array.isArray(list) ? list : []);
                  if (toDisable) set.add(rule.pattern);
                  else set.delete(rule.pattern);
                  await setDisabledSubRules(sourceUrl, [...set]);
                  setDisabledByUser(toDisable);
                  alert.success(
                    i18n(toDisable ? "rule_disabled" : "rule_enabled")
                  );
                } catch (err) {
                  kissLog("toggle disabled sub rule", err);
                  alert.error(i18n("rule_toggle_failed"));
                }
              }}
            />
          )}

          <Typography
            sx={{
              opacity: titleOpacity,
              overflowWrap: "anywhere",
              flex: 1,
            }}
          >
            {rule.pattern === GLOBAL_KEY
              ? `[${i18n("global_rule")}] ${rule.pattern}`
              : rule.pattern}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && <RuleFields rule={rule} rules={rules} />}
      </AccordionDetails>
    </Accordion>
  );
}

// 规则分享按钮组件，允许将用户规则同步上传至 WebDAV 或云服务并生成分享链接
function ShareButton({ rules, injectRules, selectedUrl }) {
  const alert = useAlert();
  const i18n = useI18n();

  // 处理分享点击逻辑
  const handleClick = async () => {
    try {
      // 获取同步配置
      const { syncType, syncUrl, syncKey } = await getSyncWithDefault();
      // 只有启用了 WebDAV 等云同步方式时，才支持生成分享
      if (syncType !== OPT_SYNCTYPE_WORKER || !syncUrl || !syncKey) {
        alert.warning(i18n("error_sync_setting"));
        return;
      }

      const shareRules = [...rules.list];
      // 如果启用了订阅规则注入，则一并合并当前选中的订阅规则以分享整个规则集
      if (injectRules) {
        const subRules = await loadOrFetchSubRules(selectedUrl);
        shareRules.splice(-1, 0, ...subRules);
      }

      // 将规则同步并生成唯一的云存储分享 URL
      const url = await syncShareRules({
        rules: shareRules,
        syncUrl,
        syncKey,
      });

      // 在新标签页中打开规则分享页面
      window.open(url, "_blank");
    } catch (err) {
      alert.warning(i18n("error_got_some_wrong"));
      kissLog("share rules", err);
    }
  };

  return (
    <Button
      size="small"
      variant="outlined"
      onClick={handleClick}
      startIcon={<ShareIcon />}
    >
      {i18n("share")}
    </Button>
  );
}

// 个人自定义规则面板组件
function UserRules({ subRules, rules }) {
  const i18n = useI18n();
  // 控制是否显示“添加新规则”的表单面板
  const [showAdd, setShowAdd] = useState(false);
  // 获取当前偏好设置并更新设置方法
  const { setting, updateSetting } = useSetting();
  // 匹配关键字状态，用于在添加规则时辅助输入或做本地规则检索
  const [keyword, setKeyword] = useState("");
  // 全局确认弹框
  const confirm = useConfirm();

  // 是否注入订阅的翻译规则
  const injectRules = !!setting?.injectRules;
  // 获取订阅的 URL 和当前订阅下的具体规则列表
  const { selectedUrl, selectedRules } = subRules;

  // 规则备份文件导入
  const handleImport = async (data) => {
    try {
      await rules.merge(JSON.parse(data));
    } catch (err) {
      kissLog("import rules", err);
    }
  };

  // 切换是否将自定义规则集注入到运行上下文的设置
  const handleInject = () => {
    updateSetting({
      injectRules: !injectRules,
    });
  };

  // 清空所有自定义规则
  const handleClearAll = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("confirm_title"),
      cancelText: i18n("cancel"),
    });
    if (isConfirmed) {
      rules.clear();
    }
  };

  // 若关闭了“添加新规则”面板，重置本地过滤关键字
  useEffect(() => {
    if (!showAdd) {
      setKeyword("");
    }
  }, [showAdd]);

  // 规则列表未加载完成时暂不渲染
  if (!rules.list) {
    return;
  }

  return (
    <Stack spacing={3}>
      {/* 规则操作按钮栏 */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        useFlexGap
        flexWrap="wrap"
      >
        {/* 点击展开添加规则面板 */}
        <Button
          size="small"
          variant="contained"
          disabled={showAdd}
          onClick={(e) => {
            e.preventDefault();
            setShowAdd(true);
          }}
          startIcon={<AddIcon />}
        >
          {i18n("add")}
        </Button>

        {/* 导入、导出、分享、清空、帮助与注入配置切换 */}
        <UploadButton text={i18n("import")} handleImport={handleImport} />
        <DownloadButton
          handleData={() => JSON.stringify([...rules.list], null, 2)}
          text={i18n("export")}
          fileName={`kiss-rules_v2_${Date.now()}.json`}
        />

        <ShareButton
          rules={rules}
          injectRules={injectRules}
          selectedUrl={selectedUrl}
        />

        <Button
          size="small"
          variant="outlined"
          onClick={handleClearAll}
          startIcon={<ClearAllIcon />}
        >
          {i18n("clear_all")}
        </Button>

        <HelpButton url={URL_KISS_RULES_NEW_ISSUE} />

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={injectRules}
              onChange={handleInject}
            />
          }
          label={i18n("inject_rules")}
        />
      </Stack>

      {/* 新增规则的表单录入面板 */}
      {showAdd && (
        <RuleFields
          rules={rules}
          setShow={setShowAdd}
          setKeyword={setKeyword}
        />
      )}

      {/* 用户自定义的域名/网址规则列表（支持输入匹配过滤，排除 '*' 全局配置） */}
      <Box>
        {rules.list
          .filter(
            (rule) =>
              rule.pattern !== "*" &&
              (rule.pattern.includes(keyword) || keyword.includes(rule.pattern))
          )
          .map((rule) => (
            <RuleAccordion key={rule.pattern} rule={rule} rules={rules} />
          ))}
      </Box>

      {/* 如果勾选了注入订阅规则，则在此处以只读或独立开关形式展示当前选中的外部订阅规则集 */}
      {injectRules && (
        <Box>
          {selectedRules
            .filter(
              (rule) =>
                rule.pattern.includes(keyword) || keyword.includes(rule.pattern)
            )
            .map((rule) => (
              <RuleAccordion
                key={rule.pattern}
                rule={rule}
                sourceUrl={selectedUrl}
              />
            ))}
        </Box>
      )}
    </Stack>
  );
}

// 单个订阅规则项组件，用于显示规则源地址、最近同步时间以及删除和手动同步操作
function SubRulesItem({
  index,
  url,
  syncAt,
  selectedUrl,
  delSub,
  setSelectedRules,
  updateDataCache,
  deleteDataCache,
}) {
  const [loading, setLoading] = useState(false);
  const alert = useAlert();

  // 删除订阅规则源
  const handleDel = async () => {
    try {
      await delSub(url); // 从订阅列表中移除 URL
      await delSubRules(url); // 删除本地缓存的对应规则集数据
      await deleteDataCache(url); // 删除本地同步的时间戳缓存
      // 移除针对该订阅源下单独定制的规则禁用状态
      try {
        await removeDisabledSubRules(url);
      } catch (err) {
        kissLog("removeDisabledSubRules", err);
      }
    } catch (err) {
      kissLog("del subrules", err);
    }
  };

  // 手动同步/更新当前订阅源的规则
  const handleSync = async () => {
    try {
      setLoading(true);
      const rules = await syncSubRules(url); // 发起网络请求获取最新的订阅规则
      // 如果当前正处于选中查看状态，则立刻更新 UI 中正在展示的规则列表
      if (rules.length > 0 && url === selectedUrl) {
        setSelectedRules(rules);
      }
      await updateDataCache(url); // 更新最近同步时间戳
    } catch (err) {
      kissLog("sync sub rules", err);
      alert.error(
        <>
          <p>Sync Error:</p>
          <pre>{err.message}</pre>
        </>
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack direction="row" alignItems="center" spacing={2}>
      {/* 规则源单选框 */}
      <FormControlLabel
        value={url}
        control={<Radio />}
        sx={{
          overflowWrap: "anywhere",
        }}
        label={url}
      />

      {/* 显示最近同步时间 */}
      {syncAt && (
        <span style={{ marginLeft: "0.5em", opacity: 0.5 }}>
          [{new Date(syncAt).toLocaleString()}]
        </span>
      )}

      {/* 同步中展示菊花图，否则展示同步按钮 */}
      {loading ? (
        <CircularProgress size={16} />
      ) : (
        <IconButton
          size="small"
          onClick={handleSync}
          aria-label={`Sync subscription ${url}`}
        >
          <SyncIcon fontSize="small" />
        </IconButton>
      )}

      {/* 首个默认订阅源，以及当前正在选中的订阅源不允许删除 */}
      {index !== 0 && selectedUrl !== url && (
        <IconButton
          size="small"
          onClick={handleDel}
          aria-label={`Delete subscription ${url}`}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      )}
    </Stack>
  );
}

// 订阅规则源新增组件
function SubRulesEdit({ subList, addSub, updateDataCache }) {
  const i18n = useI18n();
  // 输入的订阅 URL
  const [inputText, setInputText] = useState("");
  // 输入校验错误提示
  const [inputError, setInputError] = useState("");
  // 控制是否展示 URL 输入栏
  const [showInput, setShowInput] = useState(false);
  const [loading, setLoading] = useState(false);

  // 取消并隐藏输入栏
  const handleCancel = (e) => {
    e.preventDefault();
    setShowInput(false);
    setInputText("");
    setInputError("");
  };

  // 保存新增的订阅源
  const handleSave = async (e) => {
    e.preventDefault();
    const url = inputText.trim();

    if (!url) {
      setInputError(i18n("error_cant_be_blank"));
      return;
    }

    // 避免重复订阅同一个 URL
    if (subList.some((item) => item.url === url)) {
      setInputError(i18n("error_duplicate_values"));
      return;
    }

    try {
      setLoading(true);
      const rules = await syncSubRules(url);
      // REVIEW: 若获取成功但返回的规则数刚好为 0（如合法的空订阅源），直接抛错并提示“获取 URL 失败 (error_fetch_url)”不够精确
      if (rules.length === 0) {
        throw new Error("empty rules");
      }
      await addSub(url); // 将新订阅源添加到列表
      await updateDataCache(url); // 记录首次同步的时间戳
      setShowInput(false);
      setInputText("");
    } catch (err) {
      kissLog("fetch rules", err);
      setInputError(i18n("error_fetch_url")); // 网络请求或同步解析失败提示
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (e) => {
    e.preventDefault();
    setInputText(e.target.value);
  };

  const handleFocus = (e) => {
    e.preventDefault();
    setInputError("");
  };

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={2}>
        {/* 点击展开新增订阅 URL 输入框 */}
        <Button
          size="small"
          variant="contained"
          disabled={showInput}
          onClick={(e) => {
            e.preventDefault();
            setShowInput(true);
          }}
          startIcon={<AddIcon />}
        >
          {i18n("add")}
        </Button>
        <HelpButton url={URL_KISS_RULES_NEW_ISSUE} />
      </Stack>

      {showInput && (
        <>
          <TextField
            size="small"
            value={inputText}
            error={!!inputError}
            helperText={inputError}
            onChange={handleInput}
            onFocus={handleFocus}
            label={i18n("subscribe_url")}
          />

          <Stack direction="row" alignItems="center" spacing={2}>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={loading}
              startIcon={<SaveIcon />}
            >
              {i18n("save")}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCancel}
              startIcon={<CancelIcon />}
            >
              {i18n("cancel")}
            </Button>
          </Stack>
        </>
      )}
    </>
  );
}

// 订阅规则配置主面板组件
function SubRules({ subRules }) {
  const {
    subList, // 订阅源列表
    selectSub, // 选择订阅源方法
    addSub, // 添加订阅源方法
    delSub, // 删除订阅源方法
    selectedUrl, // 当前选中的订阅 URL
    selectedRules, // 当前选中订阅源下的规则集列表
    setSelectedRules, // 更新当前选中订阅源规则集列表的方法
    loading, // 是否正在同步/加载
  } = subRules;

  // 引入同步缓存 Hook，用于管理 WebDAV 或本地订阅源的最后同步时间戳
  const { dataCaches, updateDataCache, deleteDataCache } = useSyncCaches();

  // 切换选中的订阅规则源
  const handleSelect = (e) => {
    const url = e.target.value;
    selectSub(url);
  };

  return (
    <Stack spacing={3}>
      {/* 新增订阅源按钮及输入框 */}
      <SubRulesEdit
        subList={subList}
        addSub={addSub}
        updateDataCache={updateDataCache}
      />

      {/* 订阅源单选列表 */}
      <RadioGroup value={selectedUrl} onChange={handleSelect}>
        {subList.map((item, index) => (
          <SubRulesItem
            key={item.url}
            url={item.url}
            syncAt={dataCaches[item.url]}
            index={index}
            selectedUrl={selectedUrl}
            delSub={delSub}
            setSelectedRules={setSelectedRules}
            updateDataCache={updateDataCache}
            deleteDataCache={deleteDataCache}
          />
        ))}
      </RadioGroup>

      {/* 显示当前选中订阅源下的具体规则集折叠面板 */}
      <Box>
        {loading ? (
          <center>
            <CircularProgress />
          </center>
        ) : (
          selectedRules.map((rule) => (
            <RuleAccordion
              key={rule.pattern}
              rule={rule}
              sourceUrl={selectedUrl}
            />
          ))
        )}
      </Box>
    </Stack>
  );
}

// 全局默认规则面板组件（单独将 pattern 为 "*" 的规则抽出来，作为第一标签页展示）
function GlobalRule({ rules }) {
  // 从自定义规则列表的末尾提取全局默认规则 '*'
  const globalRule = useMemo(
    () => rules.list[rules.list.length - 1],
    [rules.list]
  );

  // 未加载到全局规则时暂不渲染
  if (!globalRule) {
    return;
  }

  return (
    <Stack spacing={3}>
      <RuleAccordion
        key={globalRule.pattern}
        rule={globalRule}
        rules={rules}
        isExpanded={true} // 默认展开全局规则面板
      />
    </Stack>
  );
}

// 规则设置中心主入口组件，负责全局规则、自定义规则、订阅规则的三栏式标签切换展示
export default function Rules() {
  const i18n = useI18n();
  // 当前处于激活状态的标签页索引 (0: 全局规则, 1: 自定义规则, 2: 订阅规则)
  const [activeTab, setActiveTab] = useState(0);
  const subRules = useSubRules();
  const rules = useRules();

  // 标签页切换处理器
  const handleTabChange = (e, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box>
      <Stack spacing={3}>
        {/* 顶部规则警示/说明提示框 */}
        <Alert severity="info">
          {i18n("rules_warn_1")}
          <br />
          {i18n("rules_warn_2")}
          <br />
          {i18n("rules_warn_3")}
        </Alert>

        {/* 规则分类选项卡导航 */}
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label={i18n("global_rule")} />
            <Tab label={i18n("personal_rules")} />
            <Tab label={i18n("subscribe_rules")} />
            {/* <Tab label={i18n("overwrite_subscribe_rules")} /> */}
          </Tabs>
        </Box>
        {/* 全局默认规则视图 (Tab 0) */}
        <div hidden={activeTab !== 0}>
          {activeTab === 0 && <GlobalRule rules={rules} />}
        </div>
        {/* 个人自定义规则视图 (Tab 1) */}
        <div hidden={activeTab !== 1}>
          {activeTab === 1 && <UserRules subRules={subRules} rules={rules} />}
        </div>
        {/* 外部规则订阅视图 (Tab 2) */}
        <div hidden={activeTab !== 2}>
          {activeTab === 2 && <SubRules subRules={subRules} />}
        </div>
        {/* <div hidden={activeTab !== 3}>{activeTab === 3 && <OwSubRule />}</div> */}
      </Stack>
    </Box>
  );
}
