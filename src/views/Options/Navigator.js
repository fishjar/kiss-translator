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
import InputIcon from "@mui/icons-material/Input";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import EventNoteIcon from "@mui/icons-material/EventNote";
import MouseIcon from "@mui/icons-material/Mouse";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import FormatColorText from "@mui/icons-material/FormatColorText";

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
      id: "apis_setting",
      label: i18n("apis_setting"),
      url: "/apis",
      icon: <ApiIcon />,
    },
    {
      id: "styles_setting",
      label: i18n("styles_setting"),
      url: "/styles",
      icon: <FormatColorText />,
    },
    {
      id: "sync",
      label: i18n("sync_setting"),
      url: "/sync",
      icon: <SyncIcon />,
    },
    {
      id: "input_translate",
      label: i18n("input_translate"),
      url: "/input",
      icon: <InputIcon />,
    },
    {
      id: "selection_translate",
      label: i18n("selection_translate"),
      url: "/tranbox",
      icon: <SelectAllIcon />,
    },
    {
      id: "mousehover_translate",
      label: i18n("mousehover_translate"),
      url: "/mousehover",
      icon: <MouseIcon />,
    },
    {
      id: "subtitle_translate",
      label: i18n("subtitle_translate"),
      url: "/subtitle",
      icon: <SubtitlesIcon />,
    },
    {
      id: "words",
      label: i18n("favorite_words"),
      url: "/words",
      icon: <EventNoteIcon />,
    },
    {
      id: "playground",
      label: "Playground",
      url: "/playground",
      icon: <EventNoteIcon />,
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
