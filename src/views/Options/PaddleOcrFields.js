/**
 * @file PaddleOcrFields.js
 * @description PaddleOCR 官方异步 API 的模型与产线参数配置。
 * 模型决定服务能力：文字 OCR / VLM 文档解析 / 结构分析。
 */

import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  PADDLEOCR_MODEL_GROUPS,
  PADDLEOCR_VLM_EXTRA_MODELS,
  paddleOcrModelInfo,
} from "../../builtin-plugins/paddleocrModels";

export default function PaddleOcrFields({
  api = {},
  onChange,
  i18n = (key, fallback) => fallback || key,
}) {
  const selected = paddleOcrModelInfo(api.model);
  const emit = (name, value) => onChange?.(name, value);
  const switchField = (name, label, defaultValue = false) => (
    <FormControlLabel
      key={name}
      label={label}
      control={
        <Switch
          size="small"
          checked={api[name] === undefined ? defaultValue : Boolean(api[name])}
          onChange={(event) => emit(name, event.target.checked)}
        />
      }
    />
  );

  return (
    <>
      <TextField
        select
        fullWidth
        size="small"
        name="model"
        sx={{ gridColumn: "1 / -1" }}
        label={i18n("paddleocr_model", "PaddleOCR 模型")}
        value={api.model || "PP-OCRv6"}
        onChange={(event) => emit("model", event.target.value)}
        helperText={i18n(
          "paddleocr_model_hint",
          "不同模型对应不同能力：文字识别、VLM 文档解析或结构分析。"
        )}
      >
        {PADDLEOCR_MODEL_GROUPS.map((group) => [
          <MenuItem
            key={`group-${group.id}`}
            disabled
            sx={{ opacity: 0.7, fontWeight: 700 }}
          >
            {i18n(group.labelKey, group.label)}
          </MenuItem>,
          ...group.models.map((model) => (
            <MenuItem key={model} value={model}>
              {model}
            </MenuItem>
          )),
        ])}
      </TextField>

      <Stack
        direction="row"
        useFlexGap
        flexWrap="wrap"
        sx={{ gridColumn: "1 / -1" }}
      >
        {switchField(
          "paddleUseDocOrientationClassify",
          i18n("paddleocr_option_doc_orientation", "文档方向分类")
        )}
        {switchField(
          "paddleUseDocUnwarping",
          i18n("paddleocr_option_doc_unwarping", "文档矫正")
        )}
        {selected.groupId === "text" &&
          switchField(
            "paddleUseTextlineOrientation",
            i18n("paddleocr_option_textline_orientation", "文本行方向分类")
          )}
        {selected.groupId !== "text" &&
          switchField(
            "paddleUseChartRecognition",
            i18n("paddleocr_option_chart_recognition", "图表识别")
          )}
        {selected.groupId === "document" &&
          PADDLEOCR_VLM_EXTRA_MODELS.has(selected.model) && (
            <>
              {/* 图片块内文字识别直接影响“是否漏字”，默认开启。 */}
              {switchField(
                "paddleUseOcrForImageBlock",
                i18n("paddleocr_option_ocr_image_block", "图片内文字识别"),
                true
              )}
              {switchField(
                "paddleUseSealRecognition",
                i18n("paddleocr_option_seal_recognition", "印章识别")
              )}
            </>
          )}
        {selected.groupId === "structure" && (
          <>
            {switchField(
              "paddleUseTableRecognition",
              i18n("paddleocr_option_table_recognition", "表格识别"),
              true
            )}
            {switchField(
              "paddleUseFormulaRecognition",
              i18n("paddleocr_option_formula_recognition", "公式识别"),
              true
            )}
          </>
        )}
      </Stack>

      {selected.groupId === "document" && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ gridColumn: "1 / -1", lineHeight: 1.6 }}
        >
          {i18n(
            "paddleocr_vlm_prompt_hint",
            "官方 VLM 接口不支持自定义提示词，图片/文件翻译中的“视觉解析提示词”对本服务无效。"
          )}
        </Typography>
      )}
    </>
  );
}
