import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import { useI18n } from "../../hooks/I18n";
import DarkModeButton from "./DarkModeButton";
import Typography from "@mui/material/Typography";

/**
 * 设置页面的导航头部组件 (AppBar)
 *
 * @param {Object} props
 * @param {Function} props.onDrawerToggle - 点击菜单按钮切换侧边栏展开/收起的回调函数 (移动端临时抽屉)
 */
function Header(props) {
  const i18n = useI18n();
  const { onDrawerToggle } = props;

  return (
    <AppBar
      color="primary"
      position="sticky"
      sx={{
        zIndex: 1300, // 确保 Header 在侧边栏和抽屉之上的层级
      }}
    >
      <Toolbar variant="dense">
        {/* 仅在 sm 分批以下 (xs 移动端) 显示菜单图标按钮以展开临时 Navigator */}
        <Box sx={{ display: { sm: "none", xs: "block" } }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={onDrawerToggle}
            edge="start"
          >
            <MenuIcon />
          </IconButton>
        </Box>
        {/* 设置页左侧标题：点击可跳转回项目主页 */}
        <Typography component="div" sx={{ flexGrow: 1, fontWeight: "bold" }}>
          <Link
            underline="none"
            color="inherit"
            href={process.env.REACT_APP_HOMEPAGE}
            target="_blank"
          >{`${i18n("app_name")} v${process.env.REACT_APP_VERSION}`}</Link>
        </Typography>
        {/* 深色模式/浅色模式切换按钮 */}
        <DarkModeButton />
      </Toolbar>
    </AppBar>
  );
}

export default Header;
