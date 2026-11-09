import { useState } from "react";
import TextField from "@mui/material/TextField";

/**
 * 敏感文本输入框。
 * 失焦时仅展示圆点，避免 API 密钥在配置页面长期明文暴露；
 * 聚焦编辑时恢复真实值，确保保存、测试和多行密钥逻辑仍使用原始字段值。
 */
export default function SensitiveTextField({
  value = "",
  onChange,
  inputProps,
  ...props
}) {
  const [editing, setEditing] = useState(false);
  const displayValue = editing
    ? value
    : String(value)
        .split("\n")
        .map((line) => (line ? "•".repeat(Math.min(line.length, 24)) : ""))
        .join("\n");

  return (
    <TextField
      {...props}
      value={displayValue}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={editing ? onChange : undefined}
      inputProps={{
        ...inputProps,
        readOnly: !editing,
      }}
    />
  );
}
