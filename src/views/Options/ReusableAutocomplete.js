import { useState, useEffect, useRef } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

/**
 * 一个可复用的 Autocomplete 组件，增加了 name 属性和标准化的 onChange 事件
 * @param {object} props - 组件的 props
 * @param {string} props.name - 表单字段的名称，会包含 in onChange 的 event.target 中
 * @param {string} props.label - TextField 的标签
 * @param {any} props.value - 受控组件的当前值
 * @param {function} props.onChange - 值改变时的回调函数 (event) => {}
 * @param {Array} props.options - Autocomplete 的选项列表
 */
export default function ReusableAutocomplete({
  name,
  label,
  value,
  onChange,
  textFieldProps = {},
  ...rest
}) {
  // 本地 inputValue 用来暂存用户的文本输入框输入（对于 freeSolo 可输入非列表项的值很有用）
  const [inputValue, setInputValue] = useState(value || "");
  // 用以标识是否是选择下拉项提交的值变化，避免在 onBlur 时发生二次冗余的重复 onChange 提交
  const isChangeCommitted = useRef(false);

  // 外部传入值受控响应
  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  // 触发一个合成的 onChange 事件，使得其暴露出来的 API 行为与原生 input TextField 保持高度一致
  const triggerOnChange = (newValue) => {
    if (onChange) {
      const syntheticEvent = {
        target: {
          name: name,
          value: newValue,
        },
        preventDefault: () => {},
      };
      onChange(syntheticEvent);
    }
  };

  // 输入框失去焦点处理 (用于同步自由输入的 inputValue)
  const handleBlur = () => {
    if (isChangeCommitted.current) {
      isChangeCommitted.current = false;
      return;
    }

    if (inputValue !== value) {
      triggerOnChange(inputValue);
    }
  };

  // 从下拉选项中选中新项时的处理
  const handleChange = (event, newValue) => {
    isChangeCommitted.current = true;
    triggerOnChange(newValue);
  };

  // 输入框文字内容变化时的处理
  const handleInputChange = (event, newInputValue) => {
    isChangeCommitted.current = false;
    setInputValue(newInputValue);
  };

  return (
    <Autocomplete
      value={value}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onBlur={handleBlur}
      {...rest}
      renderInput={(params) => (
        <TextField {...params} {...textFieldProps} name={name} label={label} />
      )}
    />
  );
}
