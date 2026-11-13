import RateReviewRoundedIcon from "@mui/icons-material/RateReviewRounded";
import VolunteerActivismRoundedIcon from "@mui/icons-material/VolunteerActivismRounded";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import { REVIEW_URL, SUPPORT_URL } from "./supportLinks";
import PopupMenu from "./PopupMenu";
import IconButton from "@mui/material/IconButton";
import { useId, useState } from "react";
import { useI18n } from "../../hooks/I18n";

export default function SupportButton() {
  const i18n = useI18n();
  const menuId = useId();
  const [supportAnchor, setSupportAnchor] = useState(null);
  const closeMenu = () => {
    supportAnchor?.focus();
    setSupportAnchor(null);
  };
  const openSupportLink = (url) => {
    closeMenu();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <span
      className="kt-popup-header__support"
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <IconButton
        className="kt-popup-header__sponsor"
        title={i18n("popup_support")}
        aria-label={i18n("popup_support")}
        aria-controls={supportAnchor ? menuId : undefined}
        aria-expanded={supportAnchor ? "true" : undefined}
        aria-haspopup="menu"
        onClick={(event) => setSupportAnchor(event.currentTarget)}
      >
        <VolunteerActivismRoundedIcon />
      </IconButton>
      <PopupMenu
        id={menuId}
        anchorEl={supportAnchor}
        open={Boolean(supportAnchor)}
        onClose={closeMenu}
        ariaLabel={i18n("popup_support")}
        align="right"
        estimatedHeight={96}
      >
        <MenuItem onClick={() => openSupportLink(REVIEW_URL)}>
          <ListItemIcon>
            <RateReviewRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{i18n("comment_support")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => openSupportLink(SUPPORT_URL)}>
          <ListItemIcon>
            <VolunteerActivismRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{i18n("appreciate_support")}</ListItemText>
        </MenuItem>
      </PopupMenu>
    </span>
  );
}
