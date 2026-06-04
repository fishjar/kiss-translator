import { useRef } from "react";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { useI18n } from "../../hooks/I18n";
import Button from "@mui/material/Button";

/**
 * 统一的本地备份/配置规则导入上传按钮组件
 *
 * @param {Object} props
 * @param {Function} props.handleImport - 读取文件数据内容后的解析导入回调
 * @param {string} props.text - 按钮上的提示文案
 * @param {string} [props.fileType="json"] - 限制的文件 MIME/类型匹配
 * @param {Array} [props.fileExts=[".json"]] - 文件浏览器支持的选择文件后缀列表
 */
export default function UploadButton({
  handleImport,
  text,
  fileType = "json",
  fileExts = [".json"],
}) {
  const i18n = useI18n();
  const inputRef = useRef(null);

  // 触发隐藏的 file input 点击，弹出系统的文件选择对话框
  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.click();
      inputRef.current.value = null; // 重置以支持多次重复上传相同文件时触发 onChange
    }
  };

  // 选择文件后触发的读取逻辑
  const onChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      return;
    }

    // 粗略的文件类型/后缀校验
    if (!file.type.includes(fileType)) {
      alert(i18n("error_wrong_file_type"));
      return;
    }

    // 使用 FileReader 异步读取文本数据并传回回调函数
    const reader = new FileReader();
    reader.onload = async (e) => {
      handleImport(e.target.result);
    };
    reader.readAsText(file);
  };

  return (
    <Button
      size="small"
      variant="outlined"
      onClick={handleClick}
      startIcon={<FileUploadIcon />}
    >
      {text}
      {/* 隐藏的 input 类型为 file */}
      <input
        type="file"
        accept={fileExts.join(", ")}
        ref={inputRef}
        onChange={onChange}
        hidden
      />
    </Button>
  );
}
