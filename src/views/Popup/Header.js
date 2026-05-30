import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import HomeIcon from "@mui/icons-material/Home";
import Stack from "@mui/material/Stack";
// import DarkModeButton from "../Options/DarkModeButton";
import Typography from "@mui/material/Typography";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useI18n } from "../../hooks/I18n";

/**
 * Popup 弹窗页面头部组件
 *
 * @param {Object} props
 * @param {Function} [props.onClose] - 关闭弹窗的回调函数（仅在作为内嵌组件展示时有值）
 * @param {Function} props.toggleTab - 切换“网页翻译设置”与“文本翻译面板”的函数
 * @param {Function} props.openSeparateWindow - 在独立小窗口中打开翻译界面的函数
 */
export default function Header({ onClose, toggleTab, openSeparateWindow }) {
  const i18n = useI18n();

  // 打开项目主页/官方网站
  const handleHomepage = () => {
    window.open(process.env.REACT_APP_HOMEPAGE, "_blank");
  };

  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      spacing={2}
    >
      {/* 头部左侧：主页按钮与插件名称/版本号 */}
      <Stack direction="row" justifyContent="flex-start" alignItems="center">
        <IconButton onClick={handleHomepage}>
          <HomeIcon />
        </IconButton>
        <Typography
          component="div"
          sx={{
            userSelect: "none",
            WebkitUserSelect: "none",
            fontWeight: "bold",
          }}
        >
          {`${process.env.REACT_APP_NAME} v${process.env.REACT_APP_VERSION}`}
        </Typography>
      </Stack>

      {/* 头部右侧：根据 onClose 是否存在，渲染关闭按钮，或者功能控制按钮（切换面板、新窗口打开） */}
      {onClose ? (
        <IconButton
          onClick={() => {
            onClose();
          }}
        >
          <CloseIcon />
        </IconButton>
      ) : (
        <Stack
          direction="row"
          alignItems="center"
          title={i18n("toggle_transbox")}
        >
          {/* 切换到独立文本翻译输入框面板 */}
          <IconButton onClick={toggleTab}>
            <SyncAltIcon />
          </IconButton>
          {/* <DarkModeButton /> */}
          {/* 独立窗口打开 */}
          <IconButton
            onClick={openSeparateWindow}
            title={i18n("open_separate_window")}
          >
            <OpenInNewIcon />
          </IconButton>
        </Stack>
      )}
    </Stack>
  );
}
