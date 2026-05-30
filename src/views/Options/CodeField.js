import TextField from "@mui/material/TextField";

// 等宽字体集常数，便于排版格式化代码
const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * 等宽字体代码文本编辑器组件
 * (常用于编辑自定义 CSS、自定义 JS 请求/响应 Hook、自定义规则 JSON 等)
 *
 * @param {Object} props
 * @param {Object} [props.InputProps] - MUI 原生的输入框配置属性
 */
export default function CodeField({ InputProps, ...rest }) {
  return (
    <TextField
      multiline // 默认支持多行输入
      {...rest}
      InputProps={{
        ...InputProps,
        sx: {
          fontFamily: MONO_FONT, // 强制应用等宽字体
          fontSize: "0.875rem",
          ...(InputProps?.sx || {}),
        },
      }}
    />
  );
}
