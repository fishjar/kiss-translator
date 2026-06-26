import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import useMediaQuery from "@mui/material/useMediaQuery";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Navigator from "./Navigator";
import Header from "./Header";
import { useTheme } from "@mui/material/styles";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import { useI18n } from "../../hooks/I18n";

/**
 * 设置中心后台页面的通风格子骨架布局组件 (Layout)
 */
export default function Layout() {
  const navWidth = 256; // 左侧 Navigator 导航宽度为 256px
  const location = useLocation();
  const theme = useTheme();
  // 移动端下控制临时侧边导航栏抽屉的展开状态
  const [open, setOpen] = useState(false);
  // 匹配屏幕宽度大于等于 sm 的桌面设备环境
  const isSm = useMediaQuery(theme.breakpoints.up("sm"));

  const i18n = useI18n();
  const [latestVersion, setLatestVersion] = useState("");

  useEffect(() => {
    fetch(`${process.env.REACT_APP_VERSION_URL}?t=${Date.now()}`)
      .then((res) => res.text())
      .then((text) => {
        const lv = text.trim();
        const currentVersion = process.env.REACT_APP_VERSION;
        if (lv && currentVersion && lv !== currentVersion) {
          setLatestVersion(lv);
        }
      })
      .catch((err) => console.error("fetch version error:", err));
  }, []);

  // 展开或收起侧边栏
  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  // 路由/导航路径一旦发生变化，立即关闭侧边栏 (主要适配移动端体验)
  useEffect(() => {
    setOpen(false);
  }, [location]);

  return (
    <Box>
      {/* 浏览器默认样式归一化 */}
      <CssBaseline />
      {/* 设置页公共导航头部 */}
      <Header onDrawerToggle={handleDrawerToggle} />

      <Box sx={{ display: "flex" }}>
        {/* 左侧导航栏容器 */}
        <Box
          component="nav"
          sx={{ width: { sm: navWidth }, flexShrink: { sm: 0 } }}
        >
          {/* 在大屏下是常驻固定栏 (permanent)，在小屏下为弹出临时抽屉 (temporary) */}
          <Navigator
            PaperProps={{ style: { width: navWidth } }}
            variant={isSm ? "permanent" : "temporary"}
            open={isSm ? true : open}
            onClose={handleDrawerToggle}
          />
        </Box>

        {/* 右侧主设置面板内容渲染区域 (使用 react-router-dom 的 Outlet 渲染子路由) */}
        <Box component="main" sx={{ flex: 1, p: 2, width: "100%" }}>
          {latestVersion && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {i18n("version_warning")
                .replace("{0}", process.env.REACT_APP_VERSION)
                .replace("{1}", latestVersion)}
              <Link
                href={process.env.REACT_APP_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {i18n("download_update")}
              </Link>
            </Alert>
          )}
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
