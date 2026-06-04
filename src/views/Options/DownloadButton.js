import FileDownloadIcon from "@mui/icons-material/FileDownload";
import LoadingButton from "@mui/lab/LoadingButton";
import { useState } from "react";
import { kissLog } from "../../libs/log";
import { downloadBlobFile } from "../../libs/utils";

/**
 * 备份文件数据导出下载按钮组件 (带有加载态)
 *
 * @param {Object} props
 * @param {Function} props.handleData - 异步获取/生成待下载的 Blob 数据的回调函数
 * @param {string} props.text - 按钮文字展示内容
 * @param {string} props.fileName - 保存的文件名称
 */
export default function DownloadButton({ handleData, text, fileName }) {
  const [loading, setLoading] = useState(false);

  // 处理下载动作
  const handleClick = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      // 执行数据获取回调
      const data = await handleData();
      // 调用工具函数触发浏览器保存 Blob 文件动作
      downloadBlobFile(data, fileName);
    } catch (err) {
      kissLog("download", err);
    } finally {
      // REVIEW: 异步请求结束后的 setLoading 状态更新在组件卸载 (Unmount) 时未被阻断。如果备份数据文件很大，在处理 handleData 耗时期间用户关闭/切换了选项卡导致此组件被卸载，在 finally 块中继续执行 setLoading(false) 可能会抛出对卸载组件调用 state 修改的 warning。建议维护 active 标志在销毁时阻断状态更新。
      setLoading(false);
    }
  };

  return (
    <LoadingButton
      size="small"
      variant="outlined"
      onClick={handleClick}
      loading={loading}
      startIcon={<FileDownloadIcon />}
    >
      {text}
    </LoadingButton>
  );
}
