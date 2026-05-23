import TextField from "@mui/material/TextField";

const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * 用于编辑代码型内容（CSS、JS Hook、JSON、CSS 选择器等）的 TextField。
 * 默认 multiline + 等宽字体，其余 props 透传。
 */
export default function CodeField({ InputProps, ...rest }) {
  return (
    <TextField
      multiline
      {...rest}
      InputProps={{
        ...InputProps,
        sx: {
          fontFamily: MONO_FONT,
          fontSize: "0.875rem",
          ...(InputProps?.sx || {}),
        },
      }}
    />
  );
}
