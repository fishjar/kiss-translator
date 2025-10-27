import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import useMediaQuery from "@mui/material/useMediaQuery";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Navigator from "./Navigator";
import Header from "./Header";
import { useTheme } from "@mui/material/styles";

export default function Layout() {
  const navWidth = 256;
  const location = useLocation();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const isSm = useMediaQuery(theme.breakpoints.up("sm"));

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  useEffect(() => {
    setOpen(false);
  }, [location]);

  return (
    <Box>
      <CssBaseline />
      <Header onDrawerToggle={handleDrawerToggle} />

      <Box sx={{ display: "flex" }}>
        <Box
          component="nav"
          sx={{ width: { sm: navWidth }, flexShrink: { sm: 0 } }}
        >
          <Navigator
            PaperProps={{ style: { width: navWidth } }}
            variant={isSm ? "permanent" : "temporary"}
            open={isSm ? true : open}
            onClose={handleDrawerToggle}
          />
        </Box>

        <Box component="main" sx={{ flex: 1, p: 2, width: "100%" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
