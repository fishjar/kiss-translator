import { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import { limitNumber, limitFloat } from "../libs/utils";

/**
 * 带输入数值验证的文本框 React 组件
 * 用于限制设置面板中的数字配置项（如字体大小、翻译延时等）输入范围
 */
function ValidationInput({
  value, // 外部传入绑定的值
  onChange, // 状态变更回调
  name, // 字段键名
  min, // 最小值约束
  max, // 最大值约束
  isFloat = false, // 是否允许输入浮点数（默认为整数）
  ...props // 其他传递给 TextField 的属性
}) {
  // 使用本地局部状态管理输入框的即时显示文本，防止每次输入都触发全页重绘或校验导致输入卡顿
  const [localValue, setLocalValue] = useState(value);

  // 监听外部 prop value 的改变，保证本地输入框状态与之同步
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // 处理本地输入框的值变更
  const handleLocalChange = (e) => {
    setLocalValue(e.target.value);
  };

  // 核心校验逻辑：在输入框失去焦点 (onBlur) 时触发
  const handleBlur = () => {
    const numValue = Number(localValue);

    // 如果输入的不是一个合法的数字，则自动回滚为原有的 prop value
    if (isNaN(numValue)) {
      setLocalValue(value);
      return;
    }

    // 限制数字大小在指定的 min ~ max 范围内
    const validatedValue = isFloat
      ? limitFloat(numValue, min, max)
      : limitNumber(numValue, min, max);

    // 如果校验后被截断或调整，更新本地显示的值
    if (validatedValue !== numValue) {
      setLocalValue(validatedValue);
    }

    // 将最终经过范围校验的数值分发给外部 onChange 回调函数
    onChange({
      target: {
        name: name,
        value: validatedValue,
      },
      preventDefault: () => {},
    });
  };

  return (
    <TextField
      {...props}
      type="number"
      name={name}
      value={localValue}
      onChange={handleLocalChange}
      onBlur={handleBlur}
    />
  );
}

export default ValidationInput;
