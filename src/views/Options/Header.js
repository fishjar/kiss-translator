import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import { useI18n } from "../../hooks/I18n";
import DarkModeButton from "./DarkModeButton";
import Typography from "@mui/material/Typography";

function Header(props) {
  const i18n = useI18n();
  const { onDrawerToggle } = props;

  return (
    <AppBar
      color="primary"
      position="sticky"
      sx={{
        zIndex: 1300,
      }}
    >
      <Toolbar variant="dense">
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
        <Typography component="div" sx={{ flexGrow: 1, fontWeight: "bold" }}>
          <Link
            underline="none"
            color="inherit"
            href={process.env.REACT_APP_HOMEPAGE}
            target="_blank"
          >{`${i18n("app_name")} v${process.env.REACT_APP_VERSION}`}</Link>
        </Typography>
        <DarkModeButton />
      </Toolbar>
    </AppBar>
  );
}

export default Header;
