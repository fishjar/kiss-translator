import { useState, useEffect, useRef } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import useDropdownDismiss from "./useDropdownDismiss";

// 伪下拉选中态统一 secondary-container 形态（RuleEditor index.js 同款）：
// 选中 secc 底＋onsecc 文字（去 pri 竖条），Mui-focused sf3 保留，行圆角 8px；
// 组件级注入覆盖全部调用方。
// 状态规则一律挂 MUI 自有 listbox/option 类，使默认渲染与 baseSlot/rest 自定义渲染
// 共用同一真源（盘面事实：Autocomplete.js:591-592 给 renderOption 的 props 注入
// classes.option；useAutocomplete.js:280-305 再以 classList 命令式给高亮项加/摘
// Mui-focused，键盘高亮另加 Mui-focusVisible）。listbox 限定把特异度抬到
// (0,2,0)~(0,4,0)，压得住 MUI v5 同键规则；注入体后置的层叠序闸作为第二重保障。
const PSEUDO_DROPDOWN_CSS = `
.MuiAutocomplete-listbox .MuiAutocomplete-option { border-radius: 8px; }
.MuiAutocomplete-listbox .MuiAutocomplete-option.Mui-focused { background-color: var(--kt-sf3, rgba(255,255,255,.08)); }
.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"] { background-color: var(--kt-secc); color: var(--kt-onsecc); }
.MuiAutocomplete-listbox .MuiAutocomplete-option[aria-selected="true"].Mui-focused { background-color: var(--kt-secc); }
`;

const PSEUDO_DROPDOWN_STYLE_ID = "kt-autocomplete-styles";

// 全文档仅一份：id 命中即早退，与 wordHover/YouTubeSubtitleList 同款注入范式。
// CSS 自定义属性在目标元素继承链上求值，标签物理位置不改变 var() 解析结果。
const ensurePseudoDropdownStyles = () => {
  if (!document.head) return;
  if (document.getElementById(PSEUDO_DROPDOWN_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PSEUDO_DROPDOWN_STYLE_ID;
  style.setAttribute("data-kt-autocomplete", "");
  style.textContent = PSEUDO_DROPDOWN_CSS;
  document.head.appendChild(style);
};

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
  onOpen,
  onClose,
  open: controlledOpen,
  slotProps = {},
  baseSlot = {},
  ...rest
}) {
  // 本地 inputValue 用来暂存用户的文本输入框输入（对于 freeSolo 可输入非列表项的值很有用）
  const [inputValue, setInputValue] = useState(value || "");
  // 用以标识是否是选择下拉项提交的值变化，避免在 onBlur 时发生二次冗余的重复 onChange 提交
  const isChangeCommitted = useRef(false);
  const fieldRef = useRef(null);
  const popupRef = useRef(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const closeDropdown = (event, reason) => {
    setLocalOpen(false);
    onClose?.(event, reason);
  };
  useDropdownDismiss({
    open,
    popupRef,
    anchorEl: fieldRef.current,
    onClose: closeDropdown,
  });

  // 外部传入值受控响应
  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  // 首次挂载保证全文档仅一份伪下拉样式表；卸载不回收（注入体为常量，
  // 重复注入才是缺陷，与实例生命周期无关）。
  useEffect(() => {
    ensurePseudoDropdownStyles();
  }, []);

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

  const defaultRenderInput = (params) => (
    <TextField {...params} {...textFieldProps} ref={fieldRef} name={name} label={label} />
  );
  const renderInput = baseSlot.renderInput ?? defaultRenderInput;

  return (
    <>
      <Autocomplete
        value={value}
        onChange={handleChange}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onBlur={handleBlur}
        {...rest}
        open={open}
        onOpen={(event) => {
          setLocalOpen(true);
          onOpen?.(event);
        }}
        onClose={closeDropdown}
        slotProps={{
          ...slotProps,
          popper: { ...slotProps.popper, ref: popupRef },
        }}
        renderInput={renderInput}
        renderOption={
          baseSlot.renderOption ??
          rest.renderOption ??
          ((props, option) => {
            // MUI option props 携带 key：解构剥离后显式直传，避免 key 随
            // 展开进入 JSX 配置而触发 React 18 的 key 传播警告。
            const { key, ...optionProps } = props;
            return (
              <li
                key={key}
                {...optionProps}
                // kt-autocomplete-option 降级为纯定位标记类（调用方选择器兼容），
                // 样式钩子已由 MUI 自有 listbox/option 类承担。
                className={`${optionProps.className || ""} kt-autocomplete-option`}
              >
                {rest.getOptionLabel
                  ? rest.getOptionLabel(option)
                  : option.label ?? String(option)}
              </li>
            );
          })
        }
      />
    </>
  );
}
