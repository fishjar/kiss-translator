import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import { useEffect, useState, useRef } from "react";
import { shortcutListener } from "../../libs/shortcut";
import { useI18n } from "../../hooks/I18n";

/**
 * 快捷键录入输入框组件 (ShortcutInput)
 * 允许用户点击编辑按钮后，直接在键盘上按下对应的组合键，自动捕获并录入为快捷键配置
 */
export default function ShortcutInput({
  value: keys,
  onChange,
  label,
  helperText,
}) {
  // 控制是否处于快捷键录入编辑状态
  const [isEditing, setIsEditing] = useState(false);
  // 录入编辑状态下，临时捕获的组合按键列表
  const [editingKeys, setEditingKeys] = useState([]);
  const inputRef = useRef(null);
  const i18n = useI18n();

  // 提交并保存录入的快捷键组合，并退出编辑状态
  const commitChanges = () => {
    onChange(editingKeys);
    setIsEditing(false);
  };

  // 失去焦点时，自动将当前录入的键值提交保存
  const handleBlur = () => {
    commitChanges();
  };

  // 点击编辑图标：清空历史键位，开始监听键盘输入并聚焦到输入框
  const handleEditClick = () => {
    setEditingKeys([]);
    setIsEditing(true);
  };

  // 仅在编辑状态下，注册并启动全局快捷键捕获监听器
  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.focus();
    }
    // 捕获用户键盘按下的物理键名
    const clearShortcut = shortcutListener((pressedKeys, event) => {
      event.preventDefault();
      event.stopPropagation();
      setEditingKeys([...pressedKeys]);
    });

    return () => {
      // 退出编辑时必须注销全局监听器，以防影响网页本身的键盘交互
      clearShortcut();
    };
  }, [isEditing]);

  const displayValue = isEditing ? editingKeys : keys;
  // 将空格键等特异字符转换为直观文字说明 (如 " " 转成 "Space")，然后以 " + " 分隔拼接成可读组合键
  const formattedValue = displayValue
    .map((item) => (item === " " ? "Space" : item))
    .join(" + ");

  return (
    <Stack direction="row" alignItems="flex-start">
      <TextField
        size="small"
        label={label}
        name={label}
        value={formattedValue}
        fullWidth
        inputRef={inputRef}
        disabled={!isEditing}
        onBlur={handleBlur}
        helperText={isEditing ? i18n("pls_press_shortcut") : helperText}
      />
      {isEditing ? (
        // 编辑中，显示确认保存的 CheckIcon
        <IconButton onClick={commitChanges} color="primary">
          <CheckIcon />
        </IconButton>
      ) : (
        // 未编辑，显示铅笔 EditIcon 按钮
        <IconButton onClick={handleEditClick}>
          <EditIcon />
        </IconButton>
      )}
    </Stack>
  );
}
