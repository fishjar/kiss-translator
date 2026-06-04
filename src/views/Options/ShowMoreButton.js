import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";

/**
 * 可折叠的高级设置展开/折叠控制按钮
 *
 * @param {Object} props
 * @param {Function} props.onChange - 控制 showMore 状态改变的回调函数
 * @param {boolean} props.showMore - 是否展示更多高级配置
 */
export default function ShowMoreButton({ onChange, showMore }) {
  const i18n = useI18n();
  // 切换折叠显示状态
  const handleClick = () => {
    onChange((prev) => !prev);
  };

  if (showMore) {
    return (
      <Button
        size="small"
        variant="text"
        onClick={handleClick}
        startIcon={<ExpandLessIcon />}
      >
        {i18n("less")}
      </Button>
    );
  }

  return (
    <Button
      size="small"
      variant="text"
      onClick={handleClick}
      startIcon={<ExpandMoreIcon />}
    >
      {i18n("more")}
    </Button>
  );
}
