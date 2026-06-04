import { useState, useEffect, useMemo } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import CodeField from "./CodeField";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import { useConfirm } from "../../hooks/Confirm";
import Box from "@mui/material/Box";
import { useAllTextStyles, useStyleList } from "../../hooks/CustomStyles";
import { css } from "@emotion/css";
import { getRandomQuote } from "../../config/quotes";
import { useSetting } from "../../hooks/Setting";

/**
 * 单个自定义 CSS 样式编辑表单区域
 *
 * @param {Object} props
 * @param {Object} props.customStyle - 样式对象配置
 * @param {Function} props.deleteStyle - 删除样式回调
 * @param {Function} props.updateStyle - 保存/更新样式回调
 * @param {boolean} props.isBuiltin - 是否是系统内置的只读样式 (内置样式不允许修改和删除)
 */
function StyleFields({ customStyle, deleteStyle, updateStyle, isBuiltin }) {
  const i18n = useI18n();
  const {
    setting: { uiLang },
  } = useSetting();
  // 暂存表单输入值的状态
  const [formData, setFormData] = useState({});
  // 用于判定当前输入是否发生改变以控制保存按钮
  const [isModified, setIsModified] = useState(false);
  const confirm = useConfirm();

  // 监听外部样式更新，重置表单
  useEffect(() => {
    if (customStyle) {
      setFormData(customStyle);
    }
  }, [customStyle]);

  // 比对是否发生过修改以激活保存按钮
  useEffect(() => {
    if (!customStyle) return;
    const hasChanged = JSON.stringify(customStyle) !== JSON.stringify(formData);
    setIsModified(hasChanged);
  }, [customStyle, formData]);

  // 表单字段输入改变处理
  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;

    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // 触发样式规则更新
  const handleSave = () => {
    updateStyle(customStyle.styleSlug, formData);
  };

  // 二次确认删除自定义样式
  const handleDelete = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (isConfirmed) {
      deleteStyle(customStyle.styleSlug);
    }
  };

  const { styleName = "", styleCode = "" } = formData;

  // 使用 @emotion/css 动态把用户手写的 CSS 转换为随机类名挂载到预览框上展示样式效果
  const textClass = useMemo(
    () => css`
      ${styleCode}
    `,
    [styleCode]
  );

  // 动态生成一句预览文字
  const quote = useMemo(() => {
    const q = getRandomQuote();
    if (uiLang === "en") {
      return [q.zh, q.en];
    }
    return [q.en, q[uiLang]];
  }, [uiLang]);

  return (
    <Stack spacing={3}>
      {/* 实时 CSS 渲染预览展示区 */}
      <Box>
        {quote[0]}
        <br />
        <span className={textClass}>{quote[1]}</span>
      </Box>

      {/* 样式名称输入框 */}
      <TextField
        size="small"
        label={i18n("style_name")}
        name="styleName"
        value={styleName}
        onChange={handleChange}
        disabled={isBuiltin}
      />
      {/* CSS 源码编辑器 */}
      <CodeField
        size="small"
        label={i18n("style_code")}
        name="styleCode"
        value={styleCode}
        onChange={handleChange}
        maxRows={10}
        disabled={isBuiltin}
      />

      {/* 非只读的自定义样式，提供保存和删除动作按钮 */}
      {!isBuiltin && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
        >
          <Button
            size="small"
            variant="contained"
            onClick={handleSave}
            disabled={!isModified}
          >
            {i18n("save")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={handleDelete}
          >
            {i18n("delete")}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

/**
 * 样式的折叠手风琴壳组件
 */
function StyleAccordion({ customStyle, deleteStyle, updateStyle, isBuiltin }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography
          sx={{
            overflowWrap: "anywhere",
          }}
        >
          {`${customStyle.styleName}`}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <StyleFields
            customStyle={customStyle}
            deleteStyle={deleteStyle}
            updateStyle={updateStyle}
            isBuiltin={isBuiltin}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

/**
 * 译文展现样式设置主页面组件 (StylesSetting)
 */
export default function StylesSetting() {
  const i18n = useI18n();
  // 自定义 CSS 列表 Hook
  const { customStyles, addStyle, deleteStyle, updateStyle } = useStyleList();
  // 系统内置的只读样式配置列表
  const { builtinStyles } = useAllTextStyles();

  // 添加新 CSS 样式
  const handleClick = (e) => {
    e.preventDefault();
    addStyle();
  };

  return (
    <Box>
      <Stack spacing={3}>
        {/* 新增样式按钮 */}
        <Box>
          <Button
            size="small"
            id="add-style-button"
            variant="contained"
            onClick={handleClick}
            startIcon={<AddIcon />}
          >
            {i18n("add")}
          </Button>
        </Box>

        {/* 用户自定义的可修改样式列表 */}
        <Box>
          {customStyles.map((customStyle) => (
            <StyleAccordion
              key={customStyle.styleSlug}
              customStyle={customStyle}
              deleteStyle={deleteStyle}
              updateStyle={updateStyle}
            />
          ))}
        </Box>
        {/* 插件内置的只读系统样式列表 */}
        <Box>
          {builtinStyles.map((customStyle) => (
            <StyleAccordion
              key={customStyle.styleSlug}
              customStyle={customStyle}
              deleteStyle={deleteStyle}
              updateStyle={updateStyle}
              isBuiltin={true}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
