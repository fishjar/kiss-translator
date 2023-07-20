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
