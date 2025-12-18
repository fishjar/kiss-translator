import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import HomeIcon from "@mui/icons-material/Home";
import Stack from "@mui/material/Stack";
// import DarkModeButton from "../Options/DarkModeButton";
import Typography from "@mui/material/Typography";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useI18n } from "../../hooks/I18n";

export default function Header({ onClose, toggleTab, openSeparateWindow }) {
  const i18n = useI18n();
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
          <IconButton onClick={toggleTab}>
            <SyncAltIcon />
          </IconButton>
          {/* <DarkModeButton /> */}
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
