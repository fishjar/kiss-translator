import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import { NavLink, useMatch } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import InfoIcon from "@mui/icons-material/Info";
import DesignServicesIcon from "@mui/icons-material/DesignServices";
import { useI18n } from "../../hooks/I18n";
import SyncIcon from "@mui/icons-material/Sync";
import ApiIcon from "@mui/icons-material/Api";
import SendTimeExtensionIcon from "@mui/icons-material/SendTimeExtension";
import InputIcon from "@mui/icons-material/Input";

function LinkItem({ label, url, icon }) {
  const match = useMatch(url);
  return (
    <ListItemButton component={NavLink} to={url} selected={!!match}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText>{label}</ListItemText>
    </ListItemButton>
  );
}

export default function Navigator(props) {
  const i18n = useI18n();
  const memus = [
    {
      id: "basic_setting",
      label: i18n("basic_setting"),
      url: "/",
      icon: <SettingsIcon />,
    },
    {
      id: "rules_setting",
      label: i18n("rules_setting"),
      url: "/rules",
      icon: <DesignServicesIcon />,
    },
    {
      id: "input_setting",
      label: i18n("input_setting"),
      url: "/input",
      icon: <InputIcon />,
    },
    {
      id: "apis_setting",
      label: i18n("apis_setting"),
      url: "/apis",
      icon: <ApiIcon />,
    },
    {
      id: "sync",
      label: i18n("sync_setting"),
      url: "/sync",
      icon: <SyncIcon />,
    },
    {
      id: "webfix",
      label: i18n("patch_setting"),
      url: "/webfix",
      icon: <SendTimeExtensionIcon />,
    },
    { id: "about", label: i18n("about"), url: "/about", icon: <InfoIcon /> },
  ];
  return (
    <Drawer {...props}>
      <Toolbar variant="dense" />
      <List component="nav">
        {memus.map(({ id, label, url, icon }) => (
          <LinkItem key={id} label={label} url={url} icon={icon} />
        ))}
      </List>
    </Drawer>
  );
}
