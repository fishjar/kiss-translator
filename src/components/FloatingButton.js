import { forwardRef } from "react";
import Fab from "@mui/material/Fab";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TranslateIcon from "@mui/icons-material/Translate";
import { DEFAULT_FAB, normalizeFabAppearance } from "../config/fab";

// Keep the content button and its settings preview visually identical.
const FloatingButton = forwardRef(function FloatingButton(
  { size, opensMenu = true, open = false, className = "", style, ...props },
  ref
) {
  const { size: buttonSize } = normalizeFabAppearance({ size });

  return (
    <Fab
      {...props}
      ref={ref}
      className={`kt-content-fab ${className}`.trim()}
      style={{
        "--kt-fab-size": `${buttonSize}px`,
        "--kt-fab-icon-size": `${Math.max(16, (buttonSize * 24) / DEFAULT_FAB.size)}px`,
        "--kt-fab-radius": `${(buttonSize * 16) / DEFAULT_FAB.size}px`,
        ...style,
      }}
    >
      {opensMenu ? (
        <SpeedDialIcon
          icon={<TranslateIcon />}
          openIcon={<CloseRoundedIcon />}
          open={open}
        />
      ) : (
        <TranslateIcon />
      )}
    </Fab>
  );
});

export default FloatingButton;
