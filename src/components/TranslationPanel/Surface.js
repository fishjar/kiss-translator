import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { TRANSLATION_PANEL_STYLES } from "./styles";

/** Shared panel appearance; each host owns its positioning and available space. */
export default function TranslationPanelSurface({
  header,
  children,
  panelRef,
  width = "100%",
  contentHeight,
  autoHeight = false,
  embedded = false,
  className = "",
  bodyClassName = "",
}) {
  return (
    <Paper
      ref={panelRef}
      className={`kt-translation-panel ${
        embedded ? "kt-translation-panel--embedded" : ""
      } ${className}`}
      elevation={0}
      sx={{ width, maxWidth: "100%", minWidth: 0 }}
    >
      <style>{TRANSLATION_PANEL_STYLES}</style>
      {header}
      <Box
        className={`kt-translation-panel__body ${bodyClassName}`}
        sx={
          contentHeight === undefined
            ? undefined
            : autoHeight
              ? { maxHeight: contentHeight, overflowY: "auto" }
              : { height: contentHeight, overflowY: "auto" }
        }
      >
        {children}
      </Box>
    </Paper>
  );
}
